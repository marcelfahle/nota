import { expect, spyOn, test } from "bun:test";

import { PasswordResetEmail } from "@/emails/password-reset";
import { createHeloSender, senderFrom } from "@/lib/email";

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

test("Helo carries CC copies and a reply-to, and names the sender on the From line", async () => {
  let payload: Record<string, unknown> = {};
  const sender = createHeloSender(config, (async (_url, options) => {
    payload = JSON.parse(String(options?.body));
    return Response.json({ messageId, status: "accepted" });
  }) as typeof fetch);
  await sender({
    ...email,
    cc: ["cc@example.com", "cc2@example.com"],
    from: senderFrom('Marcel "Max" <Fahle>', {
      address: config.EMAIL_FROM_ADDRESS,
      name: config.EMAIL_FROM_NAME,
    }),
    replyTo: "marcel@example.com",
  });
  expect(payload.cc).toEqual([{ email: "cc@example.com" }, { email: "cc2@example.com" }]);
  expect(payload.replyTo).toEqual([{ email: "marcel@example.com" }]);
  expect(payload.from).toEqual({
    email: config.EMAIL_FROM_ADDRESS,
    name: "Marcel Max Fahle via Nota",
  });

  await sender(email);
  expect(payload.cc).toBeUndefined();
  expect(payload.replyTo).toBeUndefined();
  expect(senderFrom("", { address: "hello@withnota.com", name: "Nota" })).toBe(
    "Nota <hello@withnota.com>",
  );
});

test("Helo falls back to a send without cc and replyTo when it rejects them, once", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const keys: Array<string | null> = [];
  const sender = createHeloSender(config, (async (_url, options) => {
    bodies.push(JSON.parse(String(options?.body)));
    keys.push(new Headers(options?.headers).get("X-Helo-Idempotency-Key"));
    return bodies.length === 1
      ? Response.json({ detail: "unknown field" }, { status: 422 })
      : Response.json({ messageId, status: "accepted" });
  }) as typeof fetch);
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  let warned: Array<string> = [];
  try {
    expect(
      await sender({
        ...email,
        cc: ["cc@example.com"],
        idempotencyKey: messageId,
        replyTo: "marcel@example.com",
      }),
    ).toEqual({ messageId, status: "accepted" });
    warned = warn.mock.calls.map((call) => String(call[0]));
  } finally {
    warn.mockRestore();
  }
  expect(bodies).toHaveLength(2);
  expect(bodies[0].cc).toEqual([{ email: "cc@example.com" }]);
  expect(bodies[0].replyTo).toEqual([{ email: "marcel@example.com" }]);
  expect(bodies[1].cc).toBeUndefined();
  expect(bodies[1].replyTo).toBeUndefined();
  expect(bodies[1].to).toEqual(bodies[0].to);
  expect(keys).toEqual([messageId, messageId]);
  expect(warned).toHaveLength(1);
  expect(warned[0]).toContain("retrying without cc and replyTo");

  // A second rejection is final.
  const stubborn = createHeloSender(config, (async () =>
    Response.json({}, { status: 422 })) as typeof fetch);
  await expect(stubborn({ ...email, replyTo: "marcel@example.com" })).rejects.toThrow(
    "Helo rejected the email (HTTP 422)",
  );
});

test("Helo server errors are not retried without cc and replyTo", async () => {
  let attempts = 0;
  const sender = createHeloSender(config, (async () => {
    attempts += 1;
    return Response.json({}, { status: 500 });
  }) as typeof fetch);
  await expect(
    sender({ ...email, cc: ["cc@example.com"], replyTo: "marcel@example.com" }),
  ).rejects.toThrow("Helo rejected the email (HTTP 500)");
  expect(attempts).toBe(1);
  // Without the unverified fields there is nothing to drop, so a 422 is final too.
  attempts = 0;
  const plain = createHeloSender(config, (async () => {
    attempts += 1;
    return Response.json({}, { status: 422 });
  }) as typeof fetch);
  await expect(plain(email)).rejects.toThrow("Helo rejected the email (HTTP 422)");
  expect(attempts).toBe(1);
});
