import { z } from "zod";

import { sendInvoiceFromApi } from "@/lib/api-invoice-actions";
import { error, json, requireAuth } from "@/lib/api-response";
import type { SendInvoiceOptions } from "@/lib/send-options";

const bodySchema = z.object({
  cc: z.array(z.string()).optional(),
  message: z.string().optional(),
});

/** The body is optional: without one, the client's remembered note and copies apply. */
async function readSendOptions(
  request: Request,
): Promise<{ error: string } | { options: SendInvoiceOptions | undefined }> {
  const text = (await request.text()).trim();
  if (!text) {
    return { options: undefined };
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: "Request body must be JSON" };
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return { error: "Expected an optional message (string) and cc (array of email addresses)" };
  }
  return { options: parsed.data };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const sendOptions = await readSendOptions(request);
  if ("error" in sendOptions) {
    return error(sendOptions.error, 400);
  }
  const result = await sendInvoiceFromApi(authResult.auth, id, sendOptions.options);
  if ("error" in result) {
    return result.problems
      ? json({ error: result.error, problems: result.problems }, result.status)
      : error(result.error, result.status);
  }

  return json({ data: result.invoice, warning: result.warning });
}
