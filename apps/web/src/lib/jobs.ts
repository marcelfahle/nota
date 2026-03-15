import { renderToBuffer } from "@react-pdf/renderer";
import { and, asc, eq, isNull, lt, lte, or } from "drizzle-orm";

import { InvoicePdf } from "@/components/invoice-pdf";
import { InvoiceSentEmail } from "@/emails/invoice-sent";
import { PaymentReceivedEmail } from "@/emails/payment-received";
import { APP_NAME, DEFAULT_FROM_EMAIL } from "@/lib/app-brand";
import { getPdfLogoSrc } from "@/lib/branding";
import { db } from "@/lib/db";
import {
  activityLog,
  bankAccounts,
  clients,
  invoices,
  jobs,
  lineItems,
  orgs,
  users,
} from "@/lib/db/schema";
import { getResend } from "@/lib/email";
import { getEmailEnv } from "@/lib/env";

const JOB_LOCK_TIMEOUT_MS = 1000 * 60 * 10;

type EmailJobType =
  | "send_invoice_email"
  | "send_invoice_reminder_email"
  | "send_payment_received_email";

type EmailJobPayload = {
  invoiceId: string;
};

function getRetryDelayMs(attempts: number) {
  return Math.min(60, 5 * 2 ** Math.max(attempts - 1, 0)) * 60 * 1000;
}

function parseEmailJobPayload(payload: Record<string, unknown>): EmailJobPayload | null {
  return typeof payload.invoiceId === "string" ? { invoiceId: payload.invoiceId } : null;
}

async function getInvoiceEmailContext(invoiceId: string) {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1);
  if (!client) {
    throw new Error("Client not found");
  }

  if (!invoice.orgId) {
    throw new Error("Invoice has no organization");
  }

  const [organization] = await db.select().from(orgs).where(eq(orgs.id, invoice.orgId)).limit(1);
  if (!organization) {
    throw new Error("Organization not found");
  }

  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, invoiceId))
    .orderBy(asc(lineItems.sortOrder));

  let bankDetails: string | null = null;
  if (client.bankAccountId) {
    const [assignedBankAccount] = await db
      .select({ details: bankAccounts.details })
      .from(bankAccounts)
      .where(
        and(eq(bankAccounts.id, client.bankAccountId), eq(bankAccounts.orgId, organization.id)),
      )
      .limit(1);
    bankDetails = assignedBankAccount?.details ?? null;
  }

  if (!bankDetails) {
    const [defaultBankAccount] = await db
      .select({ details: bankAccounts.details })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.orgId, organization.id), eq(bankAccounts.isDefault, true)))
      .limit(1);
    bankDetails = defaultBankAccount?.details ?? null;
  }

  return {
    bankDetails,
    client,
    invoice,
    items,
    logoSrc: await getPdfLogoSrc(organization.logoUrl),
    org: organization,
  };
}

