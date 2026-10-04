import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { activityLog, bankAccounts, clients, invoices, orgs } from "@/lib/db/schema";
import { getInvoiceDetail } from "@/lib/invoice-service";

const VIEW_DEDUPE_MS = 30 * 60 * 1000;

export async function getPublicInvoice(token: string, recordView = false) {
  const identity = await db.transaction(async (tx) => {
    const [invoice] = await tx
      .select({ id: invoices.id, orgId: invoices.orgId, status: invoices.status })
      .from(invoices)
      .where(eq(invoices.publicToken, token))
      .for("update");

    if (!invoice?.orgId || invoice.status === "draft") {
      return null;
    }

    if (recordView) {
      const [latestView] = await tx
        .select({ createdAt: activityLog.createdAt })
        .from(activityLog)
        .where(and(eq(activityLog.invoiceId, invoice.id), eq(activityLog.action, "viewed")))
        .orderBy(desc(activityLog.createdAt))
        .limit(1);

      if (!latestView?.createdAt || Date.now() - latestView.createdAt.getTime() >= VIEW_DEDUPE_MS) {
        await tx.insert(activityLog).values({
          action: "viewed",
          invoiceId: invoice.id,
          metadata: { viewedAt: new Date().toISOString().slice(0, 16) },
          source: "system",
        });
      }
    }

    return { id: invoice.id, orgId: invoice.orgId };
  });

  if (!identity) {
    return null;
  }

  const [invoice, context] = await Promise.all([
    getInvoiceDetail(identity.orgId, identity.id),
    db
      .select({ client: clients, organization: orgs })
      .from(invoices)
      .innerJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, identity.orgId)))
      .innerJoin(orgs, eq(orgs.id, identity.orgId))
      .where(eq(invoices.id, identity.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  if (!invoice || !context) {
    return null;
  }

  let bankAccount = null;
  if (context.client.bankAccountId) {
    [bankAccount] = await db
      .select()
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.id, context.client.bankAccountId),
          eq(bankAccounts.orgId, identity.orgId),
        ),
      )
      .limit(1);
  }

  if (!bankAccount) {
    [bankAccount] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.orgId, identity.orgId), eq(bankAccounts.isDefault, true)))
      .limit(1);
  }

  return {
    ...invoice,
    bankAccount: bankAccount ?? null,
    client: context.client,
    organization: context.organization,
  };
}

export type PublicInvoice = NonNullable<Awaited<ReturnType<typeof getPublicInvoice>>>;
