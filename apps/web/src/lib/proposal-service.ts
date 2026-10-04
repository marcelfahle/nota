import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { activityLog, clients, invoices, jobs, orgs, proposals } from "@/lib/db/schema";
import type { InvoiceServiceContext } from "@/lib/invoice-service";
import { canSendInvoiceReminder, getInsufficientPermissionsError } from "@/lib/roles";

export const reminderPayloadSchema = z.object({
  businessName: z.string(),
  clientName: z.string(),
  currency: z.string(),
  dueAt: z.string(),
  invoiceNumber: z.string(),
  paymentLinkUrl: z.string().nullable(),
  subject: z.string(),
  to: z.string().email(),
  total: z.string(),
});

export async function createReminderProposal(
  context: InvoiceServiceContext,
  invoiceId: string,
  reason: string,
) {
  if (!canSendInvoiceReminder(context.role)) {
    return { error: getInsufficientPermissionsError() } as const;
  }
  const [row] = await db
    .select({ client: clients, invoice: invoices, org: orgs })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .innerJoin(orgs, eq(orgs.id, invoices.orgId))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, context.orgId)))
    .limit(1);
  if (!row) {
    return { error: "Invoice not found" } as const;
  }
  if (!["sent", "overdue"].includes(row.invoice.status ?? "")) {
    return { error: "Only outstanding invoices can receive reminder proposals" } as const;
  }
  const businessName = row.org.businessName ?? row.org.name;
  const payload = {
    businessName,
    clientName: row.client.name,
    currency: row.invoice.currency ?? "EUR",
    dueAt: row.invoice.dueAt,
    invoiceNumber: row.invoice.number,
    paymentLinkUrl: row.invoice.stripePaymentLinkUrl,
    subject: `Reminder: Invoice ${row.invoice.number} — ${businessName}`,
    to: row.client.email,
    total: row.invoice.total ?? "0.00",
  };
  const [proposal] = await db
    .insert(proposals)
    .values({
      createdBy: "agent",
      invoiceId,
      invoiceRevision: row.invoice.revision,
      kind: "send_reminder",
      orgId: context.orgId,
      payload,
      reason,
      sourceClient: context.sourceClient,
    })
    .onConflictDoNothing()
    .returning();
  return proposal
    ? ({ proposal } as const)
    : ({ error: "A reminder proposal is already pending" } as const);
}

export async function approveProposal(context: InvoiceServiceContext, proposalId: string) {
  if (!canSendInvoiceReminder(context.role)) {
    return { error: getInsufficientPermissionsError() } as const;
  }
  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .select()
      .from(proposals)
      .where(and(eq(proposals.id, proposalId), eq(proposals.orgId, context.orgId)))
      .for("update");
    if (!proposal) {
      return { error: "Proposal not found" } as const;
    }
    if (proposal.status !== "pending") {
      return { error: "Proposal is no longer pending" } as const;
    }
    if (proposal.expiresAt && proposal.expiresAt <= new Date()) {
      await tx.update(proposals).set({ status: "expired" }).where(eq(proposals.id, proposal.id));
      return { error: "Proposal has expired" } as const;
    }
    if (!proposal.invoiceId) {
      return { error: "Proposal has no invoice" } as const;
    }
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, proposal.invoiceId), eq(invoices.orgId, context.orgId)))
      .for("update");
    if (!invoice || invoice.revision !== proposal.invoiceRevision) {
      await tx.update(proposals).set({ status: "expired" }).where(eq(proposals.id, proposal.id));
      return { error: "Invoice changed; proposal expired" } as const;
    }
    const payload = reminderPayloadSchema.safeParse(proposal.payload);
    if (!payload.success || proposal.kind !== "send_reminder") {
      return { error: "Proposal payload is invalid" } as const;
    }
    const now = new Date();
    await tx
      .update(proposals)
      .set({ decidedAt: now, decidedBy: context.userId, status: "approved" })
      .where(eq(proposals.id, proposal.id));
    await tx.insert(jobs).values({
      invoiceId: invoice.id,
      payload: {
        invoiceId: invoice.id,
        proposalId: proposal.id,
        reminder: payload.data,
        source: context.source ?? "web",
        sourceClient: context.sourceClient,
      },
      type: "send_invoice_reminder_email",
    });
    await tx.insert(activityLog).values({
      action: "proposal_approved",
      invoiceId: invoice.id,
      metadata: { proposalId: proposal.id, userId: context.userId },
      source: context.source ?? "web",
      sourceClient: context.sourceClient,
    });
    return { proposalId: proposal.id, success: true } as const;
  });
}
