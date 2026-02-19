import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createPaymentLink(invoice: {
  currency: string | null;
  id: string;
  number: string;
  total: string | null;
}) {
  const amount = Math.round(Number.parseFloat(invoice.total || "0") * 100);

  const price = await stripe.prices.create({
    currency: (invoice.currency || "eur").toLowerCase(),
    product_data: { name: `Invoice ${invoice.number}` },
    unit_amount: amount,
  });

  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { invoiceId: invoice.id },
  });

  return paymentLink;
}
