import type { CSSProperties } from "react";

import { PAGE } from "@/components/paper-scaler";
import { getTranslator, toIntlLocale } from "@/lib/i18n";
import { formatIbanDisplay } from "@/lib/iban";
import { LOGO_BOX } from "@/lib/image-size";
import { isDraftNumber } from "@/lib/invoice-number";
import { clientCompanyLine, type InvoiceSheetProps } from "@/lib/invoice-sheet";
import { formatTaxIdentifier } from "@/lib/tax-identifier";
import { taxTreatmentNote } from "@/lib/tax-treatment";
import { formatCurrency, formatDate, formatNumber, formatQuantity, type Locale } from "@/lib/utils";

// The same palette and measurements as invoice-pdf.tsx, in CSS pixels standing
// in for points. Change one and change the other.
const c = {
  black: "#000000",
  border: "#e5e5e5",
  borderSubtle: "#f0f0f0",
  muted: "#a3a3a3",
  secondary: "#525252",
  tertiary: "#737373",
  text: "#171717",
};

const label: CSSProperties = {
  color: c.tertiary,
  fontSize: 8,
  fontWeight: 500,
  letterSpacing: 1.5,
  textTransform: "uppercase",
};

const s = {
  businessAddress: { color: c.tertiary, fontSize: 9, lineHeight: 1.6 } as CSSProperties,
  businessName: { color: c.text, fontSize: 13, fontWeight: 600, marginBottom: 4 } as CSSProperties,
  clientAddress: {
    color: c.secondary,
    fontSize: 9,
    lineHeight: 1.5,
    marginTop: 4,
  } as CSSProperties,
  clientCompany: { color: c.secondary, fontSize: 10, marginBottom: 2 } as CSSProperties,
  clientEmail: { color: c.tertiary, fontSize: 9, marginTop: 2 } as CSSProperties,
  clientName: { color: c.text, fontSize: 11, fontWeight: 600, marginBottom: 2 } as CSSProperties,
  clientVat: { color: c.tertiary, fontSize: 8, marginTop: 6 } as CSSProperties,
  dateLabel: { color: c.tertiary, fontSize: 9, marginRight: 10, width: 92 } as CSSProperties,
  dateRow: { display: "flex", marginBottom: 6 } as CSSProperties,
  dateValue: { color: c.text, fontSize: 9, fontWeight: 500 } as CSSProperties,
  dateValueDue: { color: c.black, fontSize: 9, fontWeight: 600 } as CSSProperties,
  footer: {
    borderTop: `1px solid ${c.border}`,
    bottom: 32,
    display: "flex",
    justifyContent: "space-between",
    left: 56,
    paddingTop: 14,
    position: "absolute",
    right: 56,
  } as CSSProperties,
  footerText: { color: c.muted, fontSize: 8, lineHeight: 1.6 } as CSSProperties,
  grandTotalLabel: {
    color: c.black,
    fontSize: 12,
    fontWeight: 600,
    textAlign: "right",
    width: 120,
  } as CSSProperties,
  grandTotalValue: {
    color: c.black,
    fontSize: 12,
    fontWeight: 600,
    textAlign: "right",
    width: 90,
  } as CSSProperties,
  header: { display: "flex", justifyContent: "space-between", marginBottom: 48 } as CSSProperties,
  headerRight: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
  } as CSSProperties,
  invoiceLabel: { ...label } as CSSProperties,
  invoiceNumber: {
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: -0.5,
    marginBottom: 4,
  } as CSSProperties,
  lineItemAmount: {
    color: c.text,
    fontWeight: 500,
    textAlign: "right",
    width: "20%",
  } as CSSProperties,
  lineItemDesc: { color: c.text, width: "45%" } as CSSProperties,
  lineItemQty: { color: c.secondary, textAlign: "right", width: "15%" } as CSSProperties,
  lineItemRate: { color: c.secondary, textAlign: "right", width: "20%" } as CSSProperties,
  logoImage: {
    display: "block",
    height: LOGO_BOX.height,
    marginBottom: 12,
    maxWidth: LOGO_BOX.width,
    objectFit: "contain",
    objectPosition: "left center",
    width: "auto",
  } as CSSProperties,
  notes: { marginTop: 32 } as CSSProperties,
  notesLabel: { ...label, marginBottom: 6 } as CSSProperties,
  notesText: {
    color: c.secondary,
    fontSize: 9,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  } as CSSProperties,
  page: {
    backgroundColor: "#fffefb",
    boxSizing: "border-box",
    color: c.text,
    fontSize: 9,
    fontWeight: 400,
    lineHeight: 1.25,
    minHeight: PAGE.height,
    padding: "52px 56px 72px",
    position: "relative",
    width: PAGE.width,
  } as CSSProperties,
  paymentDetails: {
    border: `1px solid ${c.border}`,
    borderRadius: 4,
    marginTop: 32,
    padding: 20,
  } as CSSProperties,
  paymentLabel: { color: c.tertiary, fontSize: 9, marginRight: 10, width: 100 } as CSSProperties,
  paymentLink: {
    color: c.text,
    fontSize: 9,
    fontWeight: 500,
    textDecoration: "none",
  } as CSSProperties,
  paymentRow: { display: "flex", marginBottom: 6 } as CSSProperties,
  paymentSectionLabel: { ...label, marginBottom: 12 } as CSSProperties,
  paymentValue: { color: c.text, fontSize: 9, fontWeight: 500 } as CSSProperties,
  section: { display: "flex", justifyContent: "space-between", marginBottom: 40 } as CSSProperties,
  sectionLabel: { ...label, marginBottom: 8 } as CSSProperties,
  tableHeader: {
    borderBottom: `1px solid ${c.border}`,
    color: c.tertiary,
    display: "flex",
    fontSize: 8,
    fontWeight: 500,
    letterSpacing: 1,
    paddingBottom: 10,
    textTransform: "uppercase",
  } as CSSProperties,
  tableHeaderAmount: { textAlign: "right", width: "20%" } as CSSProperties,
  tableHeaderDesc: { width: "45%" } as CSSProperties,
  tableHeaderQty: { textAlign: "right", width: "15%" } as CSSProperties,
  tableHeaderRate: { textAlign: "right", width: "20%" } as CSSProperties,
  tableRow: {
    borderBottom: `1px solid ${c.borderSubtle}`,
    display: "flex",
    fontSize: 9,
    padding: "12px 0",
  } as CSSProperties,
  taxNote: { color: c.tertiary, fontSize: 8, marginTop: 12 } as CSSProperties,
  thanks: { color: c.secondary, fontSize: 9, marginTop: 24 } as CSSProperties,
  totalLabel: { color: c.tertiary, fontSize: 9, textAlign: "right", width: 120 } as CSSProperties,
  totalRow: { display: "flex", justifyContent: "flex-end", marginBottom: 6 } as CSSProperties,
  totals: { marginTop: 20 } as CSSProperties,
  totalSeparator: {
    borderTop: `1px solid ${c.border}`,
    marginBottom: 8,
    marginLeft: "auto",
    marginTop: 4,
    width: 210,
  } as CSSProperties,
  totalValue: {
    color: c.text,
    fontSize: 9,
    fontWeight: 500,
    textAlign: "right",
    width: 90,
  } as CSSProperties,
};

