import { and, eq, isNull, ne, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { PaymentReceivedEmail } from "@/emails/payment-received";
import { db } from "@/lib/db";
import { activityLog, clients, invoices, users } from "@/lib/db/schema";
import { resend } from "@/lib/email";
import { getEmailEnv, getStripeWebhookEnv } from "@/lib/env";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      getStripeWebhookEnv().STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const invoiceId = session.metadata?.invoiceId;
    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : null;

    if (!invoiceId) {
      return NextResponse.json({ error: "No invoiceId in metadata" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    // Send payment received notification to business owner
    const [invoice] = await db
      .select({
        clientId: invoices.clientId,
        currency: invoices.currency,
        number: invoices.number,
        status: invoices.status,
        stripePaymentIntentId: invoices.stripePaymentIntentId,
        total: invoices.total,
        userId: invoices.userId,
      })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      return NextResponse.json({ received: true });
    }

    const alreadyProcessed =
      invoice.status === "paid" && invoice.stripePaymentIntentId === paymentIntentId;

    if (alreadyProcessed) {
      return NextResponse.json({ duplicate: true, received: true });
    }

    const [updatedInvoice] = await db
      .update(invoices)
      .set({
        paidAt: today,
        status: "paid",
        stripePaymentIntentId: paymentIntentId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(invoices.id, invoiceId),
          or(
            ne(invoices.status, "paid"),
            isNull(invoices.stripePaymentIntentId),
            paymentIntentId
              ? ne(invoices.stripePaymentIntentId, paymentIntentId)
              : isNull(invoices.stripePaymentIntentId),
          ),
        ),
      )
      .returning({
        clientId: invoices.clientId,
        currency: invoices.currency,
        number: invoices.number,
        total: invoices.total,
        userId: invoices.userId,
      });

    if (!updatedInvoice) {
      return NextResponse.json({ duplicate: true, received: true });
    }

    await db.insert(activityLog).values({
      action: "paid",
      invoiceId,
      metadata: {
        paymentIntentId,
        stripeEventId: event.id,
      },
    });

    const [client] = await db
      .select({ name: clients.name })
      .from(clients)
      .where(eq(clients.id, updatedInvoice.clientId))
      .limit(1);

    const [user] = await db
      .select({ businessName: users.businessName, email: users.email })
      .from(users)
      .where(eq(users.id, updatedInvoice.userId))
      .limit(1);

    if (user) {
      const fromEmail =
        getEmailEnv().RESEND_FROM_EMAIL ?? `${user.businessName ?? "inv."} <invoices@resend.dev>`;

      await resend.emails.send({
        from: fromEmail,
        react: PaymentReceivedEmail({
          clientName: client?.name ?? "Client",
          currency: updatedInvoice.currency ?? "EUR",
          invoiceNumber: updatedInvoice.number,
          paidAt: today,
          total: updatedInvoice.total ?? "0",
        }),
        subject: `Payment received: ${updatedInvoice.number}`,
        to: [user.email],
      });
    }
  }

  return NextResponse.json({ received: true });
}
