import { Document, Font, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatIbanDisplay } from "@/lib/iban";

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
// Types
// ---------------------------------------------------------------------------
type LineItem = {
  amount: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type InvoicePdfProps = {
  business: {
    address?: string | null;
    bankDetails?: string | null;
    bic?: string | null;
    iban?: string | null;
    logoSrc?: string | null;
    name?: string | null;
    vatNumber?: string | null;
  };
  client: {
    address?: string | null;
    company?: string | null;
    email: string;
    name: string;
    vatNumber?: string | null;
  };
  invoice: {
    currency: string;
    dueAt: string;
    issuedAt: string;
    lineItems: Array<LineItem>;
    notes?: string | null;
    number: string;
    paymentLinkUrl?: string | null;
    reverseCharge?: string | null;
    subtotal: string;
    taxAmount: string;
    taxRate: string;
    total: string;
  };
};

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
    width: 64,
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
    width: 80,
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
    height: 44,
    marginBottom: 12,
    objectFit: "contain" as const,
    width: 44,
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
    width: 72,
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
  reverseCharge: {
    color: c.tertiary,
    fontSize: 8,
    marginTop: 12,
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
  totalLabel: {
    color: c.tertiary,
    fontSize: 9,
    textAlign: "right" as const,
    width: 80,
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
    width: 170,
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
function formatCurrencyPdf(amount: number | string, currency: string): string {
  const num = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    currency,
    style: "currency",
  }).format(num);
}

function formatDatePdf(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function InvoicePdf({ business, client, invoice }: InvoicePdfProps) {
  const currency = invoice.currency;
  const taxRate = Number.parseFloat(invoice.taxRate);
  const hasPaymentDetails = business.iban || business.bankDetails || invoice.paymentLinkUrl;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {business.logoSrc && <Image src={business.logoSrc} style={styles.logoImage} />}
            {business.name && <Text style={styles.businessName}>{business.name}</Text>}
            {business.address && <Text style={styles.businessAddress}>{business.address}</Text>}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.invoiceNumber}>{invoice.number}</Text>
            <Text style={styles.invoiceLabel}>Invoice</Text>
          </View>
        </View>

        {/* ── Bill To + Dates ── */}
        <View style={styles.section}>
          <View style={{ maxWidth: 260 }}>
            <Text style={styles.sectionLabel}>Bill To</Text>
            <Text style={styles.clientName}>{client.name}</Text>
            {client.company && <Text style={styles.clientCompany}>{client.company}</Text>}
            <Text style={styles.clientEmail}>{client.email}</Text>
            {client.address && <Text style={styles.clientAddress}>{client.address}</Text>}
            {client.vatNumber && <Text style={styles.clientVat}>VAT: {client.vatNumber}</Text>}
          </View>
          <View>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Issued</Text>
              <Text style={styles.dateValue}>{formatDatePdf(invoice.issuedAt)}</Text>
            </View>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Due</Text>
              <Text style={styles.dateValueDue}>{formatDatePdf(invoice.dueAt)}</Text>
            </View>
          </View>
        </View>

        {/* ── Line Items ── */}
        <View>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderDesc}>Description</Text>
            <Text style={styles.tableHeaderQty}>Qty</Text>
            <Text style={styles.tableHeaderRate}>Rate</Text>
            <Text style={styles.tableHeaderAmount}>Amount</Text>
          </View>
          {invoice.lineItems.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.lineItemDesc}>{item.description}</Text>
              <Text style={styles.lineItemQty}>{item.quantity}</Text>
              <Text style={styles.lineItemRate}>{formatCurrencyPdf(item.unitPrice, currency)}</Text>
              <Text style={styles.lineItemAmount}>{formatCurrencyPdf(item.amount, currency)}</Text>
            </View>
          ))}
        </View>

        {/* ── Totals ── */}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatCurrencyPdf(invoice.subtotal, currency)}</Text>
          </View>
          {taxRate > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax ({invoice.taxRate}%)</Text>
              <Text style={styles.totalValue}>
                {formatCurrencyPdf(invoice.taxAmount, currency)}
              </Text>
            </View>
          )}
          <View style={styles.totalSeparator} />
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{formatCurrencyPdf(invoice.total, currency)}</Text>
          </View>
        </View>

        {/* ── Reverse Charge ── */}
        {invoice.reverseCharge === "true" && (
          <Text style={styles.reverseCharge}>
            Reverse charge — VAT not applicable per Article 196 of the EU VAT Directive
          </Text>
        )}

        {/* ── Payment Details ── */}
        {hasPaymentDetails && (
          <View style={styles.paymentDetails}>
            <Text style={styles.paymentSectionLabel}>Payment Details</Text>
            {invoice.paymentLinkUrl && (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Pay online</Text>
                <Link src={invoice.paymentLinkUrl} style={styles.paymentLink}>
                  {invoice.paymentLinkUrl}
                </Link>
              </View>
            )}
            {business.iban ? (
              <View>
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>IBAN</Text>
                  <Text style={styles.paymentValue}>{formatIbanDisplay(business.iban)}</Text>
                </View>
                {business.bic && (
                  <View style={styles.paymentRow}>
                    <Text style={styles.paymentLabel}>BIC</Text>
                    <Text style={styles.paymentValue}>{business.bic}</Text>
                  </View>
                )}
              </View>
            ) : business.bankDetails ? (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Bank transfer</Text>
                <Text style={styles.paymentValue}>{business.bankDetails}</Text>
              </View>
            ) : null}
            <View style={[styles.paymentRow, { marginBottom: 0 }]}>
              <Text style={styles.paymentLabel}>Reference</Text>
              <Text style={styles.paymentValue}>Invoice {invoice.number}</Text>
            </View>
          </View>
        )}

        {/* ── Notes ── */}
        {invoice.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* ── Footer ── */}
        <View fixed style={styles.footer}>
          <View>
            {business.vatNumber && <Text style={styles.footerText}>VAT: {business.vatNumber}</Text>}
            {business.name && <Text style={styles.footerText}>{business.name}</Text>}
          </View>
        </View>
      </Page>
    </Document>
  );
}
