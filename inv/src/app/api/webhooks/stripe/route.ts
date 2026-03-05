import { eq } from "drizzle-orm";
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

    if (!invoiceId) {
      return NextResponse.json({ error: "No invoiceId in metadata" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    // Update invoice status to paid
    await db
      .update(invoices)
      .set({
        paidAt: today,
        status: "paid",
        stripePaymentIntentId: session.payment_intent as string | null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    // Log activity
    await db.insert(activityLog).values({
      action: "paid",
      invoiceId,
    });

    // Send payment received notification to business owner
    const [invoice] = await db
      .select({
        clientId: invoices.clientId,
        currency: invoices.currency,
        number: invoices.number,
        total: invoices.total,
        userId: invoices.userId,
      })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (invoice) {
      const [client] = await db
        .select({ name: clients.name })
        .from(clients)
        .where(eq(clients.id, invoice.clientId))
        .limit(1);

      const [user] = await db
        .select({ businessName: users.businessName, email: users.email })
        .from(users)
        .where(eq(users.id, invoice.userId))
        .limit(1);

      if (user) {
        const fromEmail =
          getEmailEnv().RESEND_FROM_EMAIL ?? `${user.businessName ?? "inv."} <invoices@resend.dev>`;

        await resend.emails.send({
          from: fromEmail,
          react: PaymentReceivedEmail({
            clientName: client?.name ?? "Client",
            currency: invoice.currency ?? "EUR",
            invoiceNumber: invoice.number,
            paidAt: today,
            total: invoice.total ?? "0",
          }),
          subject: `Payment received: ${invoice.number}`,
          to: [user.email],
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
