"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  activityLog,
  bankAccounts,
  clients,
  invoices,
  jobs,
  lineItems,
  users,
} from "@/lib/db/schema";
import {
  canCancelInvoice,
  canDeleteInvoice,
  canEditInvoice,
  canMarkInvoicePaid,
  canSendInvoice,
  canSendInvoiceReminder,
  isInvoiceSendFinalized,
  normalizeInvoiceStatus,
} from "@/lib/invoice-lifecycle";
import { formatInvoiceNumber } from "@/lib/invoice-number";
import { processPendingEmailJobs } from "@/lib/jobs";
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

  if (!canEditInvoice(invoice.status)) {
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

  if (!canDeleteInvoice(invoice.status)) {
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
    isInvoiceSendFinalized(
      existingInvoice.status,
      await hasSentActivity(invoiceId),
      Boolean(existingInvoice.stripePaymentLinkId && existingInvoice.stripePaymentLinkUrl),
    )
  ) {
    return { success: true };
  }

  if (!canSendInvoice(existingInvoice.status)) {
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

  // Step 2: Resolve bank account for this invoice
  if (client.bankAccountId) {
    const [bankAccount] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, client.bankAccountId), eq(bankAccounts.userId, user.id)))
      .limit(1);

    if (!bankAccount) {
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
      return { error: "Assigned bank account not found" };
    }
  }

  let paymentLinkId: string | null = null;

  try {
    // Step 3: Create Stripe payment link
    const paymentLink = await createPaymentLink({
      currency: invoice.currency,
      id: invoice.id,
      number: invoice.number,
      total: invoice.total,
    });
    paymentLinkId = paymentLink.id;

    // Step 4: Persist Stripe link data and enqueue the outbound email job.
    await db.transaction(async (tx) => {
      await tx
        .update(invoices)
        .set({
          stripePaymentLinkId: paymentLink.id,
          stripePaymentLinkUrl: paymentLink.url,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, user.id)));

      await tx.insert(activityLog).values({
        action: "sent",
        invoiceId,
      });

      await tx.insert(jobs).values({
        invoiceId,
        payload: { invoiceId },
        type: "send_invoice_email",
      });
    });
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

  // Step 8: Revalidate paths
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  await processPendingEmailJobs(1);

  return { success: true };
}

export async function sendReminder(invoiceId: string) {
  const user = await getCurrentUser();
  const invoice = await getOwnedInvoice(user.id, invoiceId);
  if (!invoice) {
    return { error: "Invoice not found" };
  }

  if (!canSendInvoiceReminder(invoice.status, Boolean(invoice.stripePaymentLinkUrl))) {
    return { error: "Only sent or overdue invoices can receive reminders" };
  }

  await db.insert(jobs).values({
    invoiceId,
    payload: { invoiceId },
    type: "send_invoice_reminder_email",
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  await processPendingEmailJobs(1);

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

  if (!canSendInvoice(invoice.status)) {
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

  const normalizedStatus = normalizeInvoiceStatus(invoice.status);

  if (normalizedStatus === "cancelled") {
    return { error: "Cancelled invoices cannot be marked as paid" };
  }

  if (!canMarkInvoicePaid(normalizedStatus)) {
    return { success: true };
  }

  if (
    normalizedStatus === "sent" &&
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
        eq(invoices.status, normalizedStatus),
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

  const normalizedStatus = normalizeInvoiceStatus(invoice.status);

  if (normalizedStatus === "paid") {
    return { error: "Paid invoices cannot be cancelled" };
  }

  if (normalizedStatus === "cancelled") {
    return { success: true };
  }

  if (!canCancelInvoice(normalizedStatus)) {
    return { error: "Only sent or overdue invoices can be cancelled" };
  }

  if (
    normalizedStatus === "sent" &&
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
        eq(invoices.status, normalizedStatus),
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
