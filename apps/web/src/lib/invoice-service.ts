import { randomBytes } from "node:crypto";

import { and, asc, count, desc, eq, sql } from "drizzle-orm";

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
  payments,
  proposals,
} from "@/lib/db/schema";
import { getStripeMode } from "@/lib/env";
import { resolveDueDateChange } from "@/lib/invoice-due-date";
import {
  canCancelInvoice as canCancelInvoiceStatus,
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
  source?: "api" | "chat" | "cli" | "mcp" | "system" | "web";
  sourceClient?: string | null;
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

function sourceFields(context: InvoiceServiceContext) {
  return { source: context.source ?? "web", sourceClient: context.sourceClient ?? null };
}

function cents(value: string | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

function money(value: number) {
  return (value / 100).toFixed(2);
}

async function expireInvoiceProposals(tx: DbTransaction, invoiceId: string) {
  await tx
    .update(proposals)
    .set({ status: "expired" })
    .where(and(eq(proposals.invoiceId, invoiceId), eq(proposals.status, "pending")));
}

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
    .for("update")
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

  const [client, items, activities, paymentRows, [creditRow], [viewRow]] = await Promise.all([
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
        source: activityLog.source,
        sourceClient: activityLog.sourceClient,
      })
      .from(activityLog)
      .where(eq(activityLog.invoiceId, invoiceId))
      .orderBy(desc(activityLog.createdAt)),
    db
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, invoiceId), eq(payments.orgId, orgId)))
      .orderBy(desc(payments.receivedAt)),
    db
      .select({ total: sql<string>`coalesce(sum(${invoices.total}::numeric), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.creditsInvoiceId, invoiceId),
          eq(invoices.kind, "credit_note"),
          eq(invoices.status, "sent"),
        ),
      ),
    db
      .select({
        count: sql<number>`count(*)::int`,
        lastViewedAt: sql<Date | null>`max(${activityLog.createdAt})`,
      })
      .from(activityLog)
      .where(and(eq(activityLog.invoiceId, invoiceId), eq(activityLog.action, "viewed"))),
  ]);

  const paidCents = paymentRows.reduce((sum, payment) => sum + cents(payment.amount), 0);
  const creditedCents = Math.abs(cents(creditRow?.total));
  const balanceCents = Math.max(0, cents(invoice.total) - paidCents - creditedCents);
  const settlementStatus: "paid" | "partially_paid" | "unpaid" =
    balanceCents === 0 ? "paid" : paidCents > 0 || creditedCents > 0 ? "partially_paid" : "unpaid";

  return {
    ...invoice,
    activityLog: activities,
    balance: money(balanceCents),
    client,
    creditedAmount: money(creditedCents),
    lastViewedAt: viewRow?.lastViewedAt ?? null,
    lineItems: items,
    paidAmount: money(paidCents),
    payments: paymentRows,
    settlementStatus,
    status: invoice.status ?? "draft",
    viewCount: viewRow?.count ?? 0,
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
        ...sourceFields(context),
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
      ...sourceFields(context),
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
        revision: sql`${invoices.revision} + 1`,
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
    await expireInvoiceProposals(tx, invoiceId);
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
      .set({ ...update, revision: sql`${invoices.revision} + 1`, updatedAt: new Date() })
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
      ...sourceFields(context),
    });
    await expireInvoiceProposals(tx, invoiceId);
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

  if (invoice.status !== "draft") {
    return { error: "Only draft invoices can be deleted" };
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
      const paymentLink =
        account && invoice.kind === "invoice"
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
          publicToken: invoice.publicToken ?? randomBytes(24).toString("base64url"),
          revision: sql`${invoices.revision} + 1`,
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
      await tx.insert(activityLog).values({
        action: "sent",
        invoiceId,
        ...sourceFields(context),
      });
      await expireInvoiceProposals(tx, invoiceId);
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
    payload: { invoiceId, ...sourceFields(context) },
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
        ...sourceFields(context),
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
      ...sourceFields(context),
    });

    return invoice;
  });

  return {
    invoiceId: insertedInvoice.id,
    success: true,
  };
}

export async function createCreditNote(
  context: InvoiceServiceContext,
  invoiceId: string,
): Promise<InvoiceMutationResult> {
  if (!canCreateInvoice(context.role)) {
    return { error: getInsufficientPermissionsError() };
  }

  return db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, context.orgId)))
      .for("update");
    if (!original) {
      return { error: "Invoice not found" };
    }
    if (
      original.kind !== "invoice" ||
      !["sent", "overdue", "paid"].includes(original.status ?? "")
    ) {
      return { error: "Only issued invoices can be credited" };
    }

    const [existing] = await tx
      .select({ total: sql<string>`coalesce(sum(${invoices.total}::numeric), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.creditsInvoiceId, invoiceId),
          eq(invoices.kind, "credit_note"),
          sql`${invoices.status} <> 'cancelled'`,
        ),
      );
    if (Math.abs(cents(existing?.total)) >= cents(original.total)) {
      return { error: "Invoice has already been fully credited" };
    }

    const [organization] = await tx
      .select()
      .from(orgs)
      .where(eq(orgs.id, context.orgId))
      .for("update");
    if (!organization) {
      return { error: "Organization not found" };
    }
    const number = formatInvoiceNumber({
      digits: organization.invoiceDigits,
      number: organization.nextCreditNoteNumber,
      prefix: organization.creditNotePrefix,
      separator: organization.invoiceSeparator,
    });
    const [credit] = await tx
      .insert(invoices)
      .values({
        clientId: original.clientId,
        creditsInvoiceId: original.id,
        currency: original.currency,
        dueAt: original.dueAt,
        internalNotes: original.internalNotes,
        issuedAt: new Date().toISOString().slice(0, 10),
        kind: "credit_note",
        notes: original.notes,
        number,
        orgId: context.orgId,
        reverseCharge: original.reverseCharge,
        subtotal: money(-Math.abs(cents(original.subtotal))),
        taxAmount: money(-Math.abs(cents(original.taxAmount))),
        taxRate: original.taxRate,
        total: money(-Math.abs(cents(original.total))),
        ...sourceFields(context),
        userId: context.userId,
      })
      .returning({ id: invoices.id });
    const originalItems = await tx
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, original.id));
    if (originalItems.length) {
      await tx.insert(lineItems).values(
        originalItems.map((item) => ({
          amount: money(-Math.abs(cents(item.amount))),
          description: item.description,
          invoiceId: credit.id,
          quantity: item.quantity,
          sortOrder: item.sortOrder,
          unitPrice: money(-Math.abs(cents(item.unitPrice))),
        })),
      );
    }
    await tx
      .update(orgs)
      .set({ nextCreditNoteNumber: organization.nextCreditNoteNumber + 1 })
      .where(eq(orgs.id, context.orgId));
    await tx.insert(activityLog).values({
      action: "created",
      invoiceId: credit.id,
      metadata: { creditsInvoiceId: original.id, originalNumber: original.number },
      ...sourceFields(context),
    });
    return { invoiceId: credit.id, success: true };
  });
}

