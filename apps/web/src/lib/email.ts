import { render, toPlainText } from "@react-email/components";
import type { ReactElement } from "react";
import { z } from "zod";

import { getEmailEnv } from "@/lib/env";

type Email = {
  attachments?: Array<{ content: string; filename: string }>;
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
  config: ReturnType<typeof getEmailEnv>,
  fetcher: typeof fetch = fetch,
) {
  return async (email: Email) => {
    const html = await render(email.react);
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${config.HELO_API_KEY}`,
      "Content-Type": "application/json",
      "X-Helo-Channel-Id": config.HELO_CHANNEL_ID,
    };
    if (email.idempotencyKey) {
      headers["X-Helo-Idempotency-Key"] = email.idempotencyKey;
    }

    let response: Response;
    let body: unknown;
    try {
      response = await fetcher("https://api.helohq.com/send/transactional", {
        body: JSON.stringify({
          attachments: email.attachments?.map(({ content, filename }) => ({
            content,
            disposition: "attachment",
            fileName: filename,
          })),
          from: { email: config.EMAIL_FROM_ADDRESS, name: config.EMAIL_FROM_NAME },
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

export async function sendEmail(email: Email) {
  return createHeloSender(getEmailEnv())(email);
}
