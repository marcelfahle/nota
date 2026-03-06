import Stripe from "stripe";

import { getStripeEnv } from "@/lib/env";

export const stripe = new Stripe(getStripeEnv().STRIPE_SECRET_KEY);

export async function createPaymentLink(invoice: {
  currency: string | null;
  id: string;
  number: string;
  total: string | null;
}) {
  const amount = Math.round(Number.parseFloat(invoice.total || "0") * 100);

  const price = await stripe.prices.create(
    {
      currency: (invoice.currency || "eur").toLowerCase(),
      product_data: { name: `Invoice ${invoice.number}` },
      unit_amount: amount,
    },
    {
      idempotencyKey: `invoice:${invoice.id}:price`,
    },
  );

  const paymentLink = await stripe.paymentLinks.create(
    {
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { invoiceId: invoice.id },
    },
    {
      idempotencyKey: `invoice:${invoice.id}:payment-link`,
    },
  );

  return paymentLink;
}

export async function deactivatePaymentLink(paymentLinkId: string) {
  return stripe.paymentLinks.update(paymentLinkId, { active: false });
}
