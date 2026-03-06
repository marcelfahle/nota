import { and, eq } from "drizzle-orm";

import type { ApiRequestAuthContext } from "@/lib/api-auth";
import { createNextInvoiceNumber, getInvoiceDetail } from "@/lib/api-invoices";
import { db } from "@/lib/db";
import { activityLog, bankAccounts, clients, invoices, jobs, lineItems } from "@/lib/db/schema";
import {
  canCancelInvoice as canCancelInvoiceStatus,
  canMarkInvoicePaid as canMarkInvoicePaidStatus,
  canSendInvoice as canSendInvoiceStatus,
  canSendInvoiceReminder as canSendInvoiceReminderStatus,
  isInvoiceSendFinalized,
  normalizeInvoiceStatus,
} from "@/lib/invoice-lifecycle";
import { processPendingEmailJobs } from "@/lib/jobs";
import {
  canCancelInvoice as canCancelInvoiceRole,
  canCreateInvoice,
  canMarkInvoicePaid as canMarkInvoicePaidRole,
  canSendInvoice as canSendInvoiceRole,
  canSendInvoiceReminder as canSendInvoiceReminderRole,
  getInsufficientPermissionsError,
} from "@/lib/roles";
import { createPaymentLink, deactivatePaymentLink } from "@/lib/stripe";

type ApiInvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>;

type InvoiceActionError = {
  error: string;
  status: number;
};

type InvoiceActionSuccess = {
  invoice: ApiInvoiceDetail;
  warning?: string;
};

type InvoiceActionResult = InvoiceActionError | InvoiceActionSuccess;

type InvoiceRecord = typeof invoices.$inferSelect;

function buildError(error: string, status: number): InvoiceActionError {
  return { error, status };
}

async function getOwnedInvoice(orgId: string, invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)))
    .limit(1);

  return invoice ?? null;
}

async function getOwnedClient(orgId: string, clientId: string) {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId)))
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

async function loadInvoiceDetailOrThrow(orgId: string, invoiceId: string) {
  const invoice = await getInvoiceDetail(orgId, invoiceId);
  if (!invoice) {
    throw new Error("Invoice could not be loaded");
  }

  return invoice;
}

export async function sendInvoiceFromApi(
  auth: ApiRequestAuthContext,
  invoiceId: string,
): Promise<InvoiceActionResult> {
  if (!canSendInvoiceRole(auth.role)) {
    return buildError(getInsufficientPermissionsError(), 403);
  }

  const existingInvoice = await getOwnedInvoice(auth.org.id, invoiceId);
  if (!existingInvoice) {
    return buildError("Invoice not found", 404);
  }

  if (
    isInvoiceSendFinalized(
      existingInvoice.status,
      await hasSentActivity(invoiceId),
      Boolean(existingInvoice.stripePaymentLinkId && existingInvoice.stripePaymentLinkUrl),
    )
  ) {
    return { invoice: await loadInvoiceDetailOrThrow(auth.org.id, invoiceId) };
  }

  if (!canSendInvoiceStatus(existingInvoice.status)) {
    return buildError("Only draft invoices can be sent", 409);
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
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.orgId, auth.org.id),
        eq(invoices.status, "draft"),
      ),
    )
    .returning();

  if (!invoice) {
    return buildError("Invoice status changed. Refresh and try again.", 409);
  }

  const client = await getOwnedClient(auth.org.id, invoice.clientId);
  if (!client) {
    await revertSentInvoice(auth.org.id, invoiceId, sentAt);
    return buildError("Client not found", 404);
  }

  if (client.bankAccountId) {
    const [bankAccount] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, client.bankAccountId), eq(bankAccounts.orgId, auth.org.id)))
      .limit(1);

    if (!bankAccount) {
      await revertSentInvoice(auth.org.id, invoiceId, sentAt);
      return buildError("Assigned bank account not found", 409);
    }
  }

  let paymentLinkId: string | null = null;

  try {
    const paymentLink = await createPaymentLink({
      currency: invoice.currency,
      id: invoice.id,
      number: invoice.number,
      total: invoice.total,
    });
    paymentLinkId = paymentLink.id;

    await db.transaction(async (tx) => {
      await tx
        .update(invoices)
        .set({
          stripePaymentLinkId: paymentLink.id,
          stripePaymentLinkUrl: paymentLink.url,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, auth.org.id)));

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

    await revertSentInvoice(auth.org.id, invoiceId, sentAt);
    return buildError("Invoice could not be sent. Please try again.", 500);
  }

  await processPendingEmailJobs(1).catch(() => null);

  return { invoice: await loadInvoiceDetailOrThrow(auth.org.id, invoiceId) };
}

async function revertSentInvoice(orgId: string, invoiceId: string, sentAt: Date) {
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
        eq(invoices.orgId, orgId),
        eq(invoices.status, "sent"),
        eq(invoices.sentAt, sentAt),
      ),
    );
}

export async function sendReminderFromApi(
  auth: ApiRequestAuthContext,
  invoiceId: string,
): Promise<InvoiceActionResult> {
  if (!canSendInvoiceReminderRole(auth.role)) {
    return buildError(getInsufficientPermissionsError(), 403);
  }

  const invoice = await getOwnedInvoice(auth.org.id, invoiceId);
  if (!invoice) {
    return buildError("Invoice not found", 404);
  }

  if (!canSendInvoiceReminderStatus(invoice.status, Boolean(invoice.stripePaymentLinkUrl))) {
    return buildError("Only sent or overdue invoices can receive reminders", 409);
  }

  await db.insert(jobs).values({
    invoiceId,
    payload: { invoiceId },
    type: "send_invoice_reminder_email",
  });

  await processPendingEmailJobs(1).catch(() => null);

  return { invoice: await loadInvoiceDetailOrThrow(auth.org.id, invoiceId) };
}

