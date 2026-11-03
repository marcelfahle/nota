import { senderFrom } from "@/lib/email";

/** What one person adds to a send: copies, their words, and where replies go. */
export type PersonalSend = {
  cc?: Array<string>;
  message?: string;
  replyTo?: string;
  senderName?: string;
};

/**
 * Who an invoice email goes to and who it comes from. A test copy goes to
 * the sender alone, with nobody in CC, so no draft reaches a customer.
 */
export function invoiceEmailEnvelope(input: {
  clientEmail: string;
  from: { address?: string | null; name: string };
  personal: PersonalSend;
  recipient?: string;
}) {
  const { clientEmail, from, personal, recipient } = input;
  return {
    cc: recipient || !personal.cc?.length ? undefined : personal.cc,
    from:
      personal.senderName && from.address
        ? senderFrom(personal.senderName, { address: from.address, name: from.name })
        : undefined,
    replyTo: personal.replyTo || undefined,
    to: [recipient ?? clientEmail],
  };
}
