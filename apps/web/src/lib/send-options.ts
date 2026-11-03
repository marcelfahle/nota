import { z } from "zod";

/** What a person adds to one send: a note in their own words and who else gets a copy. */
export type SendInvoiceOptions = {
  cc?: Array<string>;
  message?: string;
};

export type ResolvedSendOptions = {
  cc: Array<string>;
  message: string | null;
};

export const SEND_MESSAGE_MAX_LENGTH = 2000;
export const SEND_CC_MAX = 5;

const addressSchema = z.email();

/** Splits what a person typed into one CC field: commas, semicolons or whitespace between addresses. */
export function parseCcInput(value: string) {
  return value
    .split(/[\s,;]+/)
    .map((address) => address.trim())
    .filter(Boolean);
}

/**
 * Trims and checks what was handed in. Returns a message on the first problem,
 * phrased for the person who typed it.
 */
export function normalizeSendOptions(
  options: SendInvoiceOptions,
): ResolvedSendOptions | { error: string } {
  const message = options.message?.trim() ?? "";
  if (message.length > SEND_MESSAGE_MAX_LENGTH) {
    return { error: `The message can be at most ${SEND_MESSAGE_MAX_LENGTH} characters long.` };
  }
  const cc = [...new Set((options.cc ?? []).map((address) => address.trim()).filter(Boolean))];
  if (cc.length > SEND_CC_MAX) {
    return { error: `At most ${SEND_CC_MAX} CC addresses can be added.` };
  }
  const invalid = cc.find((address) => !addressSchema.safeParse(address).success);
  if (invalid) {
    return { error: `"${invalid}" is not a valid email address.` };
  }
  return { cc, message: message || null };
}

/**
 * The options one send uses: what was handed in, or, when nothing was, what
 * the client was last sent with. Sends from the API, CLI, MCP and quick
 * actions pass nothing and so keep the client's defaults.
 */
export function resolveSendOptions(
  options: ResolvedSendOptions | undefined,
  client: { sendCc: Array<string> | null; sendMessage: string | null },
): ResolvedSendOptions {
  return options ?? { cc: client.sendCc ?? [], message: client.sendMessage ?? null };
}