export async function recordInvoicePayment(
  context: InvoiceServiceContext,
  invoiceId: string,
  input: {
    amount: number;
    method: "bank_transfer" | "other";
    note?: string;
    receivedAt?: Date;
  },
): Promise<InvoiceMutationResult> {
  if (!canMarkInvoicePaidRole(context.role)) {
    return { error: getInsufficientPermissionsError() };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: "Payment amount must be positive" };
  }

  const result = await db.transaction(async (tx): Promise<InvoiceMutationResult> => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, context.orgId)))
      .for("update");
    if (!invoice) {
      return { error: "Invoice not found" };
    }
    if (invoice.kind !== "invoice" || !["sent", "overdue"].includes(invoice.status ?? "")) {
      return { error: "Only an outstanding issued invoice can receive payments" };
    }
    const [row] = await tx
      .select({ total: sql<string>`coalesce(sum(${payments.amount}::numeric), 0)` })
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    const remaining = cents(invoice.total) - cents(row?.total);
    const amount = Math.round(input.amount * 100);
    if (amount > remaining) {
      return { error: "Payment exceeds the remaining balance" };
    }
    const receivedAt = input.receivedAt ?? new Date();
    await tx.insert(payments).values({
      amount: money(amount),
      currency: invoice.currency ?? "EUR",
      invoiceId,
      method: input.method,
      note: input.note,
      orgId: context.orgId,
      receivedAt,
      source: context.source ?? "web",
    });
    const fullyPaid = amount === remaining;
    await tx
      .update(invoices)
      .set({
        paidAt: fullyPaid ? receivedAt.toISOString().slice(0, 10) : null,
        revision: sql`${invoices.revision} + 1`,
        status: fullyPaid ? "paid" : invoice.status,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));
    await tx.insert(activityLog).values({
      action: "paid",
      invoiceId,
      metadata: { amount: money(amount), method: input.method },
      ...sourceFields(context),
    });
    await tx.insert(jobs).values({
      invoiceId,
      payload: { amount: money(amount), invoiceId },
      type: "send_payment_received_email",
    });
    await expireInvoiceProposals(tx, invoiceId);
    return { invoiceId, success: true };
  });
  if ("success" in result) {
    await processPendingEmailJobs(1).catch(() => null);
  }
  return result;
}

