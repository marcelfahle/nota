export function formatInvoiceNumber(opts: {
  digits: number;
  number: number;
  prefix: string;
  separator: string;
}): string {
  const paddedNumber = String(opts.number).padStart(opts.digits, "0");
  if (!opts.prefix) {
    return paddedNumber;
  }

  return `${opts.prefix}${opts.separator}${paddedNumber}`;
}

const DRAFT_PREFIX = "DRAFT-";

/** The opaque identifier a draft carries until issuance allocates its number. */
export function draftIdentifier(id: string) {
  return `${DRAFT_PREFIX}${id}`;
}

/** True for the opaque draft identifier, which is never shown to people as a number. */
export function isDraftNumber(number: string | null | undefined) {
  return Boolean(number?.startsWith(DRAFT_PREFIX));
}

/** What a screen prints for an invoice number: the number once issued, the word "draft" before. */
export function invoiceNumberLabel(number: string | null | undefined, draftLabel: string) {
  return !number || isDraftNumber(number) ? draftLabel : number;
}
