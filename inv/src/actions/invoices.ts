"use server";

import { renderToBuffer } from "@react-pdf/renderer";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { InvoicePdf } from "@/components/invoice-pdf";
import { InvoiceSentEmail } from "@/emails/invoice-sent";
import { getCurrentUser } from "@/lib/auth";
import { getPdfLogoSrc } from "@/lib/branding";
import { db } from "@/lib/db";
import { activityLog, bankAccounts, clients, invoices, lineItems, users } from "@/lib/db/schema";
import { resend } from "@/lib/email";
import { getEmailEnv } from "@/lib/env";
import { formatInvoiceNumber } from "@/lib/invoice-number";
import { createPaymentLink, deactivatePaymentLink } from "@/lib/stripe";

const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unitPrice: z.coerce.number().min(0, "Unit price must be non-negative"),
});

const invoiceSchema = z.object({
  clientId: z.string().uuid("Invalid client"),
  currency: z.string().default("EUR"),
  dueAt: z.string().min(1, "Due date is required"),
  internalNotes: z.string().optional(),
  issuedAt: z.string().min(1, "Issue date is required"),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
  notes: z.string().optional(),
  reverseCharge: z.string().default("false"),
  taxRate: z.coerce.number().min(0).max(100).default(0),
});

const REMINDABLE_STATUSES = new Set(["sent", "overdue"]);

function calculateTotals(items: Array<{ quantity: number; unitPrice: number }>, taxRate: number) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  return {
    subtotal: subtotal.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    taxRate: taxRate.toFixed(2),
    total: total.toFixed(2),
  };
}

function parseInvoiceFormData(formData: FormData) {
  return {
    clientId: formData.get("clientId") as string,
    currency: (formData.get("currency") as string) || "EUR",
    dueAt: formData.get("dueAt") as string,
    internalNotes: (formData.get("internalNotes") as string) || undefined,
    issuedAt: formData.get("issuedAt") as string,
    lineItems: JSON.parse((formData.get("lineItems") as string) || "[]"),
    notes: (formData.get("notes") as string) || undefined,
    reverseCharge: formData.get("reverseCharge") === "true" ? "true" : "false",
    taxRate: formData.get("taxRate") as string,
  };
}

async function getOwnedInvoice(userId: string, invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)))
    .limit(1);

  return invoice ?? null;
}

async function getOwnedClient(userId: string, clientId: string) {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.userId, userId)))
    .limit(1);

  return client ?? null;
}

async function hasSentActivity(invoiceId: string) {
  const [entry] = await db
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(and(eq(activityLog.invoiceId, invoiceId), eq(activityLog.action, "sent")))
    .limit(1);

  return Boolean(entry);
}

