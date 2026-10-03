import { and, eq, inArray, sql } from "drizzle-orm";
import type Stripe from "stripe";

import { syncSubscription } from "@/lib/billing";
import { db } from "@/lib/db";
import {
  activityLog,
  invoices,
  jobs,
  orgs,
  payments,
  proposals,
  stripeEvents,
} from "@/lib/db/schema";
import { processPendingEmailJobs } from "@/lib/jobs";
import { stripeAmount } from "@/lib/stripe-amount";
import { refreshStripeConnect, reconcileStripeDeauthorization } from "@/lib/stripe-connect";

export async function handleStripeEvent(event: Stripe.Event, connected: boolean) {
  if (connected && !event.account) {
    throw new Error("Connected account event has no account");
  }
  if (!connected && event.account) {
    throw new Error("Unexpected connected account event");
  }
  if (event.type === "account.updated" && connected) {
    const [org] = await db
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.stripeAccountId, event.account!));
    if (org) {
      await refreshStripeConnect(org.id);
    }
    return;
  }
  if (event.type === "account.application.deauthorized" && connected) {
    await reconcileStripeDeauthorization(event.account!);
    return;
  }
  if (
    !connected &&
    (event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted")
  ) {
    const customer = event.data.object.customer;
    await syncSubscription(typeof customer === "string" ? customer : customer.id);
    return;
  }
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return;
  }
  const session = event.data.object;
  if (!connected && session.mode === "subscription") {
    if (session.customer) {
      await syncSubscription(
        typeof session.customer === "string" ? session.customer : session.customer.id,
      );
    }
    return;
  }
  if (
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    !session.metadata?.invoiceId
  ) {
    return;
  }
  const invoiceId = session.metadata.invoiceId;
  const linkId =
    typeof session.payment_link === "string" ? session.payment_link : session.payment_link?.id;
  const paymentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!linkId || !paymentId) {
    return;
  }
  await db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .for("update");
    // Metadata is not authority: match the issuing account AND the stored link.
    if (
      !invoice ||
      invoice.stripeAccountId !== (event.account ?? null) ||
      invoice.stripePaymentLinkId !== linkId
    ) {
      return;
    }
    if (
      !invoice.orgId ||
      invoice.status === "paid" ||
      !["sent", "overdue"].includes(invoice.status ?? "")
    ) {
      return;
    }
    const currency = (invoice.currency || "eur").toLowerCase();
    if (
      session.currency !== currency ||
      !session.amount_total ||
      session.amount_total > stripeAmount(invoice.total, currency)
    ) {
      throw new Error("Invoice payment amount mismatch");
    }
    const inserted = await tx
      .insert(stripeEvents)
      .values({ id: event.id })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) {
      return;
    }
    const paymentAmount = (session.amount_total / 100).toFixed(2);
    const insertedPayments = await tx
      .insert(payments)
      .values({
        amount: paymentAmount,
        currency: invoice.currency ?? "EUR",
        invoiceId,
        method: "stripe",
        orgId: invoice.orgId,
        receivedAt: new Date(),
        source: "system",
        stripePaymentIntentId: paymentId,
      })
      .onConflictDoNothing({ target: payments.stripePaymentIntentId })
      .returning({ id: payments.id });
    if (!insertedPayments.length) {
      return;
    }
    const [paymentTotal] = await tx
      .select({ total: sql<string>`coalesce(sum(${payments.amount}::numeric), 0)` })
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    const fullyPaid = Number(paymentTotal.total) >= Number(invoice.total ?? 0);
    await tx
      .update(invoices)
      .set({
        paidAt: fullyPaid ? new Date().toISOString().slice(0, 10) : null,
        revision: sql`${invoices.revision} + 1`,
        status: fullyPaid ? "paid" : invoice.status,
        stripePaymentIntentId: paymentId,
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoiceId), inArray(invoices.status, ["sent", "overdue"])));
    await tx.insert(activityLog).values({
      action: "paid",
      invoiceId,
      metadata: { amount: paymentAmount, paymentIntentId: paymentId, stripeEventId: event.id },
      source: "system",
    });
    await tx
      .update(proposals)
      .set({ status: "expired" })
      .where(and(eq(proposals.invoiceId, invoiceId), eq(proposals.status, "pending")));
    await tx
      .insert(jobs)
      .values({ invoiceId, payload: { invoiceId }, type: "send_payment_received_email" });
  });
  await processPendingEmailJobs(1).catch(() => null);
}
