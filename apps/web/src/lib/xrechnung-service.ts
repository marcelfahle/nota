import { validateForXRechnung } from "@/lib/invoice-compliance";
import {
  type InvoiceDocumentDatabase,
  type InvoiceDocumentOrg,
  loadInvoiceDocument,
} from "@/lib/invoice-document";
import { generateXRechnung, XRechnungValidationError } from "@/lib/xrechnung";

export { InvoiceDocumentError, type InvoiceDocumentOrg } from "@/lib/invoice-document";

/**
 * The one path from a stored invoice to XRechnung XML. Validation runs first
 * so an incomplete document never becomes a plausible-looking file.
 */
export async function renderXRechnungForOrg(
  org: InvoiceDocumentOrg,
  invoiceId: string,
  options: { database?: InvoiceDocumentDatabase } = {},
) {
  const document = await loadInvoiceDocument(org, invoiceId, options.database);
  const { bank, buyer, invoice, items, seller, totals } = document;

  const problems = validateForXRechnung(document.compliance);
  if (problems.length) {
    throw new XRechnungValidationError(problems);
  }

  const xml = generateXRechnung({
    business: {
      bankDetails: bank?.details ?? null,
      bic: bank?.bic ?? null,
      city: seller.city,
      contact: {
        email: seller.contactEmail,
        name: seller.contactName,
        phone: seller.contactPhone,
      },
      countryCode: seller.countryCode,
      email: seller.contactEmail ?? "",
      iban: bank?.iban ?? null,
      name: seller.name,
      postalCode: seller.postalCode,
      street: seller.street,
      taxIdentifier: seller.taxIdentifier,
    },
    client: {
      city: buyer.city,
      company: buyer.company,
      countryCode: buyer.countryCode,
      email: buyer.email,
      name: buyer.name,
      postalCode: buyer.postalCode,
      publicSector: buyer.publicSector,
      street: buyer.street,
      taxIdentifier: buyer.taxIdentifier,
    },
    invoice: {
      buyerReference: invoice.buyerReference,
      currency: totals.currency,
      dueAt: invoice.dueAt,
      issuedAt: invoice.issuedAt,
      kind: invoice.kind,
      lineItems: items.map((item) => ({
        amount: item.amount,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      notes: invoice.notes,
      number: invoice.number,
      originalNumber: document.originalNumber,
      paymentLinkUrl: invoice.stripePaymentLinkUrl,
      servicePeriodEnd: invoice.servicePeriodEnd,
      servicePeriodStart: invoice.servicePeriodStart,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      taxRate: totals.taxRate,
      taxTreatment: totals.taxTreatment,
      total: totals.total,
    },
  });

  return { filename: document.filename("xml"), xml };
}
