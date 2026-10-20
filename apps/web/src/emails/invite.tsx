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

type InviteEmailProps = {
  inviteUrl: string;
  /** The language of the person who invited; the invitee has no account yet. */
  locale?: AppLocale;
  orgName: string;
  role: "owner" | "admin" | "member";
};

export function inviteSubject({
  locale = "en",
  orgName,
}: Pick<InviteEmailProps, "locale" | "orgName">) {
  return getTranslator(locale, "emails.invite")("subject", { app: APP_NAME, org: orgName });
}

export function InviteEmail({ inviteUrl, locale = "en", orgName, role }: InviteEmailProps) {
  const t = getTranslator(locale, "emails.invite");
  return (
    <Html>
      <Head />
      <Preview>{inviteSubject({ locale, orgName })}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.logoSection}>
            <Text style={styles.logo}>{APP_NAME}</Text>
          </Section>

          <Heading style={styles.heading}>{t("heading", { org: orgName })}</Heading>

          <Text style={styles.text}>
            {t.rich("body", {
              app: APP_NAME,
              org: orgName,
              role: t(`roles.${role}`),
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </Text>

          <Section style={styles.buttonSection}>
            <Button href={inviteUrl} style={styles.button}>
              {t("accept")}
            </Button>
          </Section>

          <Text style={styles.helpText}>{t("help")}</Text>
          <Text style={styles.link}>{inviteUrl}</Text>

          <Hr style={styles.hr} />
          <Text style={styles.footer}>{t("expires")}</Text>
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
  helpText: {
    color: "#52525b",
    fontSize: "13px",
    lineHeight: "1.6",
    margin: "24px 0 8px",
  },
  hr: {
    borderColor: "#e4e4e7",
    margin: "32px 0 24px",
  },
  link: {
    color: "#52525b",
    fontSize: "12px",
    lineBreak: "anywhere" as const,
    margin: "0",
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
