import { and, asc, count, desc, eq } from "drizzle-orm";

import type { AuthenticatedRole } from "@/lib/auth";
import { billingMonth, canSendOnPlan, paymentAccount, UPGRADE_MESSAGE } from "@/lib/billing-policy";
import { db } from "@/lib/db";
import {
  activityLog,
  bankAccounts,
  clients,
  invoices,
  invoiceSends,
  jobs,
  lineItems,
  orgs,
} from "@/lib/db/schema";
import { getStripeMode } from "@/lib/env";
import { resolveDueDateChange } from "@/lib/invoice-due-date";
import {
  canCancelInvoice as canCancelInvoiceStatus,
  canDeleteInvoice as canDeleteInvoiceStatus,
  canEditInvoice as canEditInvoiceStatus,
  canMarkInvoicePaid as canMarkInvoicePaidStatus,
  canSendInvoice as canSendInvoiceStatus,
  canSendInvoiceReminder as canSendInvoiceReminderStatus,
  isInvoiceSendFinalized,
  normalizeInvoiceStatus,
} from "@/lib/invoice-lifecycle";
import { formatInvoiceNumber } from "@/lib/invoice-number";
import { processPendingEmailJobs } from "@/lib/jobs";
import {
  canCancelInvoice as canCancelInvoiceRole,
  canCreateInvoice,
  canDeleteInvoice as canDeleteInvoiceRole,
  canEditDraft,
  canMarkInvoicePaid as canMarkInvoicePaidRole,
  canSendInvoice as canSendInvoiceRole,
  canSendInvoiceReminder as canSendInvoiceReminderRole,
  getInsufficientPermissionsError,
} from "@/lib/roles";
import { createPaymentLink, deactivatePaymentLink } from "@/lib/stripe";

export type InvoiceServiceContext = {
  orgId: string;
  role: AuthenticatedRole;
  userId: string;
};

export type InvoiceLineItemInput = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceMutationInput = {
  clientId: string;
  currency: string;
  dueAt: string;
  internalNotes?: string;
  issuedAt: string;
  lineItems: Array<InvoiceLineItemInput>;
  notes?: string;
  reverseCharge: string;
  taxRate: number;
};

export type InvoiceMutationError = {
  error: string;
};

export type InvoiceMutationSuccess = {
  invoiceId: string;
  success: true;
  warning?: string;
};

export type InvoiceMutationResult = InvoiceMutationError | InvoiceMutationSuccess;

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function calculateInvoiceTotals(
  items: Array<{ quantity: number; unitPrice: number }>,
  taxRate: number,
) {
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

export async function createNextInvoiceNumber(tx: DbTransaction, orgId: string) {
  const [organization] = await tx
    .select({
      invoiceDigits: orgs.invoiceDigits,
      invoicePrefix: orgs.invoicePrefix,
      invoiceSeparator: orgs.invoiceSeparator,
      nextInvoiceNumber: orgs.nextInvoiceNumber,
    })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);

  if (!organization) {
    throw new Error("Organization not found");
  }

  let sequenceNumber = organization.nextInvoiceNumber;
  let number: string;

  // Skip over numbers that already exist (e.g. cancelled invoices)
  for (;;) {
    number = formatInvoiceNumber({
      digits: organization.invoiceDigits,
      number: sequenceNumber,
      prefix: organization.invoicePrefix,
      separator: organization.invoiceSeparator,
    });

    const [existing] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.number, number)))
      .limit(1);

    if (!existing) {
      break;
    }
    sequenceNumber++;
  }

  await tx
    .update(orgs)
    .set({ nextInvoiceNumber: sequenceNumber + 1 })
    .where(eq(orgs.id, orgId));

  return number;
}

export async function getOwnedInvoice(orgId: string, invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)))
    .limit(1);

  return invoice ?? null;
}

export async function getOwnedClient(orgId: string, clientId: string) {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId)))
    .limit(1);

  return client ?? null;
}

export async function hasSentActivity(invoiceId: string) {
  const [entry] = await db
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(and(eq(activityLog.invoiceId, invoiceId), eq(activityLog.action, "sent")))
    .limit(1);

  return Boolean(entry);
}

