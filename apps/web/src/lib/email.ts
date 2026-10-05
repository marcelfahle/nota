import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { render } from "@react-email/render";
import nodemailer from "nodemailer";
import type { ReactElement } from "react";

import { getEmailEnv } from "@/lib/env";

type EmailAttachment = {
  content: Buffer;
  contentType?: string;
  filename: string;
};

type EmailMessage = {
  attachments?: Array<EmailAttachment>;
  from?: string;
  react: ReactElement;
  subject: string;
  to: Array<string>;
};

function parseAddress(value: string) {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match
    ? { email: match[2].trim(), name: match[1].replaceAll(/^"|"$/g, "").trim() || undefined }
    : { email: value.trim() };
}

async function sendWithHelo(message: EmailMessage, html: string, text: string) {
  const env = getEmailEnv();
  const response = await fetch("https://api.helohq.com/send/transactional", {
    body: JSON.stringify({
      attachments: message.attachments?.map((attachment) => ({
        content: attachment.content.toString("base64"),
        contentType: attachment.contentType,
        disposition: "attachment",
        fileName: attachment.filename,
      })),
      from: parseAddress(message.from ?? env.EMAIL_FROM),
      html,
      subject: message.subject,
      text,
      to: message.to.map(parseAddress),
    }),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${env.HELO_API_KEY}`,
      "Content-Type": "application/json",
      ...(env.HELO_CHANNEL_ID ? { "X-Helo-Channel-Id": env.HELO_CHANNEL_ID } : {}),
    },
    method: "POST",
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(detail?.detail ?? `Helo rejected email (${response.status})`);
  }
}

async function recordEmail(message: EmailMessage) {
  const path = getEmailEnv().EMAIL_LOG_PATH;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(
    path,
    `${JSON.stringify({
      attachments: message.attachments?.map(({ content, contentType, filename }) => ({
        bytes: content.byteLength,
        contentType,
        filename,
      })),
      from: message.from ?? getEmailEnv().EMAIL_FROM,
      recordedAt: new Date().toISOString(),
      subject: message.subject,
      to: message.to,
    })}\n`,
    { mode: 0o600 },
  );
}

export async function sendEmail(message: EmailMessage) {
  const env = getEmailEnv();
  const [html, text] = await Promise.all([
    render(message.react),
    render(message.react, { plainText: true }),
  ]);
  if (env.EMAIL_PROVIDER === "log") {
    await recordEmail(message);
    return;
  }
  if (env.EMAIL_PROVIDER === "smtp") {
    await nodemailer.createTransport(env.SMTP_URL!).sendMail({
      attachments: message.attachments?.map((attachment) => ({
        content: attachment.content,
        contentType: attachment.contentType,
        filename: attachment.filename,
      })),
      from: message.from ?? env.EMAIL_FROM,
      html,
      subject: message.subject,
      text,
      to: message.to,
    });
    return;
  }
  await sendWithHelo(message, html, text);
}
