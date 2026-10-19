import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts, clients, invoices, lineItems, orgs } from "@/lib/db/schema";
import { complianceInput } from "@/lib/invoice-compliance";
import { buildInvoiceFilename } from "@/lib/invoice-filename";
import { invoiceTaxIdentifier } from "@/lib/tax-identifier";

export type InvoiceDocumentOrg = Pick<
  typeof orgs.$inferSelect,
  | "brandColor"
  | "businessAddress"
  | "businessName"
  | "city"
  | "contactEmail"
  | "contactName"
  | "contactPhone"
  | "country"
  | "countryCode"
  | "id"
  | "legalName"
  | "logoUrl"
  | "name"
  | "postalCode"
  | "region"
  | "street"
  | "taxIdentifierCanonicalValue"
  | "taxIdentifierCountryCode"
  | "taxIdentifierType"
  | "taxIdentifierValue"
  | "vatNumber"
>;

export class InvoiceDocumentError extends Error {
  readonly status = 404;

  constructor(message: string) {
    super(message);
    this.name = "InvoiceDocumentError";
  }
}

/**
 * Everything a human or machine rendering of one invoice needs, loaded once so
 * the PDF, the public page and the XRechnung export cannot drift apart.
 */
export async function loadInvoiceDocument(org: InvoiceDocumentOrg, invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, org.id)))
    .limit(1);
  if (!invoice) {
    throw new InvoiceDocumentError("Invoice not found");
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, invoice.clientId), eq(clients.orgId, org.id)))
    .limit(1);
  if (!client) {
    throw new InvoiceDocumentError("Client not found");
  }

  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, invoiceId))
    .orderBy(asc(lineItems.sortOrder));
  const [creditedInvoice] = invoice.creditsInvoiceId
    ? await db
        .select({ number: invoices.number })
        .from(invoices)
        .where(eq(invoices.id, invoice.creditsInvoiceId))
        .limit(1)
    : [];

  const bankColumns = {
    bic: bankAccounts.bic,
    details: bankAccounts.details,
    iban: bankAccounts.iban,
  };
  let bankAccount: { bic: string | null; details: string; iban: string | null } | null = null;
  if (client.bankAccountId) {
    const [assigned] = await db
      .select(bankColumns)
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, client.bankAccountId), eq(bankAccounts.orgId, org.id)))
      .limit(1);
    bankAccount = assigned ?? null;
  }
  if (!bankAccount) {
    const [fallback] = await db
      .select(bankColumns)
      .from(bankAccounts)
      .where(and(eq(bankAccounts.orgId, org.id), eq(bankAccounts.isDefault, true)))
      .limit(1);
    bankAccount = fallback ?? null;
  }

  const sellerTaxIdentifier = invoiceTaxIdentifier(
    invoice.status,
    invoice.sellerTaxIdentifier,
    org,
  );
  const clientTaxIdentifier = invoiceTaxIdentifier(
    invoice.status,
    invoice.clientTaxIdentifier,
    client,
  );
  return {
    bankAccount,
    client,
    clientTaxIdentifier,
    compliance: complianceInput(org, client, invoice, items.length),
    filename: (extension: "pdf" | "xml") =>
      buildInvoiceFilename(
        {
          clientName: client.name,
          issuedAt: invoice.issuedAt,
          lineItems: items,
          number: invoice.number,
        },
        extension,
      ),
    invoice,
    items,
    originalNumber: creditedInvoice?.number ?? null,
    sellerTaxIdentifier,
  };
}
