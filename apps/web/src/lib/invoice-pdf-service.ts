import { renderToBuffer } from "@react-pdf/renderer";

import { InvoicePdf } from "@/components/invoice-pdf";
import { getPdfLogoSrc } from "@/lib/branding";
import { documentLocaleOf } from "@/lib/i18n";
import { fitImage, imageSizeFromDataUri } from "@/lib/image-size";
import {
  type InvoiceDocumentDatabase,
  type InvoiceDocumentOrg,
  loadInvoiceDocument,
} from "@/lib/invoice-document";
import { invoiceSheetProps } from "@/lib/invoice-sheet";

export type InvoicePdfOrg = InvoiceDocumentOrg;

export { InvoiceDocumentError as InvoicePdfDataError } from "@/lib/invoice-document";

export async function renderInvoicePdfForOrg(
  org: InvoicePdfOrg,
  invoiceId: string,
  options: { database?: InvoiceDocumentDatabase; logoSrc?: string | null } = {},
) {
  const document = await loadInvoiceDocument(org, invoiceId, options.database);
  const { buyer, invoice, seller } = document;
  // An issued invoice keeps the language it was issued in; a draft follows the workspace.
  const locale = documentLocaleOf(invoice, org);

  const logoSrc =
    options.logoSrc === undefined ? await getPdfLogoSrc(seller.logoUrl) : options.logoSrc;
  // The logo is fitted by its real aspect ratio: a wordmark gets the width, a mark the height.
  const logo = logoSrc ? { src: logoSrc, ...fitImage(imageSizeFromDataUri(logoSrc)) } : null;
  const buffer = await renderToBuffer(InvoicePdf(invoiceSheetProps(document, locale, logo)));

  return {
    buffer: new Uint8Array(buffer),
    clientName: buyer.name,
    filename: document.filename("pdf"),
    invoiceNumber: invoice.number,
  };
}
