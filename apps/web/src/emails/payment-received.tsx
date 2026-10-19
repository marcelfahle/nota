import {
  Body,
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

type PaymentReceivedEmailProps = {
  clientName: string;
  currency: string;
  invoiceNumber: string;
  /** The recipient is the workspace member, so this is their UI language. */
  locale?: AppLocale;
  paidAt: string;
  total: string;
};

function formatCurrencyEmail(amount: string, currency: string, locale: Locale): string {
  return formatCurrency(Number.parseFloat(amount), currency, locale);
}

function formatDateEmail(dateStr: string, locale: Locale): string {
  return formatDate(dateStr, locale, { day: "numeric", month: "long", year: "numeric" });
}

export function paymentReceivedSubject(
  props: Pick<PaymentReceivedEmailProps, "currency" | "invoiceNumber" | "locale" | "total">,
) {
  const language = props.locale ?? "en";
  return getTranslator(language, "emails.paymentReceived")("subject", {
    amount: formatCurrencyEmail(props.total, props.currency, toIntlLocale(language)),
    number: props.invoiceNumber,
  });
}

export function PaymentReceivedEmail({
  clientName,
  currency,
  invoiceNumber,
  locale: language = "en",
  paidAt,
  total,
}: PaymentReceivedEmailProps) {
  const locale = toIntlLocale(language);
  const t = getTranslator(language, "emails.paymentReceived");
  const subject = paymentReceivedSubject({ currency, invoiceNumber, locale: language, total });

  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.logoSection}>
            <Text style={styles.logo}>{APP_NAME}</Text>
          </Section>

          <Heading style={styles.heading}>{t("heading")}</Heading>

          <Text style={styles.text}>
            {t("body", { client: clientName, number: invoiceNumber })}
          </Text>

          <Section style={styles.invoiceBox}>
            <Text style={styles.invoiceLabel}>{t("amountPaid")}</Text>
            <Text style={styles.invoiceAmount}>{formatCurrencyEmail(total, currency, locale)}</Text>
            <Text style={styles.invoiceDetail}>{t("invoice", { number: invoiceNumber })}</Text>
            <Text style={styles.invoiceDetail}>
              {t("paidOn", { date: formatDateEmail(paidAt, locale) })}
            </Text>
          </Section>

          <Hr style={styles.hr} />

          <Text style={styles.footer}>{t("footer", { app: APP_NAME })}</Text>
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
    color: "#10b981",
    fontSize: "28px",
    fontWeight: "700",
    lineHeight: "1.2",
    margin: "8px 0 12px",
    textAlign: "center" as const,
  },
  invoiceBox: {
    backgroundColor: "#fafafa",
    borderRadius: "8px",
    margin: "24px 0",
    padding: "24px",
    textAlign: "center" as const,
  },
  invoiceDetail: {
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
  text: {
    color: "#3f3f46",
    fontSize: "14px",
    lineHeight: "1.6",
    margin: "0 0 12px",
    textAlign: "center" as const,
  },
};