export async function createInvoice(
  _prevState: { error?: string; invoiceId?: string; success?: boolean } | null,
  formData: FormData,
) {
  const result = invoiceSchema.safeParse(parseInvoiceFormData(formData));
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const user = await getCurrentUser();
  const userId = user.id;
  const { lineItems: items, taxRate, ...invoiceData } = result.data;
  const totals = calculateTotals(items, taxRate);
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, invoiceData.clientId), eq(clients.userId, userId)))
    .limit(1);

  if (!client) {
    return { error: "Client not found" };
  }

  const inserted = await db.transaction(async (tx) => {
    // Generate invoice number atomically
    const [user] = await tx
      .select({
        invoiceDigits: users.invoiceDigits,
        invoicePrefix: users.invoicePrefix,
        invoiceSeparator: users.invoiceSeparator,
        nextInvoiceNumber: users.nextInvoiceNumber,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const num = user.nextInvoiceNumber || 1;
    const number = formatInvoiceNumber({
      digits: user.invoiceDigits,
      number: num,
      prefix: user.invoicePrefix || "",
      separator: user.invoiceSeparator,
    });

    await tx
      .update(users)
      .set({ nextInvoiceNumber: num + 1 })
      .where(eq(users.id, userId));

    // Insert invoice
    const [inv] = await tx
      .insert(invoices)
      .values({
        userId,
        ...invoiceData,
        number,
        ...totals,
      })
      .returning({ id: invoices.id });

    // Insert line items
    await tx.insert(lineItems).values(
      items.map((item, index) => ({
        amount: (item.quantity * item.unitPrice).toFixed(2),
        description: item.description,
        invoiceId: inv.id,
        quantity: item.quantity.toFixed(2),
        sortOrder: index,
        unitPrice: item.unitPrice.toFixed(2),
      })),
    );

    // Log activity
    await tx.insert(activityLog).values({
      action: "created",
      invoiceId: inv.id,
    });

    return inv;
  });

  revalidatePath("/invoices");
  return { invoiceId: inserted.id, success: true };
}

export async function updateInvoice(
  invoiceId: string,
  _prevState: { error?: string; invoiceId?: string; success?: boolean } | null,
  formData: FormData,
) {
  const result = invoiceSchema.safeParse(parseInvoiceFormData(formData));
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const user = await getCurrentUser();
  const invoice = await getOwnedInvoice(user.id, invoiceId);

  if (!invoice) {
    return { error: "Invoice not found" };
  }

  if (invoice.status !== "draft") {
    return { error: "Only draft invoices can be edited" };
  }

  const { lineItems: items, taxRate, ...invoiceData } = result.data;
  const totals = calculateTotals(items, taxRate);
  const client = await getOwnedClient(user.id, invoiceData.clientId);

  if (!client) {
    return { error: "Client not found" };
  }

  await db.transaction(async (tx) => {
    // Update invoice
    await tx
      .update(invoices)
      .set({
        ...invoiceData,
        ...totals,
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, user.id)));

    // Replace line items: delete old, insert new
    await tx.delete(lineItems).where(eq(lineItems.invoiceId, invoiceId));

    await tx.insert(lineItems).values(
      items.map((item, index) => ({
        amount: (item.quantity * item.unitPrice).toFixed(2),
        description: item.description,
        invoiceId,
        quantity: item.quantity.toFixed(2),
        sortOrder: index,
        unitPrice: item.unitPrice.toFixed(2),
      })),
    );
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { invoiceId, success: true };
}

export async function deleteInvoice(invoiceId: string) {
  const user = await getCurrentUser();
  const invoice = await getOwnedInvoice(user.id, invoiceId);

  if (!invoice) {
    return { error: "Invoice not found" };
  }

  if (invoice.status !== "draft") {
    return { error: "Only draft invoices can be deleted" };
  }

  await db.delete(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.userId, user.id)));
  revalidatePath("/invoices");

  return { success: true };
}

export async function sendInvoice(invoiceId: string) {
  const user = await getCurrentUser();

  // Step 1: Query invoice with client and line items
  const existingInvoice = await getOwnedInvoice(user.id, invoiceId);
  if (!existingInvoice) {
    return { error: "Invoice not found" };
  }

  if (
    (existingInvoice.status === "sent" || existingInvoice.status === "overdue") &&
    existingInvoice.stripePaymentLinkId &&
    existingInvoice.stripePaymentLinkUrl &&
    (await hasSentActivity(invoiceId))
  ) {
    return { success: true };
  }

  if (existingInvoice.status !== "draft") {
    return { error: "Only draft invoices can be sent" };
  }

  const sentAt = new Date();
  const [invoice] = await db
    .update(invoices)
    .set({
      sentAt,
      status: "sent",
      updatedAt: sentAt,
    })
    .where(
      and(eq(invoices.id, invoiceId), eq(invoices.userId, user.id), eq(invoices.status, "draft")),
    )
    .returning();

  if (!invoice) {
    return { error: "Invoice status changed. Refresh and try again." };
  }

  const client = await getOwnedClient(user.id, invoice.clientId);
  if (!client) {
    await db
      .update(invoices)
      .set({
        sentAt: null,
        status: "draft",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.userId, user.id),
          eq(invoices.status, "sent"),
          eq(invoices.sentAt, sentAt),
        ),
      );
    return { error: "Client not found" };
  }

  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, invoiceId))
    .orderBy(asc(lineItems.sortOrder));

  // Step 2: Resolve bank account for this invoice
  let bankDetails: string | null = null;
  if (client.bankAccountId) {
    const [ba] = await db
      .select({ details: bankAccounts.details })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, client.bankAccountId), eq(bankAccounts.userId, user.id)))
      .limit(1);
    bankDetails = ba?.details ?? null;
  }
  if (!bankDetails) {
    const [defaultBa] = await db
      .select({ details: bankAccounts.details })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.userId, user.id), eq(bankAccounts.isDefault, true)))
      .limit(1);
    bankDetails = defaultBa?.details ?? null;
  }

  let paymentLinkId: string | null = null;

  try {
    const logoSrc = await getPdfLogoSrc(user.logoUrl);

    // Step 3: Generate PDF buffer
    const pdfBuffer = await renderToBuffer(
      InvoicePdf({
        business: {
          address: user.businessAddress,
          bankDetails,
          logoSrc,
          name: user.businessName,
          vatNumber: user.vatNumber,
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
          reverseCharge: invoice.reverseCharge,
          subtotal: invoice.subtotal ?? "0",
          taxAmount: invoice.taxAmount ?? "0",
          taxRate: invoice.taxRate ?? "0",
          total: invoice.total ?? "0",
        },
      }),
    );

    // Step 4: Create Stripe payment link
    const paymentLink = await createPaymentLink({
      currency: invoice.currency,
      id: invoice.id,
      number: invoice.number,
      total: invoice.total,
    });
    paymentLinkId = paymentLink.id;

    // Step 5: Send email via Resend with PDF attachment and payment link
    const fromEmail =
      getEmailEnv().RESEND_FROM_EMAIL ?? `${user.businessName ?? "inv."} <invoices@resend.dev>`;
    await resend.emails.send({
      attachments: [
        {
          content: pdfBuffer.toString("base64"),
          filename: `${invoice.number.replaceAll("/", "-")}.pdf`,
        },
      ],
      from: fromEmail,
      react: InvoiceSentEmail({
        businessName: user.businessName ?? "inv.",
        clientName: client.name,
        currency: invoice.currency ?? "EUR",
        dueAt: invoice.dueAt,
        invoiceNumber: invoice.number,
        paymentLinkUrl: paymentLink.url,
        total: invoice.total ?? "0",
      }),
      subject: `Invoice ${invoice.number} from ${user.businessName ?? "inv."}`,
      to: [client.email],
    });

    // Step 6: Persist Stripe link data without overwriting later state transitions.
    await db
      .update(invoices)
      .set({
        stripePaymentLinkId: paymentLink.id,
        stripePaymentLinkUrl: paymentLink.url,
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, user.id)));
  } catch {
    if (paymentLinkId) {
      await deactivatePaymentLink(paymentLinkId).catch(() => null);
    }

    await db
      .update(invoices)
      .set({
        sentAt: null,
        status: "draft",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.userId, user.id),
          eq(invoices.status, "sent"),
          eq(invoices.sentAt, sentAt),
        ),
      );

    return { error: "Invoice could not be sent. Please try again." };
  }

  // Step 7: Log activity
  await db.insert(activityLog).values({
    action: "sent",
    invoiceId,
  });

  // Step 8: Revalidate paths
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);

  return { success: true };
}

