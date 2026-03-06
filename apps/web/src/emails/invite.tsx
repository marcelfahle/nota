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

type InviteEmailProps = {
  inviteUrl: string;
  orgName: string;
  role: "owner" | "admin" | "member";
};

function formatRole(role: InviteEmailProps["role"]) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function InviteEmail({ inviteUrl, orgName, role }: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        You&apos;ve been invited to join {orgName} on {APP_NAME}
      </Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.logoSection}>
            <Text style={styles.logo}>{APP_NAME}</Text>
          </Section>

          <Heading style={styles.heading}>Join {orgName}</Heading>

          <Text style={styles.text}>
            You&apos;ve been invited to join <strong>{orgName}</strong> on {APP_NAME} as a{" "}
            {formatRole(role).toLowerCase()}.
          </Text>

          <Section style={styles.buttonSection}>
            <Button href={inviteUrl} style={styles.button}>
              Accept Invite
            </Button>
          </Section>

          <Text style={styles.helpText}>
            If the button doesn&apos;t work, open this link in your browser:
          </Text>
          <Text style={styles.link}>{inviteUrl}</Text>

          <Hr style={styles.hr} />
          <Text style={styles.footer}>This invite expires in 7 days.</Text>
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