export async function markInvoicePaidFromApi(
  auth: ApiRequestAuthContext,
  invoiceId: string,
): Promise<InvoiceActionResult> {
  if (!canMarkInvoicePaidRole(auth.role)) {
    return buildError(getInsufficientPermissionsError(), 403);
  }

  const invoice = await getOwnedInvoice(auth.org.id, invoiceId);
  if (!invoice) {
    return buildError("Invoice not found", 404);
  }

  const normalizedStatus = normalizeInvoiceStatus(invoice.status);

  if (normalizedStatus === "cancelled") {
    return buildError("Cancelled invoices cannot be marked as paid", 409);
  }

  if (!canMarkInvoicePaidStatus(normalizedStatus)) {
    return { invoice: await loadInvoiceDetailOrThrow(auth.org.id, invoiceId) };
  }

  if (
    normalizedStatus === "sent" &&
    !invoice.stripePaymentLinkId &&
    !(await hasSentActivity(invoiceId))
  ) {
    return buildError("Invoice is still being sent. Refresh and try again.", 409);
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
        eq(invoices.orgId, auth.org.id),
        eq(invoices.status, normalizedStatus),
      ),
    )
    .returning({ id: invoices.id });

  if (updatedInvoices.length === 0) {
    return buildError("Invoice status changed. Refresh and try again.", 409);
  }

  await db.insert(activityLog).values({
    action: "paid",
    invoiceId,
    metadata: { manual: true },
  });

  return { invoice: await loadInvoiceDetailOrThrow(auth.org.id, invoiceId) };
}

export async function cancelInvoiceFromApi(
  auth: ApiRequestAuthContext,
  invoiceId: string,
): Promise<InvoiceActionResult> {
  if (!canCancelInvoiceRole(auth.role)) {
    return buildError(getInsufficientPermissionsError(), 403);
  }

  const invoice = await getOwnedInvoice(auth.org.id, invoiceId);
  if (!invoice) {
    return buildError("Invoice not found", 404);
  }

  const normalizedStatus = normalizeInvoiceStatus(invoice.status);

  if (normalizedStatus === "paid") {
    return buildError("Paid invoices cannot be cancelled", 409);
  }

  if (normalizedStatus === "cancelled") {
    return { invoice: await loadInvoiceDetailOrThrow(auth.org.id, invoiceId) };
  }

  if (!canCancelInvoiceStatus(normalizedStatus)) {
    return buildError("Only sent or overdue invoices can be cancelled", 409);
  }

  if (
    normalizedStatus === "sent" &&
    !invoice.stripePaymentLinkId &&
    !(await hasSentActivity(invoiceId))
  ) {
    return buildError("Invoice is still being sent. Refresh and try again.", 409);
  }

  const updatedInvoices = await db
    .update(invoices)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.orgId, auth.org.id),
        eq(invoices.status, normalizedStatus),
      ),
    )
    .returning({ id: invoices.id });

  if (updatedInvoices.length === 0) {
    return buildError("Invoice status changed. Refresh and try again.", 409);
  }

  let warning: string | undefined;
  if (invoice.stripePaymentLinkId) {
    try {
      await deactivatePaymentLink(invoice.stripePaymentLinkId);
    } catch {
      warning = "Stripe payment link is still active. Disable it in Stripe.";
    }
  }

  await db.insert(activityLog).values({
    action: "cancelled",
    invoiceId,
  });

  return {
    invoice: await loadInvoiceDetailOrThrow(auth.org.id, invoiceId),
    warning,
  };
}

export async function duplicateInvoiceFromApi(
  auth: ApiRequestAuthContext,
  invoiceId: string,
): Promise<InvoiceActionResult> {
  if (!canCreateInvoice(auth.role)) {
    return buildError(getInsufficientPermissionsError(), 403);
  }

  const original = await getOwnedInvoice(auth.org.id, invoiceId);
  if (!original) {
    return buildError("Invoice not found", 404);
  }

  const originalItems = await db.select().from(lineItems).where(eq(lineItems.invoiceId, invoiceId));
  const today = new Date().toISOString().split("T")[0];
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const insertedInvoice = await db.transaction(async (tx) => {
    const number = await createNextInvoiceNumber(tx, auth.org.id);
    const [invoice] = await tx
      .insert(invoices)
      .values({
        clientId: original.clientId,
        currency: original.currency,
        dueAt: dueDate,
        internalNotes: original.internalNotes,
        issuedAt: today,
        notes: original.notes,
        number,
        orgId: auth.org.id,
        reverseCharge: original.reverseCharge,
        subtotal: original.subtotal,
        taxAmount: original.taxAmount,
        taxRate: original.taxRate,
        total: original.total,
        userId: auth.user.id,
      })
      .returning({ id: invoices.id });

    if (originalItems.length > 0) {
      await tx.insert(lineItems).values(
        originalItems.map((item, index) => ({
          amount: item.amount,
          description: item.description,
          invoiceId: invoice.id,
          quantity: item.quantity,
          sortOrder: index,
          unitPrice: item.unitPrice,
        })),
      );
    }

    await tx.insert(activityLog).values({
      action: "created",
      invoiceId: invoice.id,
      metadata: { duplicatedFrom: invoiceId },
    });

    return invoice;
  });

  return { invoice: await loadInvoiceDetailOrThrow(auth.org.id, insertedInvoice.id) };
}
