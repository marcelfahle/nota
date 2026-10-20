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
import { getTranslator, type AppLocale } from "@/lib/i18n";

export function passwordResetSubject(locale: AppLocale = "en") {
  return getTranslator(locale, "emails.passwordReset")("subject", { app: APP_NAME });
}

export function PasswordResetEmail({
  locale = "en",
  name,
  resetUrl,
}: {
  locale?: AppLocale;
  name: string;
  resetUrl: string;
}) {
  const t = getTranslator(locale, "emails.passwordReset");

  return (
    <Html>
      <Head />
      <Preview>{passwordResetSubject(locale)}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.logoSection}>
            <Text style={styles.logo}>{APP_NAME}</Text>
          </Section>

          <Heading style={styles.heading}>{t("heading")}</Heading>

          <Text style={styles.text}>{t("greeting", { name })}</Text>

          <Text style={styles.text}>{t("body", { app: APP_NAME })}</Text>

          <Section style={styles.buttonSection}>
            <Button href={resetUrl} style={styles.button}>
              {t("button")}
            </Button>
          </Section>

          <Text style={styles.text}>{t("ignore")}</Text>

          <Hr style={styles.hr} />

          <Text style={styles.footer}>{APP_NAME}</Text>
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
    margin: "24px 0",
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
  },
};
