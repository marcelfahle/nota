import { and, count, eq } from "drizzle-orm";

import { billingMonth, FREE_INVOICE_LIMIT } from "@/lib/billing-policy";
import { db } from "@/lib/db";
import { invoiceSends, orgs } from "@/lib/db/schema";
import { getAppEnv, getDeploymentEnv, getStripeBillingEnv, getStripeMode } from "@/lib/env";
import { getStripe } from "@/lib/stripe";

export async function billingStatus(orgId: string) {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  if (!org) {
    throw new Error("Organization not found");
  }
  const [usage] = await db
    .select({ sent: count() })
    .from(invoiceSends)
    .where(and(eq(invoiceSends.orgId, orgId), eq(invoiceSends.month, billingMonth())));
  return {
    chargesEnabled: org.stripeChargesEnabled,
    deploymentMode: getDeploymentEnv().DEPLOYMENT_MODE,
    hasBillingAccount: Boolean(org.stripeCustomerId),
    limit:
      getDeploymentEnv().DEPLOYMENT_MODE === "self-hosted" || org.plan === "pro"
        ? null
        : FREE_INVOICE_LIMIT,
    mode: getStripeMode().STRIPE_MODE,
    paymentMode: getDeploymentEnv().PAYMENT_MODE,
    payoutsEnabled: org.stripePayoutsEnabled,
    plan: org.plan,
    sent: usage.sent,
    stripeAccountId: org.stripeAccountId,
    subscriptionStatus: org.stripeSubscriptionStatus,
  };
}

export async function createBillingCheckout(
  orgId: string,
  email: string,
  interval: "month" | "year",
) {
  if (getDeploymentEnv().DEPLOYMENT_MODE === "self-hosted") {
    throw new Error("Self-hosted Nota does not require a subscription");
  }
  const prices = getStripeBillingEnv();
  const stripe = getStripe();
  const requestedPrice =
    interval === "month" ? prices.STRIPE_PRICE_MONTHLY : prices.STRIPE_PRICE_YEARLY;
  return db.transaction(async (tx) => {
    const [org] = await tx.select().from(orgs).where(eq(orgs.id, orgId)).for("update");
    if (!org) {
      throw new Error("Organization not found");
    }
    if (org.plan === "pro") {
      throw new Error("This workspace already has a subscription. Use Manage billing.");
    }
    if (org.stripeCheckoutSessionId) {
      const previous = await stripe.checkout.sessions.retrieve(org.stripeCheckoutSessionId);
      if (previous.status === "open" && previous.url) {
        const items = await stripe.checkout.sessions.listLineItems(previous.id, { limit: 1 });
        if (items.data[0]?.price?.id === requestedPrice) {
          return { url: previous.url };
        }
        await stripe.checkout.sessions.expire(previous.id);
      }
      if (previous.status === "complete" && previous.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          typeof previous.subscription === "string"
            ? previous.subscription
            : previous.subscription.id,
        );
        if (!["canceled", "incomplete_expired"].includes(subscription.status)) {
          throw new Error(
            "Your upgrade is being processed. Refresh shortly or use Manage billing.",
          );
        }
      }
    }
    const customerId =
      org.stripeCustomerId ??
      (
        await stripe.customers.create(
          { email, metadata: { orgId }, name: org.businessName || org.name },
          { idempotencyKey: `org:${orgId}:customer` },
        )
      ).id;
    const session = await stripe.checkout.sessions.create(
      {
        automatic_tax: { enabled: true },
        billing_address_collection: "required",
        cancel_url: `${getAppEnv().APP_URL}/settings?billing=cancelled`,
        client_reference_id: orgId,
        customer: customerId,
        customer_update: { address: "auto", name: "auto" },
        line_items: [
          {
            price: requestedPrice,
            quantity: 1,
          },
        ],
        metadata: { orgId },
        mode: "subscription",
        subscription_data: { metadata: { orgId } },
        success_url: `${getAppEnv().APP_URL}/settings?billing=success`,
        tax_id_collection: { enabled: true },
      },
      { idempotencyKey: `org:${orgId}:checkout:${org.stripeCheckoutSessionId ?? "first"}` },
    );
    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }
    await tx
      .update(orgs)
      .set({ stripeCheckoutSessionId: session.id, stripeCustomerId: customerId })
      .where(eq(orgs.id, orgId));
    return { url: session.url };
  });
}

export async function createBillingPortal(orgId: string) {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  if (!org?.stripeCustomerId) {
    throw new Error("This workspace has no billing account yet");
  }
  const session = await getStripe().billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${getAppEnv().APP_URL}/settings`,
  });
  return { url: session.url };
}

// Fetch current Stripe state while holding the workspace lock: delayed events cannot restore an old plan.
export async function syncSubscription(customerId: string) {
  await db.transaction(async (tx) => {
    const [org] = await tx
      .select()
      .from(orgs)
      .where(eq(orgs.stripeCustomerId, customerId))
      .for("update");
    if (!org) {
      return;
    }
    const prices = Object.values(getStripeBillingEnv());
    const subscriptions = await getStripe().subscriptions.list({
      customer: customerId,
      limit: 100,
      status: "all",
    });
    const relevant = subscriptions.data.filter((sub) =>
      sub.items.data.some((item) => prices.includes(item.price.id)),
    );
    const paid = relevant.find((sub) => sub.status === "active" || sub.status === "trialing");
    const current = paid ?? relevant[0];
    await tx
      .update(orgs)
      .set({
        plan: paid ? "pro" : "free",
        stripeSubscriptionId: current?.id ?? null,
        stripeSubscriptionStatus: current?.status ?? null,
      })
      .where(eq(orgs.id, org.id));
  });
}
