import { expect, test } from "bun:test";

import { render } from "@react-email/components";

import { InviteEmail, inviteSubject } from "@/emails/invite";
import { PasswordResetEmail, passwordResetSubject } from "@/emails/password-reset";
import { VerificationEmail, verificationSubject } from "@/emails/verification";

const url = "http://localhost:3000/x";

test("the invite speaks the inviter's language and names the role", async () => {
  expect(inviteSubject({ locale: "de", orgName: "Studio" })).toBe(
    "Du bist zu Studio bei nota eingeladen",
  );
  expect(inviteSubject({ orgName: "Studio" })).toBe("You've been invited to join Studio on nota");
  const german = await render(
    InviteEmail({ inviteUrl: url, locale: "de", orgName: "Studio", role: "admin" }),
  );
  expect(german).toContain("Einladung annehmen");
  expect(german).toContain("als Admin zu <strong>Studio</strong>");
  const english = await render(InviteEmail({ inviteUrl: url, orgName: "Studio", role: "member" }));
  expect(english).toContain("Accept Invite");
  expect(english).toContain("as a member");
});

test("verification and password reset emails follow the member's language", async () => {
  expect(verificationSubject("de")).toBe("Bestätige deine E-Mail, um Rechnungen zu senden");
  expect(verificationSubject()).toBe("Confirm your email to send invoices");
  expect(
    await render(VerificationEmail({ locale: "de", name: "Mia", verificationUrl: url })),
  ).toContain("Hallo Mia,");
  expect(passwordResetSubject("de")).toBe("Setze dein nota-Passwort zurück");
  expect(await render(PasswordResetEmail({ locale: "de", name: "Mia", resetUrl: url }))).toContain(
    "Passwort zurücksetzen",
  );
  expect(await render(PasswordResetEmail({ name: "Mia", resetUrl: url }))).toContain(
    "Reset your password",
  );
});
