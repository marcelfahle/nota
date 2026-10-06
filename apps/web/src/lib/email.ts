import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { render, toPlainText } from "@react-email/components";
import nodemailer from "nodemailer";
import type { ReactElement } from "react";
import { z } from "zod";

import { getEmailEnv } from "@/lib/env";

type Email = {
  attachments?: Array<{ content: string | Buffer; contentType?: string; filename: string }>;
  from?: string;
  idempotencyKey?: string;
  react: ReactElement;
  subject: string;
  to: Array<string>;
};

const acceptedSchema = z.object({
  messageId: z.uuid(),
  status: z.enum(["accepted", "delayed"]),
  suppressions: z.array(z.string()).optional(),
});

// Keep provider details here; callers only supply content and recipients.
export function createHeloSender(
  config: {
    EMAIL_FROM_ADDRESS: string;
    EMAIL_FROM_NAME: string;
    HELO_API_KEY?: string;
    HELO_CHANNEL_ID?: string;
  },
  fetcher: typeof fetch = fetch,
) {
  return async (email: Email) => {
    const html = await render(email.react);
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${config.HELO_API_KEY}`,
      "Content-Type": "application/json",
      ...(config.HELO_CHANNEL_ID ? { "X-Helo-Channel-Id": config.HELO_CHANNEL_ID } : {}),
    };
    if (email.idempotencyKey) {
      headers["X-Helo-Idempotency-Key"] = email.idempotencyKey;
    }

    let response: Response;
    let body: unknown;
    try {
      response = await fetcher("https://api.helohq.com/send/transactional", {
        body: JSON.stringify({
          attachments: email.attachments?.map(({ content, contentType, filename }) => ({
            content: typeof content === "string" ? content : content.toString("base64"),
            contentType,
            disposition: "attachment",
            fileName: filename,
          })),
          from: email.from
            ? parseAddress(email.from)
            : { email: config.EMAIL_FROM_ADDRESS, name: config.EMAIL_FROM_NAME },
          html,
          subject: email.subject,
          text: toPlainText(html),
          to: email.to.map((address) => ({ email: address })),
          tracking: { links: false, opens: false },
        }),
        headers,
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      // Do not log provider response bodies: they may echo reset links or recipient data.
      if (!response.ok) {
        await response.body?.cancel();
      } else {
        body = await response.json();
      }
    } catch {
      throw new Error(
        "Helo email request failed or timed out. Check Helo activity before retrying.",
      );
    }

    if (!response.ok) {
      throw new Error(
        `Helo rejected the email (HTTP ${response.status}). Check Helo configuration and activity.`,
      );
    }
    const accepted = acceptedSchema.safeParse(body);
    if (!accepted.success) {
      throw new Error(
        "Helo returned an invalid email acknowledgement. Check Helo activity before retrying.",
      );
    }
    if (accepted.data.suppressions?.length) {
      throw new Error("Helo suppressed an email recipient. Check channel suppressions.");
    }
    return { messageId: accepted.data.messageId, status: accepted.data.status };
  };
}

function parseAddress(value: string) {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match
    ? { email: match[2].trim(), name: match[1].replaceAll(/^"|"$/g, "").trim() || undefined }
    : { email: value.trim() };
}

export async function sendEmail(email: Email) {
  const env = getEmailEnv();
  const attachments = email.attachments?.map(({ content, ...attachment }) => ({
    ...attachment,
    content: typeof content === "string" ? Buffer.from(content, "base64") : content,
  }));
  if (env.EMAIL_PROVIDER === "log") {
    await mkdir(dirname(env.EMAIL_LOG_PATH), { recursive: true });
    await appendFile(
      env.EMAIL_LOG_PATH,
      JSON.stringify({
        attachments: attachments?.map(({ content, contentType, filename }) => ({
          bytes: content.byteLength,
          contentType,
          filename,
        })),
        from: email.from ?? env.EMAIL_FROM,
        recordedAt: new Date().toISOString(),
        subject: email.subject,
        to: email.to,
      }) + "\n",
      { mode: 0o600 },
    );
    return;
  }
  if (env.EMAIL_PROVIDER === "smtp") {
    const html = await render(email.react);
    await nodemailer.createTransport(env.SMTP_URL!).sendMail({
      attachments,
      from: email.from ?? env.EMAIL_FROM,
      html,
      subject: email.subject,
      text: toPlainText(html),
      to: email.to,
    });
    return;
  }
  return createHeloSender(env)(email);
}
