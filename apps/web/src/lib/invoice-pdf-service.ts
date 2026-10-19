import { renderToBuffer } from "@react-pdf/renderer";

import { InvoicePdf } from "@/components/invoice-pdf";
import { getPdfLogoSrc } from "@/lib/branding";
import {
  type InvoiceDocumentDatabase,
  type InvoiceDocumentOrg,
  loadInvoiceDocument,
} from "@/lib/invoice-document";
import { formatVariableDecimal } from "@/lib/money";

export type InvoicePdfOrg = InvoiceDocumentOrg;

export { InvoiceDocumentError as InvoicePdfDataError } from "@/lib/invoice-document";

export async function renderInvoicePdfForOrg(
  org: InvoicePdfOrg,
  invoiceId: string,
  options: { database?: InvoiceDocumentDatabase; logoSrc?: string | null } = {},
) {
  const document = await loadInvoiceDocument(org, invoiceId, options.database);
  const { bank, buyer, invoice, items, seller, totals } = document;

  const logoSrc =
    options.logoSrc === undefined ? await getPdfLogoSrc(seller.logoUrl) : options.logoSrc;
  const buffer = await renderToBuffer(
    InvoicePdf({
      business: {
        address: seller.address,
        bankDetails: bank?.details ?? null,
        bic: bank?.bic ?? null,
        brandColor: seller.brandColor,
        iban: bank?.iban ?? null,
        logoSrc,
        name: seller.name,
        taxIdentifier: seller.taxIdentifier,
      },
      client: {
        address: buyer.address,
        company: buyer.company,
        email: buyer.email,
        name: buyer.name,
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
          quantity: formatVariableDecimal(item.quantity, 6, 2),
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
        taxRate: formatVariableDecimal(totals.taxRate, 6, 2),
        taxTreatment: totals.taxTreatment,
        total: totals.total,
      },
    }),
  );

  return {
    buffer: new Uint8Array(buffer),
    clientName: buyer.name,
    filename: document.filename("pdf"),
    invoiceNumber: invoice.number,
  };
}
