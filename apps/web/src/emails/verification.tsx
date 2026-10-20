import {
  Body,
  Button,
  Container,
  Column,
  Head,
  Heading,
  Html,
  Hr,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

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
      <Preview>One quick check before your first invoice.</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Row style={styles.masthead}>
            <Column style={{ width: "40px" }}>
              <Img
                alt=""
                height="35"
                src={new URL("/email/nota-mark.png", verificationUrl).href}
                width="28"
              />
            </Column>
            <Column>
              <Text style={styles.logo}>Nota.</Text>
            </Column>
          </Row>
          <Hr style={styles.rule} />
          <Text style={styles.eyebrow}>ONE LAST LITTLE THING</Text>
          <Heading style={styles.heading}>Let’s make it official.</Heading>
          <Text style={styles.text}>Hi {name},</Text>
          <Text style={styles.text}>
            Your first invoice is one step closer. Confirm your email and you’re ready to send with
            Nota.
          </Text>
          <Section style={styles.action}>
            <Button href={verificationUrl} style={styles.button}>
              Confirm your email <span aria-hidden="true">→</span>
            </Button>
            <Text style={styles.expiry}>Link valid for one hour.</Text>
          </Section>
          <Text style={styles.text}>
            See you inside,
            <br />
            The Nota team
          </Text>
          <Hr style={styles.rule} />
          <Text style={styles.footer}>Didn’t request this? You can safely ignore this email.</Text>
          <Text style={styles.footer}>
            Need a hand?{" "}
            <Link href="mailto:hello@withnota.com" style={styles.link}>
              Talk to us.
            </Link>
          </Text>
        </Container>
        <Text style={styles.tagline}>Less admin. More independent work.</Text>
      </Body>
    </Html>
  );
}

const styles = {
  action: { margin: "28px 0 32px" },
  body: {
    backgroundColor: "#fbf9f4",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    margin: "0 auto" as const,
    padding: "24px 12px",
  },
  button: {
    backgroundColor: "#d1fd39",
    border: "1px solid #1f1b16",
    borderRadius: "6px",
    color: "#1f1b16",
    display: "inline-block" as const,
    fontSize: "15px",
    fontWeight: "600",
    lineHeight: "1.2",
    padding: "15px 22px",
    textDecoration: "none",
  },
  container: {
    backgroundColor: "#fffefb",
    border: "1px solid #e5ded1",
    borderRadius: "8px",
    margin: "16px auto 0",
    maxWidth: "520px",
    padding: "32px",
  },
  expiry: { color: "#6b655c", fontSize: "12px", lineHeight: "1.5", margin: "12px 0 0" },
  eyebrow: {
    color: "#6b655c",
    fontSize: "10px",
    fontWeight: "600",
    letterSpacing: "1.6px",
    lineHeight: "1.6",
    margin: "32px 0 12px",
  },
  footer: {
    color: "#6b655c",
    fontSize: "12px",
    lineHeight: "1.6",
    margin: "8px 0 0",
  },
  heading: {
    color: "#1f1b16",
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: "32px",
    fontWeight: "400",
    letterSpacing: "-1px",
    lineHeight: "1.15",
    margin: "0 0 28px",
  },
  link: { color: "#1f1b16", textDecoration: "underline" },
  logo: {
    color: "#1f1b16",
    fontSize: "26px",
    fontWeight: "700",
    letterSpacing: "-1px",
    lineHeight: "1",
    margin: "0",
  },
  masthead: { margin: "0 0 26px" },
  rule: { borderColor: "#e5ded1", margin: "24px 0" },
  tagline: {
    color: "#6b655c",
    fontSize: "11px",
    lineHeight: "1.5",
    margin: "20px auto",
    textAlign: "center" as const,
  },
  text: {
    color: "#1f1b16",
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "0 0 12px",
  },
};
