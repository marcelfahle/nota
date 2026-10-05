import { currencyExponent, formatDecimal, formatMinorUnits } from "@/lib/money";

/** Stripe uses two-decimal representations for ISK/UGX despite ISO's zero-decimal definition. */
export function stripeCurrencyExponent(currency: string) {
  return ["isk", "ugx"].includes(currency.toLowerCase()) ? 2 : currencyExponent(currency);
}

export function stripeAmount(total: string | null, currency: string) {
  const digits = stripeCurrencyExponent(currency);
  const fixed = formatDecimal(total ?? "0", digits, "reject");
  const integer = Number(fixed.replace(".", ""));
  if (!Number.isSafeInteger(integer)) {
    throw new Error("Stripe amount is out of range");
  }
  return integer;
}

export function stripePaymentAmount(amount: number, currency: string) {
  return formatMinorUnits(amount, stripeCurrencyExponent(currency));
}
