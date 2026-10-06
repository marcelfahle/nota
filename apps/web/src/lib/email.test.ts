import { expect, test } from "bun:test";

import { PasswordResetEmail } from "@/emails/password-reset";
import { createHeloSender } from "@/lib/email";

const config = {
  EMAIL_FROM_ADDRESS: "hello@withnota.com",
  EMAIL_FROM_NAME: "Nota",
  HELO_API_KEY: "test-secret",
  HELO_CHANNEL_ID: "01961f59-4828-7000-8000-000000000001",
};
const messageId = "01961f59-4828-7000-8000-000000000002";
const resetUrl = "https://app.withnota.com/reset-password?token=private-reset-token";
const email = {
  react: PasswordResetEmail({ name: "Marcel", resetUrl }),
  subject: "Reset your nota password",
  to: ["recipient@example.com"],
};

test("Helo renders existing templates, preserves links and PDF bytes, and scopes sends to a channel", async () => {
  let request: Request | undefined;
  const sender = createHeloSender(config, (async (url, options) => {
    request = new Request(url, options);
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    return Response.json({ messageId, status: "accepted", suppressions: [] });
  }) as typeof fetch);
  const content = Buffer.from("%PDF-1.7\nTest invoice").toString("base64");
  expect(
    await sender({
      ...email,
      attachments: [{ content, filename: "invoice.pdf" }],
      idempotencyKey: messageId,
    }),
  ).toEqual({ messageId, status: "accepted" });
  expect(request?.url).toBe("https://api.helohq.com/send/transactional");
  expect(request?.method).toBe("POST");
  expect(request?.headers.get("Authorization")).toBe("Bearer test-secret");
  expect(request?.headers.get("X-Helo-Channel-Id")).toBe(config.HELO_CHANNEL_ID);
  expect(request?.headers.get("X-Helo-Idempotency-Key")).toBe(messageId);
  const payload = await request!.json();
  expect(payload.from).toEqual({ email: config.EMAIL_FROM_ADDRESS, name: "Nota" });
  expect(payload.to).toEqual([{ email: "recipient@example.com" }]);
  expect(payload.html).toContain(resetUrl.replaceAll("&", "&amp;"));
  expect(payload.text).toContain(resetUrl);
  expect(payload.text).toContain("Hi Marcel");
  expect(payload.subject).toBe(email.subject);
  expect(payload.tracking).toEqual({ links: false, opens: false });
  expect(payload.attachments).toEqual([
    { content, disposition: "attachment", fileName: "invoice.pdf" },
  ]);
});

test("Helo rejects provider failures without exposing echoed secrets or treating them as sent", async () => {
  for (const status of [401, 403, 409, 422, 429, 500]) {
    const sender = createHeloSender(config, (async () =>
      Response.json(
        {
          detail: `${config.HELO_API_KEY} ${resetUrl} recipient@example.com`,
        },
        { status },
      )) as typeof fetch);
    await expect(sender(email)).rejects.toThrow(
      `Helo rejected the email (HTTP ${status}). Check Helo configuration and activity.`,
    );
  }
});

test("Helo rejects malformed acknowledgements and suppressed recipients", async () => {
  for (const body of [{}, { messageId: "not-an-id" }, { messageId, status: "failed" }]) {
    const sender = createHeloSender(config, (async () => Response.json(body)) as typeof fetch);
    await expect(sender(email)).rejects.toThrow("invalid email acknowledgement");
  }
  const suppressed = createHeloSender(config, (async () =>
    Response.json({
      messageId,
      status: "accepted",
      suppressions: ["recipient@example.com"],
    })) as typeof fetch);
  await expect(suppressed(email)).rejects.toThrow("Helo suppressed an email recipient");
  const invalidJson = createHeloSender(
    config,
    (async () => new Response("<html>Proxy failure</html>")) as typeof fetch,
  );
  await expect(invalidJson(email)).rejects.toThrow("Helo email request failed");
});

test("Helo surfaces network failures and timeouts safely without retrying a send", async () => {
  for (const error of [new Error(resetUrl), new DOMException("Timed out", "TimeoutError")]) {
    let attempts = 0;
    const sender = createHeloSender(config, (async () => {
      attempts += 1;
      throw error;
    }) as typeof fetch);
    await expect(sender(email)).rejects.toThrow(
      "Helo email request failed or timed out. Check Helo activity before retrying.",
    );
    expect(attempts).toBe(1);
  }
});