export async function getInvoiceDetail(orgId: string, invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)))
    .limit(1);

  if (!invoice) {
    return null;
  }

  const [client, items, activities] = await Promise.all([
    db
      .select({
        defaultCurrency: clients.defaultCurrency,
        email: clients.email,
        id: clients.id,
        name: clients.name,
      })
      .from(clients)
      .where(and(eq(clients.id, invoice.clientId), eq(clients.orgId, orgId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, invoiceId))
      .orderBy(asc(lineItems.sortOrder)),
    db
      .select({
        action: activityLog.action,
        createdAt: activityLog.createdAt,
        id: activityLog.id,
        metadata: activityLog.metadata,
      })
      .from(activityLog)
      .where(eq(activityLog.invoiceId, invoiceId))
      .orderBy(desc(activityLog.createdAt)),
  ]);

  return {
    ...invoice,
    activityLog: activities,
    client,
    lineItems: items,
    status: invoice.status ?? "draft",
  };
}

export async function createInvoice(
  context: InvoiceServiceContext,
  input: InvoiceMutationInput,
): Promise<InvoiceMutationResult> {
  if (!canCreateInvoice(context.role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const { lineItems: items, taxRate, ...invoiceData } = input;
  const totals = calculateInvoiceTotals(items, taxRate);
  const client = await getOwnedClient(context.orgId, invoiceData.clientId);

  if (!client) {
    return { error: "Client not found" };
  }

  const insertedInvoice = await db.transaction(async (tx) => {
    const number = await createNextInvoiceNumber(tx, context.orgId);
    const [invoice] = await tx
      .insert(invoices)
      .values({
        ...invoiceData,
        ...totals,
        number,
        orgId: context.orgId,
        userId: context.userId,
      })
      .returning({ id: invoices.id });

    await tx.insert(lineItems).values(
      items.map((item, index) => ({
        amount: (item.quantity * item.unitPrice).toFixed(2),
        description: item.description,
        invoiceId: invoice.id,
        quantity: item.quantity.toFixed(2),
        sortOrder: index,
        unitPrice: item.unitPrice.toFixed(2),
      })),
    );

    await tx.insert(activityLog).values({
      action: "created",
      invoiceId: invoice.id,
    });

    return invoice;
  });

  return {
    invoiceId: insertedInvoice.id,
    success: true,
  };
}

export async function updateInvoice(
  context: InvoiceServiceContext,
  invoiceId: string,
  input: InvoiceMutationInput,
): Promise<InvoiceMutationResult> {
  if (!canEditDraft(context.role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const invoice = await getOwnedInvoice(context.orgId, invoiceId);
  if (!invoice) {
    return { error: "Invoice not found" };
  }

  if (!canEditInvoiceStatus(invoice.status)) {
    return { error: "Only draft invoices can be edited" };
  }

  const { lineItems: items, taxRate, ...invoiceData } = input;
  const totals = calculateInvoiceTotals(items, taxRate);
  const client = await getOwnedClient(context.orgId, invoiceData.clientId);

  if (!client) {
    return { error: "Client not found" };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        ...invoiceData,
        ...totals,
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, context.orgId)));

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

  return {
    invoiceId,
    success: true,
  };
}

export async function changeInvoiceDueDate(
  context: InvoiceServiceContext,
  invoiceId: string,
  dueAt: string,
): Promise<InvoiceMutationResult> {
  const invoice = await getOwnedInvoice(context.orgId, invoiceId);
  if (!invoice) {
    return { error: "Invoice not found" };
  }
  let update: ReturnType<typeof resolveDueDateChange>;
  try {
    update = resolveDueDateChange({
      dueAt,
      issuedAt: invoice.issuedAt,
      role: context.role,
      status: invoice.status,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid due date" };
  }
  if (invoice.dueAt === dueAt) {
    return { invoiceId, success: true };
  }
  return db.transaction(async (tx) => {
    const [changed] = await tx
      .update(invoices)
      .set({ ...update, updatedAt: new Date() })
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.orgId, context.orgId),
          eq(invoices.status, invoice.status ?? "draft"),
          eq(invoices.dueAt, invoice.dueAt),
          eq(invoices.issuedAt, invoice.issuedAt),
        ),
      )
      .returning({ id: invoices.id });
    if (!changed) {
      return { error: "Invoice changed. Refresh and try again." };
    }
    await tx.insert(activityLog).values({
      action: "due_date_changed",
      invoiceId,
      metadata: { dueAt, previousDueAt: invoice.dueAt, userId: context.userId },
    });
    return { invoiceId, success: true };
  });
}

export async function deleteInvoice(
  context: InvoiceServiceContext,
  invoiceId: string,
): Promise<InvoiceMutationResult> {
  if (!canDeleteInvoiceRole(context.role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const invoice = await getOwnedInvoice(context.orgId, invoiceId);
  if (!invoice) {
    return { error: "Invoice not found" };
  }

  if (!canDeleteInvoiceStatus(invoice.status)) {
    return { error: "Only draft or cancelled invoices can be deleted" };
  }

  await db.transaction(async (tx) => {
    await tx.delete(activityLog).where(eq(activityLog.invoiceId, invoiceId));
    await tx
      .delete(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, context.orgId)));
  });

  return { invoiceId, success: true };
}

export async function sendInvoice(
  context: InvoiceServiceContext,
  invoiceId: string,
): Promise<InvoiceMutationResult> {
  if (!canSendInvoiceRole(context.role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const existingInvoice = await getOwnedInvoice(context.orgId, invoiceId);
  if (!existingInvoice) {
    return { error: "Invoice not found" };
  }

  if (isInvoiceSendFinalized(existingInvoice.status, await hasSentActivity(invoiceId))) {
    return { invoiceId, success: true };
  }

  if (!canSendInvoiceStatus(existingInvoice.status)) {
    return { error: "Only draft invoices can be sent" };
  }

  const sentAt = new Date();
  let createdLink: { accountId: string | null; id: string } | null = null;
  try {
    const result = await db.transaction(async (tx): Promise<InvoiceMutationResult> => {
      // Keep quota, invoice state and the email job atomic, including on request interruption.
      const [org] = await tx.select().from(orgs).where(eq(orgs.id, context.orgId)).for("update");
      if (!org) {
        return { error: "Organization not found" };
      }
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, context.orgId)))
        .for("update");
      if (!invoice) {
        return { error: "Invoice not found" };
      }
      const [sent] = await tx
        .select({ id: activityLog.id })
        .from(activityLog)
        .where(and(eq(activityLog.invoiceId, invoiceId), eq(activityLog.action, "sent")))
        .limit(1);
      if (isInvoiceSendFinalized(invoice.status, Boolean(sent))) {
        return { invoiceId, success: true };
      }
      if (!canSendInvoiceStatus(invoice.status)) {
        return { error: "Only draft invoices can be sent" };
      }
      const mode = getStripeMode().STRIPE_MODE;
      const [usage] = await tx
        .select({ total: count() })
        .from(invoiceSends)
        .where(and(eq(invoiceSends.orgId, org.id), eq(invoiceSends.month, billingMonth(sentAt))));
      if (!canSendOnPlan(mode, org.plan, usage.total)) {
        return { error: UPGRADE_MESSAGE };
      }
      const [client] = await tx
        .select()
        .from(clients)
        .where(and(eq(clients.id, invoice.clientId), eq(clients.orgId, context.orgId)));
      if (!client) {
        return { error: "Client not found" };
      }
      if (client.bankAccountId) {
        const [bank] = await tx
          .select({ id: bankAccounts.id })
          .from(bankAccounts)
          .where(
            and(eq(bankAccounts.id, client.bankAccountId), eq(bankAccounts.orgId, context.orgId)),
          );
        if (!bank) {
          return { error: "Assigned bank account not found" };
        }
      }
      const account = paymentAccount(mode, org.stripeAccountId, org.stripeChargesEnabled);
      const accountId = account === "platform" ? null : account;
      const paymentLink = account
        ? await createPaymentLink({
            attempt: sentAt.toISOString(),
            currency: invoice.currency,
            id: invoice.id,
            number: invoice.number,
            stripeAccountId: accountId,
            total: invoice.total,
          })
        : null;
      if (paymentLink) {
        createdLink = { accountId, id: paymentLink.id };
      }
      await tx
        .update(invoices)
        .set({
          sentAt,
          status: "sent",
          stripeAccountId: accountId,
          stripePaymentLinkId: paymentLink?.id ?? null,
          stripePaymentLinkUrl: paymentLink?.url ?? null,
          updatedAt: sentAt,
        })
        .where(eq(invoices.id, invoiceId));
      await tx
        .insert(invoiceSends)
        .values({ invoiceId, month: billingMonth(sentAt), orgId: org.id });
      await tx.insert(activityLog).values({ action: "sent", invoiceId });
      await tx
        .insert(jobs)
        .values({ invoiceId, payload: { invoiceId }, type: "send_invoice_email" });
      return { invoiceId, success: true };
    });
    if ("error" in result) {
      return result;
    }
  } catch {
    // A link created before a database failure has never been sent to the client.
    const orphan = createdLink as { accountId: string | null; id: string } | null;
    if (orphan) {
      await deactivatePaymentLink(orphan.id, orphan.accountId).catch(() => null);
    }
    return { error: "Invoice could not be sent. Please try again." };
  }
  await processPendingEmailJobs(1).catch(() => null);
  return { invoiceId, success: true };
}

