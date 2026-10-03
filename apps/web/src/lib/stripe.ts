import Stripe from "stripe";

import { getStripeEnv, getStripeMode } from "@/lib/env";
import { stripeAmount } from "@/lib/stripe-amount";

let client: Stripe | undefined;

export function getStripe() {
  client ??= new Stripe(getStripeEnv().STRIPE_SECRET_KEY, {
    maxNetworkRetries: 1,
    timeout: 20_000,
  });
  return client;
}

export async function createPaymentLink(invoice: {
  attempt?: string;
  currency: string | null;
  id: string;
  number: string;
  stripeAccountId?: string | null;
  total: string | null;
}) {
  if (getStripeMode().STRIPE_MODE === "connect" && !invoice.stripeAccountId) {
    return null;
  }
  const stripe = getStripe();
  const currency = (invoice.currency || "eur").toLowerCase();
  const amount = stripeAmount(invoice.total, currency);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Invalid payment amount");
  }
  const stripeAccount = invoice.stripeAccountId ?? undefined;
  const price = await stripe.prices.create(
    { currency, product_data: { name: `Invoice ${invoice.number}` }, unit_amount: amount },
    {
      idempotencyKey: `invoice:${invoice.id}:${invoice.attempt ?? "initial"}:price`,
      stripeAccount,
    },
  );
  return stripe.paymentLinks.create(
    {
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { invoiceId: invoice.id },
      restrictions: { completed_sessions: { limit: 1 } },
    },
    {
      idempotencyKey: `invoice:${invoice.id}:${invoice.attempt ?? "initial"}:payment-link`,
      stripeAccount,
    },
  );
}

// Use the account captured on the invoice even if the workspace later disconnects.
export async function deactivatePaymentLink(paymentLinkId: string, stripeAccountId: string | null) {
  return getStripe().paymentLinks.update(
    paymentLinkId,
    { active: false },
    { stripeAccount: stripeAccountId ?? undefined },
  );
}
