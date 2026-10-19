import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { activityLog, bankAccounts, clients, invoices, orgs } from "@/lib/db/schema";
import { attachesXRechnung } from "@/lib/e-invoice-delivery";
import { complianceInput, validateForXRechnung } from "@/lib/invoice-compliance";
import { getInvoiceDetail } from "@/lib/invoice-service";
import { displayedBuyer, frozenSnapshot } from "@/lib/issued-snapshot";

const VIEW_DEDUPE_MS = 30 * 60 * 1000;

export async function getPublicInvoice(token: string, recordView = false) {
  const identity = await db.transaction(async (tx) => {
    const query = tx
      .select({ id: invoices.id, orgId: invoices.orgId, status: invoices.status })
      .from(invoices)
      .where(eq(invoices.publicToken, token));
    const [invoice] = recordView ? await query.for("update") : await query;

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

  // The page shows what the stored documents say: an issued invoice keeps the
  // addresses, the buyer and the bank details frozen at issuance. Branding
  // (name shown in the header, logo, colour) stays live; it is not document content.
  const frozen = frozenSnapshot(invoice);
  return {
    ...invoice,
    bankAccount: frozen
      ? frozen.bank && { ...(bankAccount ?? {}), ...frozen.bank }
      : (bankAccount ?? null),
    client: displayedBuyer(invoice, context.client),
    organization: frozen
      ? {
          ...context.organization,
          // The frozen lines as one block; the structured columns are what `formatOrgAddress` reads first.
          businessAddress: frozen.seller.address,
          city: null,
          country: null,
          postalCode: null,
          region: null,
          street: null,
        }
      : context.organization,
    // A frozen invoice offers the XML only when one was stored at issuance; what
    // it lacked then cannot be fixed now. An invoice issued before originals were
    // kept offers it where the email carried it and the export is complete today.
    xrechnungAvailable: frozen
      ? invoice.documents.some((document) => document.kind === "xrechnung")
      : attachesXRechnung(context.organization.eInvoiceDelivery) &&
        validateForXRechnung(
          complianceInput(
            context.organization,
            context.client,
            invoice,
            invoice.lineItems.length,
            bankAccount,
          ),
        ).length === 0,
  };
}

export type PublicInvoice = NonNullable<Awaited<ReturnType<typeof getPublicInvoice>>>;
