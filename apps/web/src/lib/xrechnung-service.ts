import { validateForXRechnung } from "@/lib/invoice-compliance";
import { type InvoiceDocumentOrg, loadInvoiceDocument } from "@/lib/invoice-document";
import { clientPostalAddress, orgPostalAddress } from "@/lib/postal-address";
import { generateXRechnung, XRechnungValidationError } from "@/lib/xrechnung";

export { InvoiceDocumentError, type InvoiceDocumentOrg } from "@/lib/invoice-document";

/**
 * The one path from a stored invoice to XRechnung XML. Validation runs first
 * so an incomplete document never becomes a plausible-looking file.
 */
export async function renderXRechnungForOrg(org: InvoiceDocumentOrg, invoiceId: string) {
  const document = await loadInvoiceDocument(org, invoiceId);
  const { bankAccount, client, invoice, items } = document;

  const problems = validateForXRechnung(document.compliance);
  if (problems.length) {
    throw new XRechnungValidationError(problems);
  }

  const xml = generateXRechnung({
    business: {
      ...orgPostalAddress(org),
      bankDetails: bankAccount?.details ?? null,
      bic: bankAccount?.bic ?? null,
      contact: {
        email: org.contactEmail,
        name: org.contactName,
        phone: org.contactPhone,
      },
      email: org.contactEmail ?? "",
      iban: bankAccount?.iban ?? null,
      name: org.legalName ?? org.businessName ?? org.name,
      taxIdentifier: document.sellerTaxIdentifier,
    },
    client: {
      ...clientPostalAddress(client),
      company: client.company,
      email: client.email,
      name: client.name,
      publicSector: client.publicSector,
      taxIdentifier: document.clientTaxIdentifier,
    },
    invoice: {
      buyerReference: invoice.buyerReference,
      currency: invoice.currency ?? "EUR",
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
      subtotal: invoice.subtotal ?? "0.00",
      taxAmount: invoice.taxAmount ?? "0.00",
      taxRate: invoice.taxRate ?? "0.00",
      taxTreatment: invoice.taxTreatment,
      total: invoice.total ?? "0.00",
    },
  });

  return { filename: document.filename("xml"), xml };
}
