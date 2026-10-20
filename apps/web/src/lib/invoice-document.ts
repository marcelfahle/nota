import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts, clients, invoices, lineItems, orgs } from "@/lib/db/schema";
import { complianceInput } from "@/lib/invoice-compliance";
import { buildInvoiceFilename } from "@/lib/invoice-filename";
import { buildIssuedSnapshot, complianceFromSnapshot } from "@/lib/issued-snapshot";
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
  | "documentLocale"
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

export type InvoiceDocumentDatabase = Pick<typeof db, "select">;

/** The account an invoice is paid to: the client's assigned one, else the workspace default. */
export async function loadInvoiceBankAccount(
  database: InvoiceDocumentDatabase,
  orgId: string,
  assignedId: string | null,
) {
  const columns = { bic: bankAccounts.bic, details: bankAccounts.details, iban: bankAccounts.iban };
  if (assignedId) {
    const [assigned] = await database
      .select(columns)
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, assignedId), eq(bankAccounts.orgId, orgId)))
      .limit(1);
    if (assigned) {
      return assigned;
    }
  }
  const [fallback] = await database
    .select(columns)
    .from(bankAccounts)
    .where(and(eq(bankAccounts.orgId, orgId), eq(bankAccounts.isDefault, true)))
    .limit(1);
  return fallback ?? null;
}

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
 *
 * An issued invoice carries its parties frozen on the row (`issuedSnapshot`),
 * and that is what the renderers get. A draft, or an invoice issued before the
 * snapshot existed, gets the same shape built from the live rows.
 *
 * `database` lets issuance render inside its own transaction, where the number
 * and the snapshot are not yet visible to anyone else.
 */
export async function loadInvoiceDocument(
  org: InvoiceDocumentOrg,
  invoiceId: string,
  database: InvoiceDocumentDatabase = db,
) {
  const [invoice] = await database
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, org.id)))
    .limit(1);
  if (!invoice) {
    throw new InvoiceDocumentError("Invoice not found");
  }

  const [client] = await database
    .select()
    .from(clients)
    .where(and(eq(clients.id, invoice.clientId), eq(clients.orgId, org.id)))
    .limit(1);
  if (!client) {
    throw new InvoiceDocumentError("Client not found");
  }

  const items = await database
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, invoiceId))
    .orderBy(asc(lineItems.sortOrder));
  const [creditedInvoice] = invoice.creditsInvoiceId
    ? await database
        .select({ number: invoices.number })
        .from(invoices)
        .where(eq(invoices.id, invoice.creditsInvoiceId))
        .limit(1)
    : [];

  const frozen = invoice.status !== "draft" ? invoice.issuedSnapshot : null;
  const bankAccount = frozen
    ? null
    : await loadInvoiceBankAccount(database, org.id, client.bankAccountId);
  const snapshot =
    frozen ??
    buildIssuedSnapshot({
      bankAccount,
      client,
      clientTaxIdentifier: invoiceTaxIdentifier(
        invoice.status,
        invoice.clientTaxIdentifier,
        client,
      ),
      invoice,
      org,
      sellerTaxIdentifier: invoiceTaxIdentifier(invoice.status, invoice.sellerTaxIdentifier, org),
    });

  return {
    bank: snapshot.bank,
    buyer: snapshot.buyer,
    compliance: frozen
      ? complianceFromSnapshot(frozen, invoice, items.length)
      : complianceInput(org, client, invoice, items.length, bankAccount),
    filename: (extension: "pdf" | "xml") =>
      buildInvoiceFilename(
        {
          clientName: snapshot.buyer.name,
          issuedAt: invoice.issuedAt,
          lineItems: items,
          number: invoice.number,
        },
        extension,
      ),
    /** True when the parties came from the issuance snapshot rather than the live rows. */
    frozen: Boolean(frozen),
    invoice,
    items,
    originalNumber: creditedInvoice?.number ?? null,
    seller: snapshot.seller,
    totals: snapshot.totals,
  };
}