async function sendInvoiceEmail(invoiceId: string) {
  const { bankDetails, client, invoice, items, logoSrc, org } =
    await getInvoiceEmailContext(invoiceId);

  if (!invoice.stripePaymentLinkUrl) {
    throw new Error("Invoice has no Stripe payment link");
  }

  const pdfBuffer = await renderToBuffer(
    InvoicePdf({
      business: {
        address: org.businessAddress,
        bankDetails,
        logoSrc,
        name: org.businessName ?? org.name,
        vatNumber: org.vatNumber,
      },
      client: {
        address: client.address,
        company: client.company,
        email: client.email,
        name: client.name,
        vatNumber: client.vatNumber,
      },
      invoice: {
        currency: invoice.currency ?? "EUR",
        dueAt: invoice.dueAt,
        issuedAt: invoice.issuedAt,
        lineItems: items.map((item) => ({
          amount: item.amount,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        notes: invoice.notes,
        number: invoice.number,
        paymentLinkUrl: invoice.stripePaymentLinkUrl,
        reverseCharge: invoice.reverseCharge,
        subtotal: invoice.subtotal ?? "0.00",
        taxAmount: invoice.taxAmount ?? "0.00",
        taxRate: invoice.taxRate ?? "0.00",
        total: invoice.total ?? "0.00",
      },
    }),
  );

  const fromEmail = getEmailEnv().RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL;
  const businessName = org.businessName ?? org.name ?? APP_NAME;

  await getResend().emails.send({
    attachments: [
      {
        content: pdfBuffer.toString("base64"),
        filename: `${invoice.number.replaceAll("/", "-")}.pdf`,
      },
    ],
    from: fromEmail,
    react: InvoiceSentEmail({
      businessName,
      clientName: client.name,
      currency: invoice.currency ?? "EUR",
      dueAt: invoice.dueAt,
      invoiceNumber: invoice.number,
      paymentLinkUrl: invoice.stripePaymentLinkUrl,
      total: invoice.total ?? "0",
    }),
    subject: `Invoice ${invoice.number} from ${businessName}`,
    to: [client.email],
  });
}

async function sendInvoiceReminderEmail(invoiceId: string) {
  const { client, invoice, org } = await getInvoiceEmailContext(invoiceId);

  if (!invoice.stripePaymentLinkUrl) {
    throw new Error("Invoice has no Stripe payment link");
  }

  const fromEmail = getEmailEnv().RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL;
  const businessName = org.businessName ?? org.name ?? APP_NAME;

  await getResend().emails.send({
    from: fromEmail,
    react: InvoiceSentEmail({
      businessName,
      clientName: client.name,
      currency: invoice.currency ?? "EUR",
      dueAt: invoice.dueAt,
      invoiceNumber: invoice.number,
      paymentLinkUrl: invoice.stripePaymentLinkUrl,
      reminder: true,
      total: invoice.total ?? "0",
    }),
    subject: `Reminder: Invoice ${invoice.number} — ${businessName}`,
    to: [client.email],
  });

  await db.insert(activityLog).values({
    action: "reminder_sent",
    invoiceId,
  });
}

async function sendPaymentReceivedEmail(invoiceId: string) {
  const [invoice] = await db
    .select({
      clientId: invoices.clientId,
      currency: invoices.currency,
      number: invoices.number,
      paidAt: invoices.paidAt,
      total: invoices.total,
      userId: invoices.userId,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const [client] = await db
    .select({ name: clients.name })
    .from(clients)
    .where(eq(clients.id, invoice.clientId))
    .limit(1);

  const [user] = await db
    .select({ businessName: users.businessName, email: users.email })
    .from(users)
    .where(eq(users.id, invoice.userId))
    .limit(1);

  if (!user) {
    throw new Error("User not found");
  }

  const fromEmail = getEmailEnv().RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL;

  await getResend().emails.send({
    from: fromEmail,
    react: PaymentReceivedEmail({
      clientName: client?.name ?? "Client",
      currency: invoice.currency ?? "EUR",
      invoiceNumber: invoice.number,
      paidAt: invoice.paidAt ?? new Date().toISOString().split("T")[0],
      total: invoice.total ?? "0",
    }),
    subject: `Payment received: ${invoice.number}`,
    to: [user.email],
  });
}

async function performEmailJob(type: EmailJobType, payload: EmailJobPayload) {
  switch (type) {
    case "send_invoice_email":
      await sendInvoiceEmail(payload.invoiceId);
      return;
    case "send_invoice_reminder_email":
      await sendInvoiceReminderEmail(payload.invoiceId);
      return;
    case "send_payment_received_email":
      await sendPaymentReceivedEmail(payload.invoiceId);
      return;
  }
}

async function claimJobs(limit: number) {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - JOB_LOCK_TIMEOUT_MS);
  const candidates = await db
    .select()
    .from(jobs)
    .where(
      and(
        lte(jobs.runAt, now),
        or(
          eq(jobs.status, "pending"),
          and(eq(jobs.status, "processing"), lt(jobs.lockedAt, staleCutoff)),
        ),
      ),
    )
    .orderBy(asc(jobs.runAt), asc(jobs.createdAt))
    .limit(limit);

  const claimed = [];
  for (const job of candidates) {
    const [lockedJob] = await db
      .update(jobs)
      .set({
        lockedAt: now,
        status: "processing",
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, job.id),
          eq(jobs.status, job.status),
          job.lockedAt ? eq(jobs.lockedAt, job.lockedAt) : isNull(jobs.lockedAt),
        ),
      )
      .returning();

    if (lockedJob) {
      claimed.push(lockedJob);
    }
  }

  return claimed;
}

export async function processPendingEmailJobs(limit = 10) {
  const claimedJobs = await claimJobs(limit);
  let completed = 0;
  let dead = 0;
  let retried = 0;

  for (const job of claimedJobs) {
    const payload = parseEmailJobPayload(job.payload);
    if (!payload) {
      await db
        .update(jobs)
        .set({
          lastError: "Invalid job payload",
          lockedAt: null,
          status: "dead",
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
      dead += 1;
      continue;
    }

    try {
      await performEmailJob(job.type as EmailJobType, payload);
      await db
        .update(jobs)
        .set({
          lastError: null,
          lockedAt: null,
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
      completed += 1;
    } catch (error) {
      const nextAttempts = job.attempts + 1;
      const shouldDeadLetter = nextAttempts >= job.maxAttempts;

      await db
        .update(jobs)
        .set({
          attempts: nextAttempts,
          lastError: error instanceof Error ? error.message : "Unknown job error",
          lockedAt: null,
          runAt: new Date(Date.now() + getRetryDelayMs(nextAttempts)),
          status: shouldDeadLetter ? "dead" : "pending",
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));

      if (shouldDeadLetter) {
        dead += 1;
      } else {
        retried += 1;
      }
    }
  }

  return {
    claimed: claimedJobs.length,
    completed,
    dead,
    retried,
  };
}
