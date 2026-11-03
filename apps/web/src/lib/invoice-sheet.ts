import type { AppLocale } from "@/lib/i18n";
import type { loadInvoiceDocument } from "@/lib/invoice-document";
import { formatVariableDecimal } from "@/lib/money";
import type { TaxIdentifier } from "@/lib/tax-identifier";
import type { TaxTreatment } from "@/lib/tax-treatment";

export type InvoiceDocument = Awaited<ReturnType<typeof loadInvoiceDocument>>;

/**
 * A logo as a document shows it. Width and height are the fitted size in
 * points; the PDF needs them measured, the browser fits the image itself.
 */
export type SheetLogo = { height?: number; src: string; width?: number };

/**
 * Everything one rendering of an invoice needs, shared by the PDF and the
 * on-screen sheet so the two cannot drift apart.
 */
export type InvoiceSheetProps = {
  business: {
    address?: string | null;
    bankDetails?: string | null;
    bic?: string | null;
    brandColor?: string | null;
    iban?: string | null;
    logo?: SheetLogo | null;
    name?: string | null;
    taxIdentifier?: TaxIdentifier | null;
  };
  client: {
    address?: string | null;
    company?: string | null;
    email: string;
    name: string;
    taxIdentifier?: TaxIdentifier | null;
  };
  invoice: {
    buyerReference?: string | null;
    currency: string;
    dueAt: string;
    issuedAt: string;
    kind?: "credit_note" | "invoice";
    lineItems: Array<{ amount: string; description: string; quantity: string; unitPrice: string }>;
    notes?: string | null;
    number: string;
    originalNumber?: string | null;
    paymentLinkUrl?: string | null;
    servicePeriodEnd?: string | null;
    servicePeriodStart?: string | null;
    subtotal: string;
    taxAmount: string;
    taxRate: string;
    taxTreatment: TaxTreatment;
    total: string;
  };
  /** The language the document is written in, with its number and date formats. */
  locale?: AppLocale;
};

/** A company line is printed only when it says something the name does not. */
export function clientCompanyLine(client: { company?: string | null; name: string }) {
  const company = client.company?.trim();
  return company && company !== client.name.trim() ? company : null;
}

/** The one mapping from a loaded invoice document to what the renderers draw. */
export function invoiceSheetProps(
  document: InvoiceDocument,
  locale: AppLocale,
  logo: SheetLogo | null,
): InvoiceSheetProps {
  const { bank, buyer, invoice, items, seller, totals } = document;
  return {
    business: {
      address: seller.address,
      bankDetails: bank?.details ?? null,
      bic: bank?.bic ?? null,
      brandColor: seller.brandColor,
      iban: bank?.iban ?? null,
      logo,
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
      taxRate: formatVariableDecimal(totals.taxRate, 6, 2),
      taxTreatment: totals.taxTreatment,
      total: totals.total,
    },
    locale,
  };
}