export async function sendReminder(
  context: InvoiceServiceContext,
  invoiceId: string,
): Promise<InvoiceMutationResult> {
  if (!canSendInvoiceReminderRole(context.role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const invoice = await getOwnedInvoice(context.orgId, invoiceId);
  if (!invoice) {
    return { error: "Invoice not found" };
  }

  if (!canSendInvoiceReminderStatus(invoice.status)) {
    return { error: "Only sent or overdue invoices can receive reminders" };
  }

  await db.insert(jobs).values({
    invoiceId,
    payload: { invoiceId },
    type: "send_invoice_reminder_email",
  });

  await processPendingEmailJobs(1).catch(() => null);

  return { invoiceId, success: true };
}

export async function duplicateInvoice(
  context: InvoiceServiceContext,
  invoiceId: string,
): Promise<InvoiceMutationResult> {
  if (!canCreateInvoice(context.role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const original = await getOwnedInvoice(context.orgId, invoiceId);
  if (!original) {
    return { error: "Invoice not found" };
  }

  const originalItems = await db.select().from(lineItems).where(eq(lineItems.invoiceId, invoiceId));
  const today = new Date().toISOString().split("T")[0];
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const insertedInvoice = await db.transaction(async (tx) => {
    const number = await createNextInvoiceNumber(tx, context.orgId);
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
        orgId: context.orgId,
        reverseCharge: original.reverseCharge,
        subtotal: original.subtotal,
        taxAmount: original.taxAmount,
        taxRate: original.taxRate,
        total: original.total,
        userId: context.userId,
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

  return {
    invoiceId: insertedInvoice.id,
    success: true,
  };
}

export async function markInvoicePaid(
  context: InvoiceServiceContext,
  invoiceId: string,
): Promise<InvoiceMutationResult> {
  if (!canMarkInvoicePaidRole(context.role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const invoice = await getOwnedInvoice(context.orgId, invoiceId);
  if (!invoice) {
    return { error: "Invoice not found" };
  }

  const normalizedStatus = normalizeInvoiceStatus(invoice.status);

  if (normalizedStatus === "cancelled") {
    return { error: "Cancelled invoices cannot be marked as paid" };
  }

  if (!canMarkInvoicePaidStatus(normalizedStatus)) {
    return { invoiceId, success: true };
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
        eq(invoices.orgId, context.orgId),
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

  return { invoiceId, success: true };
}

export async function cancelInvoice(
  context: InvoiceServiceContext,
  invoiceId: string,
): Promise<InvoiceMutationResult> {
  if (!canCancelInvoiceRole(context.role)) {
    return { error: getInsufficientPermissionsError() };
  }

  const invoice = await getOwnedInvoice(context.orgId, invoiceId);
  if (!invoice) {
    return { error: "Invoice not found" };
  }

  const normalizedStatus = normalizeInvoiceStatus(invoice.status);

  if (normalizedStatus === "paid") {
    return { error: "Paid invoices cannot be cancelled" };
  }

  if (normalizedStatus === "cancelled") {
    return { invoiceId, success: true };
  }

  if (!canCancelInvoiceStatus(normalizedStatus)) {
    return { error: "Only sent or overdue invoices can be cancelled" };
  }

  if (
    normalizedStatus === "sent" &&
    !invoice.stripePaymentLinkId &&
    !(await hasSentActivity(invoiceId))
  ) {
    return { error: "Invoice is still being sent. Refresh and try again." };
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
        eq(invoices.orgId, context.orgId),
        eq(invoices.status, normalizedStatus),
      ),
    )
    .returning({ id: invoices.id });

  if (updatedInvoices.length === 0) {
    return { error: "Invoice status changed. Refresh and try again." };
  }

  let warning: string | undefined;
  if (invoice.stripePaymentLinkId) {
    try {
      await deactivatePaymentLink(invoice.stripePaymentLinkId, invoice.stripeAccountId);
    } catch {
      warning = "Stripe payment link is still active. Disable it in Stripe.";
    }
  }

  await db.insert(activityLog).values({
    action: "cancelled",
    invoiceId,
  });

  return {
    invoiceId,
    success: true,
    warning,
  };
}