export async function sendReminder(invoiceId: string) {
  const user = await getCurrentUser();
  const invoice = await getOwnedInvoice(user.id, invoiceId);
  if (!invoice) {
    return { error: "Invoice not found" };
  }

  if (!invoice.status || !REMINDABLE_STATUSES.has(invoice.status)) {
    return { error: "Only sent or overdue invoices can receive reminders" };
  }

  if (!invoice.stripePaymentLinkUrl) {
    return { error: "This invoice has no Stripe payment link to include in a reminder" };
  }

  const client = await getOwnedClient(user.id, invoice.clientId);
  if (!client) {
    return { error: "Client not found" };
  }

  const fromEmail =
    getEmailEnv().RESEND_FROM_EMAIL ?? `${user.businessName ?? "inv."} <invoices@resend.dev>`;

  await resend.emails.send({
    from: fromEmail,
    react: InvoiceSentEmail({
      businessName: user.businessName ?? "inv.",
      clientName: client.name,
      currency: invoice.currency ?? "EUR",
      dueAt: invoice.dueAt,
      invoiceNumber: invoice.number,
      paymentLinkUrl: invoice.stripePaymentLinkUrl,
      reminder: true,
      total: invoice.total ?? "0",
    }),
    subject: `Reminder: Invoice ${invoice.number} — ${user.businessName ?? "inv."}`,
    to: [client.email],
  });

  await db.insert(activityLog).values({
    action: "reminder_sent",
    invoiceId,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);

  return { success: true };
}

export async function duplicateInvoice(invoiceId: string) {
  const user = await getCurrentUser();
  const original = await getOwnedInvoice(user.id, invoiceId);

  if (!original) {
    throw new Error("Invoice not found");
  }

  const originalItems = await db.select().from(lineItems).where(eq(lineItems.invoiceId, invoiceId));

  const today = new Date().toISOString().split("T")[0];
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const inserted = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        invoiceDigits: users.invoiceDigits,
        invoicePrefix: users.invoicePrefix,
        invoiceSeparator: users.invoiceSeparator,
        nextInvoiceNumber: users.nextInvoiceNumber,
      })
      .from(users)
      .where(eq(users.id, original.userId))
      .limit(1);

    const num = user.nextInvoiceNumber || 1;
    const number = formatInvoiceNumber({
      digits: user.invoiceDigits,
      number: num,
      prefix: user.invoicePrefix || "",
      separator: user.invoiceSeparator,
    });

    await tx
      .update(users)
      .set({ nextInvoiceNumber: num + 1 })
      .where(eq(users.id, original.userId));

    const [inv] = await tx
      .insert(invoices)
      .values({
        clientId: original.clientId,
        currency: original.currency,
        dueAt: dueDate,
        internalNotes: original.internalNotes,
        issuedAt: today,
        notes: original.notes,
        number,
        reverseCharge: original.reverseCharge,
        subtotal: original.subtotal,
        taxAmount: original.taxAmount,
        taxRate: original.taxRate,
        total: original.total,
        userId: original.userId,
      })
      .returning({ id: invoices.id });

    if (originalItems.length > 0) {
      await tx.insert(lineItems).values(
        originalItems.map((item, index) => ({
          amount: item.amount,
          description: item.description,
          invoiceId: inv.id,
          quantity: item.quantity,
          sortOrder: index,
          unitPrice: item.unitPrice,
        })),
      );
    }

    await tx.insert(activityLog).values({
      action: "created",
      invoiceId: inv.id,
      metadata: { duplicatedFrom: invoiceId },
    });

    return inv;
  });

  revalidatePath("/invoices");
  return inserted.id;
}

