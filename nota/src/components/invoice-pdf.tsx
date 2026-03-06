import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { APP_MONOGRAM, APP_NAME } from "@/lib/app-brand";

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
    reverseCharge?: string | null;
    subtotal: string;
    taxAmount: string;
    taxRate: string;
    total: string;
  };
};

const styles = StyleSheet.create({
  billTo: {
    color: "#71717a",
    fontSize: 8,
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: "uppercase" as const,
  },
  body: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingBottom: 60,
    paddingHorizontal: 48,
    paddingTop: 48,
  },
  clientAddress: {
    color: "#52525b",
    fontSize: 9,
    lineHeight: 1.5,
  },
  clientCompany: {
    color: "#3f3f46",
    fontSize: 10,
  },
  clientEmail: {
    color: "#71717a",
    fontSize: 9,
    marginTop: 2,
  },
  clientName: {
    color: "#18181b",
    fontSize: 11,
    fontWeight: 700,
  },
  dateLabel: {
    color: "#71717a",
    fontSize: 9,
    width: 60,
  },
  dateRow: {
    flexDirection: "row" as const,
    marginBottom: 4,
  },
  dateValue: {
    color: "#18181b",
    fontSize: 9,
    fontWeight: 700,
  },
  footer: {
    borderTopColor: "#e4e4e7",
    borderTopWidth: 1,
    bottom: 30,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    left: 48,
    paddingTop: 12,
    position: "absolute" as const,
    right: 48,
  },
  footerText: {
    color: "#a1a1aa",
    fontSize: 7,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginBottom: 40,
  },
  invoiceLabel: {
    color: "#71717a",
    fontSize: 8,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
  },
  invoiceNumber: {
    color: "#18181b",
    fontFamily: "Courier",
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 4,
  },
  lineItemAmount: {
    color: "#18181b",
    fontWeight: 700,
    textAlign: "right" as const,
    width: "20%",
  },
  lineItemDesc: {
    color: "#18181b",
    width: "40%",
  },
  lineItemQty: {
    color: "#52525b",
    textAlign: "right" as const,
    width: "15%",
  },
  lineItemRate: {
    color: "#52525b",
    textAlign: "right" as const,
    width: "25%",
  },
  logo: {
    backgroundColor: "#18181b",
    borderRadius: 4,
    color: "#ffffff",
    fontFamily: "Courier",
    fontSize: 10,
    fontWeight: 700,
    height: 28,
    lineHeight: 1,
    paddingTop: 9,
    textAlign: "center" as const,
    width: 28,
  },
  logoImage: {
    borderRadius: 6,
    height: 28,
    objectFit: "contain" as const,
    width: 28,
  },
  logoRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 8,
    marginBottom: 6,
  },
  logoText: {
    color: "#18181b",
    fontSize: 16,
    fontWeight: 700,
  },
  notes: {
    marginTop: 32,
  },
  notesLabel: {
    color: "#71717a",
    fontSize: 8,
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: "uppercase" as const,
  },
  notesText: {
    color: "#52525b",
    fontSize: 9,
    lineHeight: 1.5,
  },
  reverseCharge: {
    color: "#71717a",
    fontSize: 8,
    marginTop: 8,
  },
  section: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginBottom: 32,
  },
  tableBody: {},
  tableHeader: {
    borderBottomColor: "#e4e4e7",
    borderBottomWidth: 1,
    color: "#71717a",
    flexDirection: "row" as const,
    fontSize: 8,
    letterSpacing: 1,
    paddingBottom: 8,
    textTransform: "uppercase" as const,
  },
  tableHeaderAmount: {
    textAlign: "right" as const,
    width: "20%",
  },
  tableHeaderDesc: {
    width: "40%",
  },
  tableHeaderQty: {
    textAlign: "right" as const,
    width: "15%",
  },
  tableHeaderRate: {
    textAlign: "right" as const,
    width: "25%",
  },
  tableRow: {
    borderBottomColor: "#f4f4f5",
    borderBottomWidth: 1,
    flexDirection: "row" as const,
    fontSize: 9,
    paddingVertical: 10,
  },
  totalLabel: {
    color: "#71717a",
    fontSize: 9,
    width: 80,
  },
  totalRow: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    marginBottom: 4,
  },
  totals: {
    marginTop: 16,
  },
  totalSeparator: {
    borderTopColor: "#e4e4e7",
    borderTopWidth: 1,
    marginBottom: 6,
    marginLeft: "auto" as const,
    marginTop: 4,
    width: 160,
  },
  totalValue: {
    color: "#18181b",
    fontSize: 9,
    fontWeight: 700,
    textAlign: "right" as const,
    width: 80,
  },
});

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

