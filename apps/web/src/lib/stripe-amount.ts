/** Stripe uses two-decimal representations for ISK/UGX despite ISO's zero-decimal definition. */
export function stripeAmount(total: string | null, currency: string) {
  const digits = ["isk", "ugx"].includes(currency.toLowerCase())
    ? 2
    : new Intl.NumberFormat("en", { currency, style: "currency" }).resolvedOptions()
        .maximumFractionDigits;
  return Math.round(Number(total) * 10 ** (digits ?? 2));
}
