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