function money(amount: number | string, currency: string, locale: Locale) {
  return formatCurrency(
    typeof amount === "string" ? Number.parseFloat(amount) : amount,
    currency,
    locale,
  );
}

function formatServicePeriod(
  start: string | null | undefined,
  end: string | null | undefined,
  locale: Locale,
) {
  if (!start || !end) {
    return null;
  }
  return start === end
    ? formatDate(start, locale)
    : `${formatDate(start, locale)} – ${formatDate(end, locale)}`;
}

function Lines({ style, text }: { style: CSSProperties; text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <p key={index} style={style}>
          {line}
        </p>
      ))}
    </>
  );
}

type InvoiceSheetViewProps = InvoiceSheetProps & {
  /** A status stamp laid over the document on screen: paid, part paid, cancelled. */
  stamp?: string | null;
};

/**
 * The invoice as HTML, laid out exactly like invoice-pdf.tsx on an A4 page in
 * points. It is what people see in the app; the PDF is what the customer gets,
 * and the two are drawn from the same props.
 */
export function InvoiceSheet({
  business,
  client,
  invoice,
  locale: language = "en",
  stamp,
}: InvoiceSheetViewProps) {
  const currency = invoice.currency;
  const locale = toIntlLocale(language);
  const t = getTranslator(language, "pdf");
  const taxRate = Number.parseFloat(invoice.taxRate);
  const hasPaymentDetails = business.iban || business.bankDetails || invoice.paymentLinkUrl;
  const accent = /^#[\da-f]{6}$/i.test(business.brandColor ?? "") ? business.brandColor! : c.text;
  const isCreditNote = invoice.kind === "credit_note";
  const number = isDraftNumber(invoice.number) ? t("draft") : invoice.number;
  const companyLine = clientCompanyLine(client);
  const servicePeriod = formatServicePeriod(
    invoice.servicePeriodStart,
    invoice.servicePeriodEnd,
    locale,
  );
  const taxNote = taxTreatmentNote(invoice.taxTreatment, language);
  const showVat =
    invoice.taxTreatment !== "exempt_small_business" &&
    (taxRate > 0 || invoice.taxTreatment !== "standard");

  return (
    <div className="invoice-sheet" data-testid="invoice-sheet" style={s.page}>
      <header style={s.header}>
        <div>
          {business.logo ? <img alt="" src={business.logo.src} style={s.logoImage} /> : null}
          {business.name ? <p style={s.businessName}>{business.name}</p> : null}
          {business.address ? <Lines style={s.businessAddress} text={business.address} /> : null}
        </div>
        <div style={s.headerRight}>
          <p data-testid="invoice-sheet-number" style={{ ...s.invoiceNumber, color: accent }}>
            {number}
          </p>
          <p style={s.invoiceLabel}>{isCreditNote ? t("creditNote") : t("invoice")}</p>
          {invoice.originalNumber ? (
            <p style={s.invoiceLabel}>{t("forInvoice", { number: invoice.originalNumber })}</p>
          ) : null}
        </div>
      </header>

      <section style={s.section}>
        <div style={{ maxWidth: 260 }}>
          <p style={s.sectionLabel}>{t("billTo")}</p>
          <p style={s.clientName}>{client.name}</p>
          {companyLine ? <p style={s.clientCompany}>{companyLine}</p> : null}
          <p style={s.clientEmail}>{client.email}</p>
          {client.address ? <Lines style={s.clientAddress} text={client.address} /> : null}
          {client.taxIdentifier ? (
            <p style={s.clientVat}>{formatTaxIdentifier(client.taxIdentifier, language)}</p>
          ) : null}
        </div>
        <div>
          <div style={s.dateRow}>
            <span style={s.dateLabel}>{t("issued")}</span>
            <span style={s.dateValue}>{formatDate(invoice.issuedAt, locale)}</span>
          </div>
          <div style={s.dateRow}>
            <span style={s.dateLabel}>{t("due")}</span>
            <span style={s.dateValueDue}>{formatDate(invoice.dueAt, locale)}</span>
          </div>
          {servicePeriod ? (
            <div style={s.dateRow}>
              <span style={s.dateLabel}>
                {invoice.servicePeriodStart === invoice.servicePeriodEnd
                  ? t("serviceDate")
                  : t("servicePeriod")}
              </span>
              <span data-testid="invoice-service-period" style={s.dateValue}>
                {servicePeriod}
              </span>
            </div>
          ) : null}
          {invoice.buyerReference ? (
            <div style={s.dateRow}>
              <span style={s.dateLabel}>{t("buyerReference")}</span>
              <span style={s.dateValue}>{invoice.buyerReference}</span>
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <div style={s.tableHeader}>
          <span style={s.tableHeaderDesc}>{t("description")}</span>
          <span style={s.tableHeaderQty}>{t("quantity")}</span>
          <span style={s.tableHeaderRate}>{t("rate")}</span>
          <span style={s.tableHeaderAmount}>{t("amount")}</span>
        </div>
        {invoice.lineItems.map((item, index) => (
          <div key={index} style={s.tableRow}>
            <span style={s.lineItemDesc}>{item.description}</span>
            <span style={s.lineItemQty}>{formatQuantity(item.quantity, locale)}</span>
            <span style={s.lineItemRate}>{money(item.unitPrice, currency, locale)}</span>
            <span style={s.lineItemAmount}>{money(item.amount, currency, locale)}</span>
          </div>
        ))}
      </section>

      <section style={{ ...s.totals, display: "flex", justifyContent: "space-between" }}>
        <div style={{ alignSelf: "flex-start", paddingTop: 6 }}>
          {stamp ? (
            <span className="rubber-stamp" data-testid="invoice-status" style={{ fontSize: 22 }}>
              {stamp}
            </span>
          ) : null}
        </div>
        <div style={{ flexGrow: 1 }}>
          <div style={s.totalRow}>
            <span style={s.totalLabel}>{t("subtotal")}</span>
            <span style={s.totalValue}>{money(invoice.subtotal, currency, locale)}</span>
          </div>
          {showVat ? (
            <div style={s.totalRow}>
              <span style={s.totalLabel}>{t("vat", { rate: formatNumber(taxRate, locale) })}</span>
              <span style={s.totalValue}>{money(invoice.taxAmount, currency, locale)}</span>
            </div>
          ) : null}
          <div style={s.totalSeparator} />
          <div style={s.totalRow}>
            <span style={s.grandTotalLabel}>{t("total")}</span>
            <span style={s.grandTotalValue}>{money(invoice.total, currency, locale)}</span>
          </div>
        </div>
      </section>

      {taxNote ? (
        <p data-testid="invoice-tax-note" style={s.taxNote}>
          {taxNote}
        </p>
      ) : null}

      {hasPaymentDetails && !isCreditNote ? (
        <section style={s.paymentDetails}>
          <p style={s.paymentSectionLabel}>{t("paymentDetails")}</p>
          <div style={s.paymentRow}>
            <span style={s.paymentLabel}>{t("payableBy")}</span>
            <span style={s.paymentValue}>{formatDate(invoice.dueAt, locale)}</span>
          </div>
          {invoice.paymentLinkUrl ? (
            <div style={s.paymentRow}>
              <span style={s.paymentLabel}>{t("payOnline")}</span>
              <a
                href={invoice.paymentLinkUrl}
                rel="noopener noreferrer"
                style={s.paymentLink}
                target="_blank"
              >
                {invoice.paymentLinkUrl}
              </a>
            </div>
          ) : null}
          {business.iban ? (
            <>
              <div style={s.paymentRow}>
                <span style={s.paymentLabel}>{t("iban")}</span>
                <span style={s.paymentValue}>{formatIbanDisplay(business.iban)}</span>
              </div>
              {business.bic ? (
                <div style={s.paymentRow}>
                  <span style={s.paymentLabel}>{t("bic")}</span>
                  <span style={s.paymentValue}>{business.bic}</span>
                </div>
              ) : null}
            </>
          ) : business.bankDetails ? (
            <div style={s.paymentRow}>
              <span style={s.paymentLabel}>{t("bankTransfer")}</span>
              <span style={s.paymentValue}>{business.bankDetails}</span>
            </div>
          ) : null}
          <div style={{ ...s.paymentRow, marginBottom: 0 }}>
            <span style={s.paymentLabel}>{t("reference")}</span>
            <span style={s.paymentValue}>{t("referenceValue", { number })}</span>
          </div>
        </section>
      ) : null}

      {!isCreditNote ? <p style={s.thanks}>{t("thanks")}</p> : null}

      {invoice.notes ? (
        <section style={s.notes}>
          <p style={s.notesLabel}>{t("notes")}</p>
          <p style={s.notesText}>{invoice.notes}</p>
        </section>
      ) : null}

      <footer style={s.footer}>
        <div>
          {business.taxIdentifier ? (
            <p style={s.footerText}>{formatTaxIdentifier(business.taxIdentifier, language)}</p>
          ) : null}
          {business.name ? <p style={s.footerText}>{business.name}</p> : null}
        </div>
      </footer>
    </div>
  );
}
