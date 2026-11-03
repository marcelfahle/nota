import { Document, Font, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { getTranslator, toIntlLocale } from "@/lib/i18n";
import { formatIbanDisplay } from "@/lib/iban";
import { LOGO_BOX } from "@/lib/image-size";
import { isDraftNumber } from "@/lib/invoice-number";
import { clientCompanyLine, type InvoiceSheetProps } from "@/lib/invoice-sheet";
import { formatTaxIdentifier } from "@/lib/tax-identifier";
import { taxTreatmentNote } from "@/lib/tax-treatment";
import { formatCurrency, formatDate, formatNumber, formatQuantity, type Locale } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Register Inter font family
// ---------------------------------------------------------------------------
Font.register({
  family: "Inter",
  fonts: [
    {
      fontWeight: 400,
      src: "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf",
    },
    {
      fontWeight: 500,
      src: "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-500-normal.ttf",
    },
    {
      fontWeight: 600,
      src: "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.ttf",
    },
  ],
});

// Disable hyphenation for cleaner text
Font.registerHyphenationCallback((word) => [word]);

// ---------------------------------------------------------------------------
// Color palette — monochrome, Vercel-inspired
// ---------------------------------------------------------------------------
const c = {
  black: "#000000",
  border: "#e5e5e5",
  borderSubtle: "#f0f0f0",
  muted: "#a3a3a3",
  secondary: "#525252",
  tertiary: "#737373",
  text: "#171717",
};

// ---------------------------------------------------------------------------
// Styles (alphabetically sorted for linter)
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  businessAddress: {
    color: c.tertiary,
    fontSize: 9,
    lineHeight: 1.6,
  },
  businessName: {
    color: c.text,
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
  },
  clientAddress: {
    color: c.secondary,
    fontSize: 9,
    lineHeight: 1.5,
    marginTop: 4,
  },
  clientCompany: {
    color: c.secondary,
    fontSize: 10,
    marginBottom: 2,
  },
  clientEmail: {
    color: c.tertiary,
    fontSize: 9,
    marginTop: 2,
  },
  clientName: {
    color: c.text,
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 2,
  },
  clientVat: {
    color: c.tertiary,
    fontSize: 8,
    marginTop: 6,
  },
  dateLabel: {
    color: c.tertiary,
    fontSize: 9,
    marginRight: 10,
    width: 92,
  },
  dateRow: {
    flexDirection: "row" as const,
    marginBottom: 6,
  },
  dateValue: {
    color: c.text,
    fontSize: 9,
    fontWeight: 500,
  },
  dateValueDue: {
    color: c.black,
    fontSize: 9,
    fontWeight: 600,
  },
  footer: {
    borderTopColor: c.border,
    borderTopWidth: 1,
    bottom: 32,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    left: 56,
    paddingTop: 14,
    position: "absolute" as const,
    right: 56,
  },
  footerText: {
    color: c.muted,
    fontSize: 8,
    lineHeight: 1.6,
  },
  grandTotalLabel: {
    color: c.black,
    fontSize: 12,
    fontWeight: 600,
    textAlign: "right" as const,
    width: 120,
  },
  grandTotalValue: {
    color: c.black,
    fontSize: 12,
    fontWeight: 600,
    textAlign: "right" as const,
    width: 90,
  },
  header: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginBottom: 48,
  },
  headerLeft: {},
  headerRight: {
    alignItems: "flex-end" as const,
  },
  invoiceLabel: {
    color: c.tertiary,
    fontSize: 8,
    fontWeight: 500,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
  },
  invoiceNumber: {
    color: c.black,
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  lineItemAmount: {
    color: c.text,
    fontWeight: 500,
    textAlign: "right" as const,
    width: "20%",
  },
  lineItemDesc: { color: c.text, width: "45%" },
  lineItemQty: { color: c.secondary, textAlign: "right" as const, width: "15%" },
  lineItemRate: { color: c.secondary, textAlign: "right" as const, width: "20%" },
  logoImage: {
    marginBottom: 12,
    objectFit: "contain" as const,
  },
  notes: {
    marginTop: 32,
  },
  notesLabel: {
    color: c.tertiary,
    fontSize: 8,
    fontWeight: 500,
    letterSpacing: 1.5,
    marginBottom: 6,
    textTransform: "uppercase" as const,
  },
  notesText: {
    color: c.secondary,
    fontSize: 9,
    lineHeight: 1.6,
  },
  page: {
    backgroundColor: "#fffefb",
    fontFamily: "Inter",
    fontSize: 9,
    fontWeight: 400,
    paddingBottom: 72,
    paddingHorizontal: 56,
    paddingTop: 52,
  },
  paymentDetails: {
    borderColor: c.border,
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 32,
    padding: 20,
  },
  paymentLabel: {
    color: c.tertiary,
    fontSize: 9,
    marginRight: 10,
    width: 100,
  },
  paymentLink: {
    color: c.text,
    fontSize: 9,
    fontWeight: 500,
    textDecoration: "none",
  },
  paymentRow: {
    flexDirection: "row" as const,
    marginBottom: 6,
  },
  paymentSectionLabel: {
    color: c.tertiary,
    fontSize: 8,
    fontWeight: 500,
    letterSpacing: 1.5,
    marginBottom: 12,
    textTransform: "uppercase" as const,
  },
  paymentValue: {
    color: c.text,
    fontSize: 9,
    fontWeight: 500,
  },
  section: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginBottom: 40,
  },
  sectionLabel: {
    color: c.tertiary,
    fontSize: 8,
    fontWeight: 500,
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: "uppercase" as const,
  },
  tableHeader: {
    borderBottomColor: c.border,
    borderBottomWidth: 1,
    color: c.tertiary,
    flexDirection: "row" as const,
    fontSize: 8,
    fontWeight: 500,
    letterSpacing: 1,
    paddingBottom: 10,
    textTransform: "uppercase" as const,
  },
  tableHeaderAmount: { textAlign: "right" as const, width: "20%" },
  tableHeaderDesc: { width: "45%" },
  tableHeaderQty: { textAlign: "right" as const, width: "15%" },
  tableHeaderRate: { textAlign: "right" as const, width: "20%" },
  tableRow: {
    borderBottomColor: c.borderSubtle,
    borderBottomWidth: 1,
    flexDirection: "row" as const,
    fontSize: 9,
    paddingVertical: 12,
  },
  taxNote: {
    color: c.tertiary,
    fontSize: 8,
    marginTop: 12,
  },
  thanks: {
    color: c.secondary,
    fontSize: 9,
    marginTop: 24,
  },
  totalLabel: {
    color: c.tertiary,
    fontSize: 9,
    textAlign: "right" as const,
    width: 120,
  },
  totalRow: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    marginBottom: 6,
  },
  totals: {
    marginTop: 20,
  },
  totalSeparator: {
    borderTopColor: c.border,
    borderTopWidth: 1,
    marginBottom: 8,
    marginLeft: "auto" as const,
    marginTop: 4,
    width: 210,
  },
  totalValue: {
    color: c.text,
    fontSize: 9,
    fontWeight: 500,
    textAlign: "right" as const,
    width: 90,
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCurrencyPdf(amount: number | string, currency: string, locale: Locale): string {
  const num = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  return formatCurrency(num, currency, locale);
}

function formatServicePeriod(
  start: string | null | undefined,
  end: string | null | undefined,
  locale: Locale,
): string | null {
  if (!start || !end) {
    return null;
  }
  return start === end
    ? formatDate(start, locale)
    : `${formatDate(start, locale)} – ${formatDate(end, locale)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function InvoicePdf({
  business,
  client,
  invoice,
  locale: language = "en",
}: InvoiceSheetProps) {
  const currency = invoice.currency;
  const locale = toIntlLocale(language);
  const t = getTranslator(language, "pdf");
  const taxRate = Number.parseFloat(invoice.taxRate);
  const hasPaymentDetails = business.iban || business.bankDetails || invoice.paymentLinkUrl;
  const accent = /^#[\da-f]{6}$/i.test(business.brandColor ?? "") ? business.brandColor! : c.text;
  const isCreditNote = invoice.kind === "credit_note";
  // A draft has no number yet; the document says so instead of printing the identifier.
  const number = isDraftNumber(invoice.number) ? t("draft") : invoice.number;
  const companyLine = clientCompanyLine(client);
  const logo = business.logo;
  const servicePeriod = formatServicePeriod(
    invoice.servicePeriodStart,
    invoice.servicePeriodEnd,
    locale,
  );
  const taxNote = taxTreatmentNote(invoice.taxTreatment, language);
  // A § 19 UStG invoice carries no VAT line at all, only the statutory note.
  const showVat =
    invoice.taxTreatment !== "exempt_small_business" &&
    (taxRate > 0 || invoice.taxTreatment !== "standard");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {logo ? (
              <Image
                src={logo.src}
                style={[
                  styles.logoImage,
                  { height: logo.height ?? LOGO_BOX.height, width: logo.width ?? LOGO_BOX.height },
                ]}
              />
            ) : null}
            {business.name && <Text style={styles.businessName}>{business.name}</Text>}
            {business.address &&
              business.address.split("\n").map((line, i) => (
                <Text key={i} style={styles.businessAddress}>
                  {line}
                </Text>
              ))}
          </View>
          <View style={styles.headerRight}>
            <Text style={[styles.invoiceNumber, { color: accent }]}>{number}</Text>
            <Text style={styles.invoiceLabel}>{isCreditNote ? t("creditNote") : t("invoice")}</Text>
            {invoice.originalNumber ? (
              <Text style={styles.invoiceLabel}>
                {t("forInvoice", { number: invoice.originalNumber })}
              </Text>
            ) : null}
          </View>
        </View>

        {/* ── Bill To + Dates ── */}
        <View style={styles.section}>
          <View style={{ maxWidth: 260 }}>
            <Text style={styles.sectionLabel}>{t("billTo")}</Text>
            <Text style={styles.clientName}>{client.name}</Text>
            {companyLine ? <Text style={styles.clientCompany}>{companyLine}</Text> : null}
            <Text style={styles.clientEmail}>{client.email}</Text>
            {client.address &&
              client.address.split("\n").map((line, i) => (
                <Text key={i} style={styles.clientAddress}>
                  {line}
                </Text>
              ))}
            {client.taxIdentifier && (
              <Text style={styles.clientVat}>
                {formatTaxIdentifier(client.taxIdentifier, language)}
              </Text>
            )}
          </View>
          <View>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>{t("issued")}</Text>
              <Text style={styles.dateValue}>{formatDate(invoice.issuedAt, locale)}</Text>
            </View>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>{t("due")}</Text>
              <Text style={styles.dateValueDue}>{formatDate(invoice.dueAt, locale)}</Text>
            </View>
            {servicePeriod ? (
              <View style={styles.dateRow}>
                <Text style={styles.dateLabel}>
                  {invoice.servicePeriodStart === invoice.servicePeriodEnd
                    ? t("serviceDate")
                    : t("servicePeriod")}
                </Text>
                <Text style={styles.dateValue}>{servicePeriod}</Text>
              </View>
            ) : null}
            {invoice.buyerReference ? (
              <View style={styles.dateRow}>
                <Text style={styles.dateLabel}>{t("buyerReference")}</Text>
                <Text style={styles.dateValue}>{invoice.buyerReference}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Line Items ── */}
        <View>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderDesc}>{t("description")}</Text>
            <Text style={styles.tableHeaderQty}>{t("quantity")}</Text>
            <Text style={styles.tableHeaderRate}>{t("rate")}</Text>
            <Text style={styles.tableHeaderAmount}>{t("amount")}</Text>
          </View>
          {invoice.lineItems.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.lineItemDesc}>{item.description}</Text>
              <Text style={styles.lineItemQty}>{formatQuantity(item.quantity, locale)}</Text>
              <Text style={styles.lineItemRate}>
                {formatCurrencyPdf(item.unitPrice, currency, locale)}
              </Text>
              <Text style={styles.lineItemAmount}>
                {formatCurrencyPdf(item.amount, currency, locale)}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Totals ── */}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t("subtotal")}</Text>
            <Text style={styles.totalValue}>
              {formatCurrencyPdf(invoice.subtotal, currency, locale)}
            </Text>
          </View>
          {showVat && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {t("vat", { rate: formatNumber(taxRate, locale) })}
              </Text>
              <Text style={styles.totalValue}>
                {formatCurrencyPdf(invoice.taxAmount, currency, locale)}
              </Text>
            </View>
          )}
          <View style={styles.totalSeparator} />
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>{t("total")}</Text>
            <Text style={styles.grandTotalValue}>
              {formatCurrencyPdf(invoice.total, currency, locale)}
            </Text>
          </View>
        </View>

        {/* ── Tax treatment note (§ 14 Abs. 4 Nr. 8 UStG) ── */}
        {taxNote ? <Text style={styles.taxNote}>{taxNote}</Text> : null}

        {/* ── Payment Details ── */}
        {hasPaymentDetails && !isCreditNote && (
          <View style={styles.paymentDetails}>
            <Text style={styles.paymentSectionLabel}>{t("paymentDetails")}</Text>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>{t("payableBy")}</Text>
              <Text style={styles.paymentValue}>{formatDate(invoice.dueAt, locale)}</Text>
            </View>
            {invoice.paymentLinkUrl && (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>{t("payOnline")}</Text>
                <Link src={invoice.paymentLinkUrl} style={styles.paymentLink}>
                  {invoice.paymentLinkUrl}
                </Link>
              </View>
            )}
            {business.iban ? (
              <View>
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>{t("iban")}</Text>
                  <Text style={styles.paymentValue}>{formatIbanDisplay(business.iban)}</Text>
                </View>
                {business.bic && (
                  <View style={styles.paymentRow}>
                    <Text style={styles.paymentLabel}>{t("bic")}</Text>
                    <Text style={styles.paymentValue}>{business.bic}</Text>
                  </View>
                )}
              </View>
            ) : business.bankDetails ? (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>{t("bankTransfer")}</Text>
                <Text style={styles.paymentValue}>{business.bankDetails}</Text>
              </View>
            ) : null}
            <View style={[styles.paymentRow, { marginBottom: 0 }]}>
              <Text style={styles.paymentLabel}>{t("reference")}</Text>
              <Text style={styles.paymentValue}>{t("referenceValue", { number })}</Text>
            </View>
          </View>
        )}

        {!isCreditNote && <Text style={styles.thanks}>{t("thanks")}</Text>}

        {/* ── Notes ── */}
        {invoice.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>{t("notes")}</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* ── Footer ── */}
        <View fixed style={styles.footer}>
          <View>
            {business.taxIdentifier && (
              <Text style={styles.footerText}>
                {formatTaxIdentifier(business.taxIdentifier, language)}
              </Text>
            )}
            {business.name && <Text style={styles.footerText}>{business.name}</Text>}
          </View>
        </View>
      </Page>
    </Document>
  );
}
