import Stripe from "stripe";

import { getStripeConnectWebhookEnv } from "@/lib/env";
import { handleStripeEvent } from "@/lib/stripe-webhooks";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }
  let event: Stripe.Event;
  try {
    event = await Stripe.webhooks.constructEventAsync(
      await request.text(),
      signature,
      getStripeConnectWebhookEnv().STRIPE_CONNECT_WEBHOOK_SECRET,
    );
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    await handleStripeEvent(event, true);
    return Response.json({ received: true });
  } catch {
    return Response.json({ error: "Event processing failed" }, { status: 500 });
  }
}