export async function markInvoiceSent(invoiceId: string) {
  const user = await getCurrentUser();
  const invoice = await getOwnedInvoice(user.id, invoiceId);

  if (!invoice) {
    return { error: "Invoice not found" };
  }

  if (invoice.status !== "draft") {
    return { error: "Only draft invoices can be marked as sent" };
  }

  const sentAt = new Date();
  await db
    .update(invoices)
    .set({
      sentAt,
      status: "sent",
      updatedAt: sentAt,
    })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, user.id)));

  await db.insert(activityLog).values({
    action: "sent",
    invoiceId,
    metadata: { manual: true },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);

  return { success: true };
}

export async function markInvoicePaid(invoiceId: string) {
  const user = await getCurrentUser();
  const invoice = await getOwnedInvoice(user.id, invoiceId);

  if (!invoice) {
    return { error: "Invoice not found" };
  }

  if (invoice.status === "cancelled") {
    return { error: "Cancelled invoices cannot be marked as paid" };
  }

  if (invoice.status === "paid") {
    return { success: true };
  }

  const currentStatus = invoice.status ?? "draft";

  if (
    currentStatus === "sent" &&
    !invoice.stripePaymentLinkId &&
    !(await hasSentActivity(invoiceId))
  ) {
    return { error: "Invoice is still being sent. Refresh and try again." };
  }

  const now = new Date();
  const paidAt = now.toISOString().split("T")[0];
  const updatedInvoices = await db
    .update(invoices)
    .set({
      paidAt,
      sentAt: invoice.sentAt ?? now,
      status: "paid",
      updatedAt: now,
    })
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.userId, user.id),
        eq(invoices.status, currentStatus),
      ),
    )
    .returning({ id: invoices.id });

  if (updatedInvoices.length === 0) {
    return { error: "Invoice status changed. Refresh and try again." };
  }

  await db.insert(activityLog).values({
    action: "paid",
    invoiceId,
    metadata: { manual: true },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);

  return { success: true };
}

export async function cancelInvoice(invoiceId: string) {
  const user = await getCurrentUser();
  const invoice = await getOwnedInvoice(user.id, invoiceId);

  if (!invoice) {
    return { error: "Invoice not found" };
  }

  if (invoice.status === "paid") {
    return { error: "Paid invoices cannot be cancelled" };
  }

  if (invoice.status === "cancelled") {
    return { success: true };
  }

  const currentStatus = invoice.status ?? "draft";

  if (!REMINDABLE_STATUSES.has(currentStatus)) {
    return { error: "Only sent or overdue invoices can be cancelled" };
  }

  if (
    currentStatus === "sent" &&
    !invoice.stripePaymentLinkId &&
    !(await hasSentActivity(invoiceId))
  ) {
    return { error: "Invoice is still being sent. Refresh and try again." };
  }

  const warnings: Array<string> = [];

  const updatedInvoices = await db
    .update(invoices)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.userId, user.id),
        eq(invoices.status, currentStatus),
      ),
    )
    .returning({ id: invoices.id });

  if (updatedInvoices.length === 0) {
    return { error: "Invoice status changed. Refresh and try again." };
  }

  if (invoice.stripePaymentLinkId) {
    try {
      await deactivatePaymentLink(invoice.stripePaymentLinkId);
    } catch {
      warnings.push("Stripe payment link is still active. Disable it in Stripe.");
    }
  }

  await db.insert(activityLog).values({
    action: "cancelled",
    invoiceId,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);

  return { success: true, warning: warnings[0] };
}
