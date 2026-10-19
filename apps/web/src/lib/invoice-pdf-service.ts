import { renderToBuffer } from "@react-pdf/renderer";

import { InvoicePdf } from "@/components/invoice-pdf";
import { formatOrgAddress, getPdfLogoSrc } from "@/lib/branding";
import { documentLocaleOf } from "@/lib/i18n";
import { orgCountryCode } from "@/lib/invoice-compliance";
import { type InvoiceDocumentOrg, loadInvoiceDocument } from "@/lib/invoice-document";
import { formatVariableDecimal } from "@/lib/money";
import { formatClientAddress, isDomestic } from "@/lib/postal-address";

export type InvoicePdfOrg = InvoiceDocumentOrg;

export { InvoiceDocumentError as InvoicePdfDataError } from "@/lib/invoice-document";

export async function renderInvoicePdfForOrg(
  org: InvoicePdfOrg,
  invoiceId: string,
  options: { logoSrc?: string | null } = {},
) {
  const document = await loadInvoiceDocument(org, invoiceId);
  const { bankAccount, client, invoice, items } = document;
  const locale = documentLocaleOf(invoice, org);
  const address = { locale, omitCountry: isDomestic({ countryCode: orgCountryCode(org) }, client) };

  const logoSrc =
    options.logoSrc === undefined ? await getPdfLogoSrc(org.logoUrl) : options.logoSrc;
  const buffer = await renderToBuffer(
    InvoicePdf({
      business: {
        address: formatOrgAddress(org, address),
        bankDetails: bankAccount?.details ?? null,
        bic: bankAccount?.bic ?? null,
        brandColor: org.brandColor,
        iban: bankAccount?.iban ?? null,
        logoSrc,
        name: org.legalName ?? org.businessName ?? org.name,
        taxIdentifier: document.sellerTaxIdentifier,
      },
      client: {
        address: formatClientAddress(client, address),
        company: client.company,
        email: client.email,
        name: client.name,
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
        taxRate: formatVariableDecimal(invoice.taxRate ?? 0, 6, 2),
        taxTreatment: invoice.taxTreatment,
        total: invoice.total ?? "0.00",
      },
      locale,
    }),
  );

  return {
    buffer: new Uint8Array(buffer),
    clientName: client.name,
    filename: document.filename("pdf"),
    invoiceNumber: invoice.number,
  };
}