export async function markInvoicePaid(
  context: InvoiceServiceContext,
  invoiceId: string,
): Promise<InvoiceMutationResult> {
  if (!canMarkInvoicePaidRole(context.role)) {
    return { error: getInsufficientPermissionsError() };
  }

  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, context.orgId)))
      .for("update");
    if (!invoice) {
      return { error: "Invoice not found" };
    }
    const normalizedStatus = normalizeInvoiceStatus(invoice.status);
    if (normalizedStatus === "cancelled" || invoice.kind === "credit_note") {
      return { error: "This document cannot be marked as paid" };
    }
    if (!canMarkInvoicePaidStatus(normalizedStatus)) {
      return { invoiceId, success: true };
    }
    const [row] = await tx
      .select({ total: sql<string>`coalesce(sum(${payments.amount}::numeric), 0)` })
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    const remaining = cents(invoice.total) - cents(row?.total);
    if (remaining <= 0) {
      return { invoiceId, success: true };
    }
    const now = new Date();
    await tx.insert(payments).values({
      amount: money(remaining),
      currency: invoice.currency ?? "EUR",
      invoiceId,
      method: "other",
      note: "Marked paid manually",
      orgId: context.orgId,
      receivedAt: now,
      source: context.source ?? "web",
    });
    await tx
      .update(invoices)
      .set({
        paidAt: now.toISOString().split("T")[0],
        revision: sql`${invoices.revision} + 1`,
        sentAt: invoice.sentAt ?? now,
        status: "paid",
        updatedAt: now,
      })
      .where(eq(invoices.id, invoiceId));
    await tx.insert(activityLog).values({
      action: "paid",
      invoiceId,
      metadata: { amount: money(remaining), manual: true },
      ...sourceFields(context),
    });
    await expireInvoiceProposals(tx, invoiceId);
    return { invoiceId, success: true };
  });
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

  const updatedInvoices = await db.transaction(async (tx) => {
    const changed = await tx
      .update(invoices)
      .set({
        revision: sql`${invoices.revision} + 1`,
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
    if (changed.length) {
      await expireInvoiceProposals(tx, invoiceId);
    }
    return changed;
  });

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
    ...sourceFields(context),
  });

  return {
    invoiceId,
    success: true,
    warning,
  };
}
