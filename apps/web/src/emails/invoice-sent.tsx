import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { APP_NAME } from "@/lib/app-brand";
import { getTranslator, toIntlLocale, type AppLocale } from "@/lib/i18n";
import { formatCurrency, formatDate, type Locale } from "@/lib/utils";

type InvoiceSentEmailProps = {
  bankDetails?: string | null;
  businessName: string;
  clientName: string;
  currency: string;
  dueAt: string;
  invoiceNumber: string;
  invoiceUrl: string | null;
  /** The document language: the customer reads this, not the sender. */
  locale?: AppLocale;
  paymentLinkUrl: string | null;
  reminder?: boolean;
  /** A copy the sender mailed to themselves. It must never pass for a real invoice. */
  testCopy?: boolean;
  total: string;
  /** The XRechnung XML travels with the PDF. */
  xmlAttached?: boolean;
};

function formatCurrencyEmail(amount: string, currency: string, locale: Locale): string {
  return formatCurrency(Number.parseFloat(amount), currency, locale);
}

function formatDateEmail(dateStr: string, locale: Locale): string {
  return formatDate(dateStr, locale, { day: "numeric", month: "long", year: "numeric" });
}

/** The subject line the job sends with the email. */
export function invoiceSentSubject(
  props: Pick<
    InvoiceSentEmailProps,
    "businessName" | "currency" | "invoiceNumber" | "locale" | "reminder" | "testCopy" | "total"
  >,
) {
  const language = props.locale ?? "en";
  const t = getTranslator(language, "emails.invoiceSent");
  const values = {
    amount: formatCurrencyEmail(props.total, props.currency, toIntlLocale(language)),
    business: props.businessName,
    number: props.invoiceNumber,
  };
  if (props.reminder) {
    return t("reminderSubject", values);
  }
  return props.testCopy ? t("testSubject", values) : t("subject", values);
}

export function InvoiceSentEmail({
  bankDetails,
  businessName,
  clientName,
  currency,
  dueAt,
  invoiceNumber,
  invoiceUrl,
  locale: language = "en",
  paymentLinkUrl,
  reminder = false,
  testCopy = false,
  total,
  xmlAttached = false,
}: InvoiceSentEmailProps) {
  const locale = toIntlLocale(language);
  const t = getTranslator(language, "emails.invoiceSent");
  const actionUrl = invoiceUrl ?? paymentLinkUrl;
  const subject = invoiceSentSubject({
    businessName,
    currency,
    invoiceNumber,
    locale: language,
    reminder,
    testCopy,
    total,
  });

  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.logoSection}>
            <Text style={styles.logo}>{APP_NAME}</Text>
          </Section>

          {testCopy ? (
            <Text style={styles.testCopy}>{t("testCopy", { app: APP_NAME })}</Text>
          ) : null}

          <Heading style={styles.heading}>{reminder ? t("reminderHeading") : t("heading")}</Heading>

          <Text style={styles.text}>{t("greeting", { name: clientName })}</Text>

          <Text style={styles.text}>
            {reminder
              ? t("reminderIntro", { number: invoiceNumber })
              : t("intro", { business: businessName })}
          </Text>

          {xmlAttached ? <Text style={styles.text}>{t("xmlAttached")}</Text> : null}

          <Section style={styles.invoiceBox}>
            <Text style={styles.invoiceLabel}>{t("label")}</Text>
            <Text style={styles.invoiceNumber}>{invoiceNumber}</Text>
            <Text style={styles.invoiceAmount}>{formatCurrencyEmail(total, currency, locale)}</Text>
            <Text style={styles.invoiceDue}>
              {t("due", { date: formatDateEmail(dueAt, locale) })}
            </Text>
          </Section>

          {actionUrl ? (
            <Section style={styles.buttonSection}>
              <Button href={actionUrl} style={styles.button}>
                {invoiceUrl ? t("viewInvoice") : t("payNow")}
              </Button>
            </Section>
          ) : (
            <Text style={{ ...styles.text, whiteSpace: "pre-line" }}>
              {bankDetails
                ? `${t("bankTransfer", { number: invoiceNumber })}\n${bankDetails}`
                : t("contactSender")}
            </Text>
          )}

          {reminder ? null : <Text style={styles.text}>{t("thanks")}</Text>}

          <Hr style={styles.hr} />

          <Text style={styles.footer}>{businessName}</Text>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: "#fafafa",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    margin: "0 auto" as const,
  },
  button: {
    backgroundColor: "#18181b",
    borderRadius: "6px",
    color: "#ffffff",
    display: "inline-block" as const,
    fontSize: "14px",
    fontWeight: "600",
    lineHeight: "1",
    padding: "12px 32px",
    textDecoration: "none",
  },
  buttonSection: {
    textAlign: "center" as const,
  },
  container: {
    backgroundColor: "#ffffff",
    border: "1px solid #e4e4e7",
    borderRadius: "8px",
    margin: "40px auto",
    maxWidth: "480px",
    padding: "40px 32px",
  },
  footer: {
    color: "#a1a1aa",
    fontSize: "12px",
    lineHeight: "1.5",
    textAlign: "center" as const,
  },
  heading: {
    color: "#18181b",
    fontSize: "20px",
    fontWeight: "600",
    lineHeight: "1.3",
    margin: "0 0 16px",
    textAlign: "center" as const,
  },
  hr: {
    borderColor: "#e4e4e7",
    margin: "32px 0 24px",
  },
  invoiceAmount: {
    color: "#18181b",
    fontSize: "28px",
    fontWeight: "700",
    lineHeight: "1.2",
    margin: "8px 0 4px",
    textAlign: "center" as const,
  },
  invoiceBox: {
    backgroundColor: "#fafafa",
    borderRadius: "8px",
    margin: "24px 0",
    padding: "24px",
    textAlign: "center" as const,
  },
  invoiceDue: {
    color: "#71717a",
    fontSize: "13px",
    lineHeight: "1.5",
    margin: "0",
    textAlign: "center" as const,
  },
  invoiceLabel: {
    color: "#71717a",
    fontSize: "11px",
    letterSpacing: "1px",
    lineHeight: "1",
    margin: "0 0 4px",
    textAlign: "center" as const,
    textTransform: "uppercase" as const,
  },
  invoiceNumber: {
    color: "#18181b",
    fontFamily: "Courier New, monospace",
    fontSize: "16px",
    fontWeight: "700",
    lineHeight: "1.3",
    margin: "0",
    textAlign: "center" as const,
  },
  logo: {
    color: "#18181b",
    fontSize: "18px",
    fontWeight: "700",
    lineHeight: "1",
    margin: "0 0 24px",
    textAlign: "center" as const,
  },
  logoSection: {
    textAlign: "center" as const,
  },
  testCopy: {
    backgroundColor: "#d1fd39",
    color: "#1f1b16",
    fontSize: "14px",
    fontWeight: 600,
    lineHeight: "20px",
    margin: "0 0 20px",
    padding: "12px 14px",
  },
  text: {
    color: "#3f3f46",
    fontSize: "14px",
    lineHeight: "1.6",
    margin: "0 0 12px",
  },
};
