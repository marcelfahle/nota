import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

import { APP_NAME } from "@/lib/app-brand";

export function VerificationEmail({
  name,
  verificationUrl,
}: {
  name: string;
  verificationUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your email to send invoices with {APP_NAME}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.logo}>{APP_NAME}</Text>
          <Heading style={styles.heading}>Confirm your email</Heading>
          <Text style={styles.text}>Hi {name},</Text>
          <Text style={styles.text}>
            Confirm this email address before sending your first invoice. You only need to do this
            once.
          </Text>
          <Button href={verificationUrl} style={styles.button}>
            Confirm email
          </Button>
          <Text style={styles.footer}>This link expires in one hour.</Text>
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
    margin: "12px 0 24px",
    padding: "12px 24px",
    textDecoration: "none",
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
    color: "#71717a",
    fontSize: "12px",
    lineHeight: "1.5",
  },
  heading: {
    color: "#18181b",
    fontSize: "22px",
    fontWeight: "600",
    lineHeight: "1.3",
    margin: "0 0 16px",
  },
  logo: {
    color: "#18181b",
    fontSize: "18px",
    fontWeight: "700",
    lineHeight: "1",
    margin: "0 0 24px",
  },
  text: {
    color: "#3f3f46",
    fontSize: "14px",
    lineHeight: "1.6",
    margin: "0 0 12px",
  },
};
