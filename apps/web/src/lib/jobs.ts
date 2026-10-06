import { renderToBuffer } from "@react-pdf/renderer";
import { and, asc, eq, isNull, lt, lte, or } from "drizzle-orm";

import { InvoicePdf } from "@/components/invoice-pdf";
import { InvoiceSentEmail } from "@/emails/invoice-sent";
import { PaymentReceivedEmail } from "@/emails/payment-received";
import { APP_NAME } from "@/lib/app-brand";
import { formatOrgAddress, getPdfLogoSrc } from "@/lib/branding";
import { db } from "@/lib/db";
import {
  activityLog,
  bankAccounts,
  clients,
  invoices,
  jobs,
  lineItems,
  orgs,
  proposals,
  users,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { getAppEnv } from "@/lib/env";
import { buildInvoiceFilename } from "@/lib/invoice-filename";
import { reminderPayloadSchema } from "@/lib/proposal-service";
import { invoiceTaxIdentifier } from "@/lib/tax-identifier";

const JOB_LOCK_TIMEOUT_MS = 1000 * 60 * 10;

type EmailJobType =
  | "send_invoice_email"
  | "send_invoice_test_email"
  | "send_invoice_reminder_email"
  | "send_payment_received_email";

type EmailJobPayload = {
  invoiceId: string;
  proposalId?: string;
  recipient?: string;
  reminder?: ReturnType<typeof reminderPayloadSchema.parse>;
  source?: "api" | "chat" | "cli" | "mcp" | "system" | "web";
  sourceClient?: string | null;
};

function getRetryDelayMs(attempts: number) {
  return Math.min(60, 5 * 2 ** Math.max(attempts - 1, 0)) * 60 * 1000;
}

function parseEmailJobPayload(payload: Record<string, unknown>): EmailJobPayload | null {
  if (typeof payload.invoiceId !== "string") {
    return null;
  }
  const reminder = reminderPayloadSchema.safeParse(payload.reminder);
  if (typeof payload.proposalId === "string" && !reminder.success) {
    return null;
  }
  return {
    invoiceId: payload.invoiceId,
    proposalId: typeof payload.proposalId === "string" ? payload.proposalId : undefined,
    recipient: typeof payload.recipient === "string" ? payload.recipient : undefined,
    reminder: reminder.success ? reminder.data : undefined,
    source:
      typeof payload.source === "string" &&
      ["api", "chat", "cli", "mcp", "system", "web"].includes(payload.source)
        ? (payload.source as EmailJobPayload["source"])
        : undefined,
    sourceClient: typeof payload.sourceClient === "string" ? payload.sourceClient : null,
  };
}

function getPublicInvoiceUrl(token: string | null) {
  return token ? new URL(`/i/${encodeURIComponent(token)}`, getAppEnv().APP_URL).toString() : null;
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

async function sendInvoiceEmail(invoiceId: string, recipient?: string, idempotencyKey?: string) {
  const { bankDetails, client, invoice, items, logoSrc, org } =
    await getInvoiceEmailContext(invoiceId);

  const pdfBuffer = await renderToBuffer(
    InvoicePdf({
      business: {
        address: formatOrgAddress(org),
        bankDetails,
        logoSrc,
        name: org.legalName ?? org.businessName ?? org.name,
        taxIdentifier: invoiceTaxIdentifier(invoice.status, invoice.sellerTaxIdentifier, org),
      },
      client: {
        address: client.address,
        company: client.company,
        email: client.email,
        name: client.name,
        taxIdentifier: invoiceTaxIdentifier(invoice.status, invoice.clientTaxIdentifier, client),
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

  const businessName = org.legalName ?? org.businessName ?? org.name ?? APP_NAME;

  await sendEmail({
    attachments: [
      {
        content: pdfBuffer,
        contentType: "application/pdf",
        filename: buildInvoiceFilename(
          {
            clientName: client.name,
            issuedAt: invoice.issuedAt,
            lineItems: items,
            number: invoice.number,
          },
          "pdf",
        ),
      },
    ],
    idempotencyKey,
    react: InvoiceSentEmail({
      bankDetails,
      businessName,
      clientName: client.name,
      currency: invoice.currency ?? "EUR",
      dueAt: invoice.dueAt,
      invoiceNumber: invoice.number,
      invoiceUrl: getPublicInvoiceUrl(invoice.publicToken),
      paymentLinkUrl: invoice.stripePaymentLinkUrl,
      testCopy: Boolean(recipient),
      total: invoice.total ?? "0",
    }),
    // A copy sent to the sender is labelled as one in the subject and the body.
    subject: recipient
      ? `Test copy: Invoice ${invoice.number} from ${businessName}`
      : `Invoice ${invoice.number} from ${businessName}`,
    to: [recipient ?? client.email],
  });
}

async function sendInvoiceReminderEmail(
  invoiceId: string,
  stored?: ReturnType<typeof reminderPayloadSchema.parse>,
  job: Pick<EmailJobPayload, "proposalId" | "source" | "sourceClient"> = {},
  idempotencyKey?: string,
) {
  if (stored) {
    const [[invoice], [proposal]] = await Promise.all([
      db
        .select({
          publicToken: invoices.publicToken,
          revision: invoices.revision,
          status: invoices.status,
        })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1),
      job.proposalId
        ? db
            .select({ invoiceRevision: proposals.invoiceRevision })
            .from(proposals)
            .where(eq(proposals.id, job.proposalId))
            .limit(1)
        : Promise.resolve([]),
    ]);
    if (
      !invoice ||
      !proposal ||
      invoice.revision !== proposal.invoiceRevision ||
      !["sent", "overdue"].includes(invoice.status ?? "")
    ) {
      if (job.proposalId) {
        await db
          .update(proposals)
          .set({ status: "expired" })
          .where(eq(proposals.id, job.proposalId));
      }
      return;
    }
    await sendEmail({
      idempotencyKey,
      react: InvoiceSentEmail({
        businessName: stored.businessName,
        clientName: stored.clientName,
        currency: stored.currency,
        dueAt: stored.dueAt,
        invoiceNumber: stored.invoiceNumber,
        invoiceUrl: getPublicInvoiceUrl(invoice.publicToken),
        paymentLinkUrl: stored.paymentLinkUrl,
        reminder: true,
        total: stored.total,
      }),
      subject: stored.subject,
      to: [stored.to],
    });
    await db.insert(activityLog).values({
      action: "reminder_sent",
      invoiceId,
      source: job.source ?? "system",
      sourceClient: job.sourceClient,
    });
    return;
  }
  const { bankDetails, client, invoice, org } = await getInvoiceEmailContext(invoiceId);

  const businessName = org.legalName ?? org.businessName ?? org.name ?? APP_NAME;

  await sendEmail({
    idempotencyKey,
    react: InvoiceSentEmail({
      bankDetails,
      businessName,
      clientName: client.name,
      currency: invoice.currency ?? "EUR",
      dueAt: invoice.dueAt,
      invoiceNumber: invoice.number,
      invoiceUrl: getPublicInvoiceUrl(invoice.publicToken),
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
    source: job.source ?? "system",
    sourceClient: job.sourceClient,
  });
}

async function sendPaymentReceivedEmail(invoiceId: string, idempotencyKey?: string) {
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

  await sendEmail({
    idempotencyKey,
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

async function performEmailJob(type: EmailJobType, payload: EmailJobPayload, jobId: string) {
  switch (type) {
    case "send_invoice_email":
      await sendInvoiceEmail(payload.invoiceId, undefined, jobId);
      return;
    case "send_invoice_test_email":
      if (!payload.recipient) {
        throw new Error("Test invoice recipient is missing");
      }
      await sendInvoiceEmail(payload.invoiceId, payload.recipient, jobId);
      return;
    case "send_invoice_reminder_email":
      await sendInvoiceReminderEmail(payload.invoiceId, payload.reminder, payload, jobId);
      return;
    case "send_payment_received_email":
      await sendPaymentReceivedEmail(payload.invoiceId, jobId);
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
      await performEmailJob(job.type as EmailJobType, payload, job.id);
      await db
        .update(jobs)
        .set({
          lastError: null,
          lockedAt: null,
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
      if (payload.proposalId) {
        await db
          .update(proposals)
          .set({ status: "executed" })
          .where(and(eq(proposals.id, payload.proposalId), eq(proposals.status, "approved")));
      }
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
