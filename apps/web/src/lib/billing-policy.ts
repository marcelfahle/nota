export const FREE_INVOICE_LIMIT = 5;
export const UPGRADE_MESSAGE =
  "You've sent your 5 free invoices this month. Upgrade in Settings → Billing for unlimited invoices ($9/month or $90/year).";

export function billingMonth(now = new Date()) {
  return `${now.toISOString().slice(0, 7)}-01`;
}

export function canSendOnPlan(mode: "connect" | "direct", plan: string, sent: number) {
  return mode === "direct" || plan === "pro" || sent < FREE_INVOICE_LIMIT;
}

export function paymentAccount(
  mode: "connect" | "direct",
  accountId: string | null,
  chargesEnabled: boolean,
) {
  if (mode === "direct") {
    return "platform";
  }
  return chargesEnabled ? accountId : null;
}