export function InvoicePdf({ business, client, invoice }: InvoicePdfProps) {
  const currency = invoice.currency;
  const taxRate = Number.parseFloat(invoice.taxRate);

  return (
    <Document>
      <Page size="A4" style={styles.body}>
        {/* Header: Logo + Invoice Number */}
        <View style={styles.header}>
          <View>
            <View style={styles.logoRow}>
              {business.logoSrc ? (
                <Image src={business.logoSrc} style={styles.logoImage} />
              ) : (
                <View style={styles.logo}>
                  <Text>{APP_MONOGRAM}</Text>
                </View>
              )}
              <Text style={styles.logoText}>{APP_NAME}</Text>
            </View>
            {business.name && (
              <Text style={{ color: "#3f3f46", fontSize: 10, marginTop: 4 }}>{business.name}</Text>
            )}
            {business.address && (
              <Text style={{ color: "#71717a", fontSize: 9, lineHeight: 1.5, marginTop: 2 }}>
                {business.address}
              </Text>
            )}
          </View>
          <View style={{ alignItems: "flex-end" as const }}>
            <Text style={styles.invoiceNumber}>{invoice.number}</Text>
            <Text style={styles.invoiceLabel}>Invoice</Text>
          </View>
        </View>

        {/* Bill To + Dates */}
        <View style={styles.section}>
          <View style={{ maxWidth: 240 }}>
            <Text style={styles.billTo}>Bill To</Text>
            <Text style={styles.clientName}>{client.name}</Text>
            {client.company && <Text style={styles.clientCompany}>{client.company}</Text>}
            <Text style={styles.clientEmail}>{client.email}</Text>
            {client.address && <Text style={styles.clientAddress}>{client.address}</Text>}
            {client.vatNumber && (
              <Text style={{ color: "#71717a", fontSize: 8, marginTop: 4 }}>
                VAT: {client.vatNumber}
              </Text>
            )}
          </View>
          <View>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Issued</Text>
              <Text style={styles.dateValue}>{formatDatePdf(invoice.issuedAt)}</Text>
            </View>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Due</Text>
              <Text style={styles.dateValue}>{formatDatePdf(invoice.dueAt)}</Text>
            </View>
            <View style={[styles.dateRow, { marginTop: 8 }]}>
              <Text style={styles.dateLabel}>Currency</Text>
              <Text style={styles.dateValue}>{currency}</Text>
            </View>
          </View>
        </View>

        {/* Line Items Table */}
        <View>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderDesc}>Description</Text>
            <Text style={styles.tableHeaderQty}>Qty</Text>
            <Text style={styles.tableHeaderRate}>Rate</Text>
            <Text style={styles.tableHeaderAmount}>Amount</Text>
          </View>
          <View style={styles.tableBody}>
            {invoice.lineItems.map((item, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={styles.lineItemDesc}>{item.description}</Text>
                <Text style={styles.lineItemQty}>{item.quantity}</Text>
                <Text style={styles.lineItemRate}>
                  {formatCurrencyPdf(item.unitPrice, currency)}
                </Text>
                <Text style={styles.lineItemAmount}>
                  {formatCurrencyPdf(item.amount, currency)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Totals */}
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
            <Text style={[styles.totalLabel, { fontSize: 11, fontWeight: 700 }]}>Total</Text>
            <Text style={[styles.totalValue, { fontSize: 11 }]}>
              {formatCurrencyPdf(invoice.total, currency)}
            </Text>
          </View>
        </View>

        {/* Reverse Charge */}
        {invoice.reverseCharge === "true" && (
          <Text style={styles.reverseCharge}>
            Reverse charge — VAT not applicable per Article 196 of the EU VAT Directive
          </Text>
        )}

        {/* Notes */}
        {invoice.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View fixed style={styles.footer}>
          <View>
            {business.vatNumber && <Text style={styles.footerText}>VAT: {business.vatNumber}</Text>}
            {business.name && <Text style={styles.footerText}>{business.name}</Text>}
          </View>
          {business.bankDetails && (
            <View>
              <Text style={styles.footerText}>{business.bankDetails}</Text>
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}
