import { afterAll, beforeAll, expect, mock, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { and, eq, like } from "drizzle-orm";
import Stripe from "stripe";

// Explicitly invoked against a disposable local database; never use a developer's remote .env.
if (!process.env.DATABASE_URL?.startsWith("postgresql://nota@127.0.0.1:55439/")) {
  throw new Error("Use the isolated local Stripe test database on port 55439");
}
process.env.STRIPE_MODE = "connect";
process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
process.env.STRIPE_PRICE_MONTHLY = "price_month";
process.env.STRIPE_PRICE_YEARLY = "price_year";
process.env.STRIPE_CONNECT_CLIENT_ID = "ca_fixture";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_platform_fixture";
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_fixture";
process.env.APP_URL = "http://localhost:3019";
mock.module("@/lib/jobs", () => ({ processPendingEmailJobs: async () => ({ completed: 0 }) }));
const { db } = await import("../../src/lib/db");
const {
  activityLog,
  chatThreads,
  clients,
  invoices,
  invoiceSends,
  jobs,
  orgMembers,
  orgs,
  payments,
  proposals,
  stripeConnectStates,
  stripeEvents,
  users,
} = await import("../../src/lib/db/schema");
const { createCreditNote, getInvoiceDetail, recordInvoicePayment, sendInvoice, sendReminder } =
  await import("../../src/lib/invoice-service");
const { getChatThread, loadChatMessages, saveChatMessage } =
  await import("../../src/lib/chat-store");
const { approveProposal, createReminderProposal } = await import("../../src/lib/proposal-service");
const { getStripe } = await import("../../src/lib/stripe");
const { handleStripeEvent } = await import("../../src/lib/stripe-webhooks");
const stripe = getStripe();
const userId = randomUUID(),
  orgA = randomUUID(),
  orgB = randomUUID(),
  orgFree = randomUUID(),
  orgOAuth = randomUUID(),
  orgCheckout = randomUUID();
const madeInvoices: Array<string> = [];
const requests: Array<{ account?: string; body: unknown; kind: string }> = [];
let next = 0;
const priceMock = spyOn(stripe.prices, "create").mockImplementation(
  async (body: unknown, options: { stripeAccount?: string }) => {
    requests.push({ account: options.stripeAccount, body, kind: "price" });
    return { id: `price_${++next}` } as Stripe.Response<Stripe.Price>;
  },
);
const linkMock = spyOn(stripe.paymentLinks, "create").mockImplementation(
  async (body: unknown, options: { stripeAccount?: string }) => {
    requests.push({ account: options.stripeAccount, body, kind: "link" });
    return {
      id: `plink_${++next}`,
      url: "https://buy.stripe.com/test_fixture",
    } as Stripe.Response<Stripe.PaymentLink>;
  },
);
const linkUpdateMock = spyOn(stripe.paymentLinks, "update").mockImplementation(
  async (id: string) => ({ active: false, id }) as Stripe.Response<Stripe.PaymentLink>,
);
let clientA: string, clientB: string, clientFree: string;
beforeAll(async () => {
  await db.insert(users).values({ email: `${userId}@example.com`, id: userId, name: "Test Owner" });
  await db.insert(orgs).values([
    { id: orgA, name: "A", plan: "pro", stripeAccountId: "acct_a", stripeChargesEnabled: true },
    { id: orgB, name: "B", plan: "pro", stripeAccountId: "acct_b", stripeChargesEnabled: true },
    { id: orgFree, name: "Free" },
    { id: orgOAuth, name: "OAuth" },
    { id: orgCheckout, name: "Checkout" },
  ]);
  await db.insert(orgMembers).values(
    [orgA, orgB, orgFree, orgOAuth, orgCheckout].map((orgId) => ({
      orgId,
      role: "owner" as const,
      userId,
    })),
  );
  const created = await db
    .insert(clients)
    .values(
      [orgA, orgB, orgFree].map((orgId) => ({
        email: "test@example.com",
        name: orgId,
        orgId,
        userId,
      })),
    )
    .returning();
  clientA = created.find((c) => c.orgId === orgA)!.id;
  clientB = created.find((c) => c.orgId === orgB)!.id;
  clientFree = created.find((c) => c.orgId === orgFree)!.id;
});
async function draft(orgId: string, clientId: string) {
  const id = randomUUID();
  madeInvoices.push(id);
  await db.insert(invoices).values({
    clientId,
    currency: "EUR",
    dueAt: "2026-10-17",
    id,
    issuedAt: "2026-10-03",
    number: id,
    orgId,
    total: "12.50",
    userId,
  });
  return id;
}
const context = (orgId: string) => ({ orgId, role: "owner" as const, userId });
test("two workspaces issue their payment links on separate accounts with no Nota fee", async () => {
  const a = await draft(orgA, clientA),
    b = await draft(orgB, clientB);
  expect(await sendInvoice(context(orgA), a)).toEqual({ invoiceId: a, success: true });
  expect(await sendInvoice(context(orgB), b)).toEqual({ invoiceId: b, success: true });
  expect(requests.map((r) => [r.kind, r.account])).toEqual([
    ["price", "acct_a"],
    ["link", "acct_a"],
    ["price", "acct_b"],
    ["link", "acct_b"],
  ]);
  expect(requests[0].body).toMatchObject({ currency: "eur", unit_amount: 1250 });
  expect(requests[1].body).not.toHaveProperty("application_fee_amount");
  const [saved] = await db.select().from(invoices).where(eq(invoices.id, a));
  expect(saved.stripeAccountId).toBe("acct_a");
  const event = (
    account: string,
    payment_status = "paid",
    amount_total = 1250,
    suffix = "full",
    eventSuffix = suffix,
  ): Stripe.Event =>
    ({
      account,
      data: {
        object: {
          amount_total,
          currency: "eur",
          id: "cs_invoice",
          metadata: { invoiceId: a },
          mode: "payment",
          payment_intent: `pi_${suffix}`,
          payment_link: saved.stripePaymentLinkId,
          payment_status,
        },
      },
      id: `evt_${a}_${eventSuffix}`,
      type: "checkout.session.completed",
    }) as unknown as Stripe.Event;
  await handleStripeEvent(event("acct_b"), true);
  await handleStripeEvent(event("acct_a", "unpaid"), true);
  expect((await db.select().from(invoices).where(eq(invoices.id, a)))[0].status).toBe("sent");
  await handleStripeEvent(event("acct_a", "paid", 100, "partial"), true);
  expect((await db.select().from(invoices).where(eq(invoices.id, a)))[0].status).toBe("sent");
  await expect(handleStripeEvent(event("acct_a", "paid", 1250, "overpay"), true)).rejects.toThrow(
    "amount mismatch",
  );
  await Promise.all([
    handleStripeEvent(event("acct_a", "paid", 1150, "full", "full-a"), true),
    handleStripeEvent(event("acct_a", "paid", 1150, "full", "full-b"), true),
  ]);
  expect((await db.select().from(invoices).where(eq(invoices.id, a)))[0].status).toBe("paid");
  expect(await db.select().from(payments).where(eq(payments.invoiceId, a))).toHaveLength(2);
  expect(
    await db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.invoiceId, a), eq(activityLog.action, "paid"))),
  ).toHaveLength(2);
  expect(
    await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.invoiceId, a), eq(jobs.type, "send_payment_received_email"))),
  ).toHaveLength(2);
});

test("concurrent free sends stop at five; bank-only invoices can be sent, retried and reminded", async () => {
  const ids = await Promise.all(Array.from({ length: 7 }, () => draft(orgFree, clientFree)));
  const results = await Promise.all(ids.map((id) => sendInvoice(context(orgFree), id)));
  expect(results.filter((r) => "success" in r)).toHaveLength(5);
  expect(results.filter((r) => "error" in r)).toHaveLength(2);
  expect(requests).toHaveLength(4);
  const [sent] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgFree), eq(invoices.status, "sent")));
  expect(sent.stripePaymentLinkUrl).toBeNull();
  expect(await sendInvoice(context(orgFree), sent.id)).toMatchObject({ success: true });
  expect(await sendReminder(context(orgFree), sent.id)).toMatchObject({ success: true });
  expect(await db.select().from(invoiceSends).where(eq(invoiceSends.orgId, orgFree))).toHaveLength(
    5,
  );
});

test("signed paid subscription events lift the limit; stale cancellation events use current Stripe state", async () => {
  await db.update(orgs).set({ stripeCustomerId: "cus_fixture" }).where(eq(orgs.id, orgFree));
  const list = spyOn(stripe.subscriptions, "list").mockResolvedValue({
    data: [
      { id: "sub_fixture", items: { data: [{ price: { id: "price_month" } }] }, status: "active" },
    ],
  } as unknown as Stripe.Response<Stripe.ApiList<Stripe.Subscription>>);
  const payload = JSON.stringify({
    data: { object: { customer: "cus_fixture" } },
    id: "evt_sub",
    type: "customer.subscription.deleted",
  });
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: "whsec_fixture",
  });
  const event = await Stripe.webhooks.constructEventAsync(payload, signature, "whsec_fixture");
  await handleStripeEvent(event, false);
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgFree));
  expect(org.plan).toBe("pro");
  const id = await draft(orgFree, clientFree);
  expect(await sendInvoice(context(orgFree), id)).toMatchObject({ success: true });
  list.mockRestore();
});

test("members cannot send or manage payments", async () => {
  const id = await draft(orgA, clientA);
  expect(await sendInvoice({ ...context(orgA), role: "member" }, id)).toEqual({
    error: "Insufficient permissions",
  });
  const { performBillingAction } = await import("../../src/lib/billing-actions");
  await expect(
    performBillingAction(
      { ...context(orgA), email: "test@example.com", role: "member" },
      "disconnect",
    ),
  ).rejects.toThrow("Insufficient permissions");
});

test("Stripe failure rolls back invoice state and usage; retry sends once", async () => {
  const id = await draft(orgA, clientA);
  linkMock.mockRejectedValueOnce(new Error("Stripe timeout"));
  expect(await sendInvoice(context(orgA), id)).toHaveProperty("error");
  expect((await db.select().from(invoices).where(eq(invoices.id, id)))[0].status).toBe("draft");
  expect(await db.select().from(invoiceSends).where(eq(invoiceSends.invoiceId, id))).toHaveLength(
    0,
  );
  expect(await db.select().from(jobs).where(eq(jobs.invoiceId, id))).toHaveLength(0);
  expect(await sendInvoice(context(orgA), id)).toMatchObject({ success: true });
  expect(await db.select().from(invoiceSends).where(eq(invoiceSends.invoiceId, id))).toHaveLength(
    1,
  );
});

test("OAuth state is bound to its owner and workspace, expires, and is single-use", async () => {
  const { beginStripeConnect, finishStripeConnect } = await import("../../src/lib/stripe-connect");
  const token = spyOn(stripe.oauth, "token").mockResolvedValue({
    scope: "read_write",
    stripe_user_id: "acct_oauth",
  } as Stripe.Response<Stripe.OAuthToken>);
  const retrieve = spyOn(stripe.accounts, "retrieve").mockResolvedValue({
    charges_enabled: true,
    id: "acct_oauth",
    payouts_enabled: true,
  } as Stripe.Response<Stripe.Account>);
  try {
    const state = new URL((await beginStripeConnect(orgOAuth, userId)).url).searchParams.get(
      "state",
    )!;
    await expect(finishStripeConnect(orgA, userId, state, "code")).rejects.toThrow("expired");
    await expect(finishStripeConnect(orgOAuth, randomUUID(), state, "code")).rejects.toThrow(
      "expired",
    );
    expect(token).not.toHaveBeenCalled();
    await finishStripeConnect(orgOAuth, userId, state, "code");
    expect((await db.select().from(orgs).where(eq(orgs.id, orgOAuth)))[0].stripeAccountId).toBe(
      "acct_oauth",
    );
    await expect(finishStripeConnect(orgOAuth, userId, state, "code")).rejects.toThrow("expired");
    await db.update(orgs).set({ stripeAccountId: null }).where(eq(orgs.id, orgOAuth));
    const expired = new URL((await beginStripeConnect(orgOAuth, userId)).url).searchParams.get(
      "state",
    )!;
    await db
      .update(stripeConnectStates)
      .set({ expiresAt: new Date(0) })
      .where(eq(stripeConnectStates.orgId, orgOAuth));
    await expect(finishStripeConnect(orgOAuth, userId, expired, "code")).rejects.toThrow("expired");
    const revoked = new URL((await beginStripeConnect(orgOAuth, userId)).url).searchParams.get(
      "state",
    )!;
    await db.update(orgMembers).set({ role: "member" }).where(eq(orgMembers.orgId, orgOAuth));
    await expect(finishStripeConnect(orgOAuth, userId, revoked, "code")).rejects.toThrow(
      "cannot connect",
    );
    expect(token).toHaveBeenCalledTimes(1);
  } finally {
    token.mockRestore();
    retrieve.mockRestore();
  }
});

test("delayed deauthorization preserves a reconnected account; actual revocation clears it", async () => {
  const retrieve = spyOn(stripe.accounts, "retrieve").mockResolvedValue({
    id: "acct_b",
  } as Stripe.Response<Stripe.Account>);
  const event = {
    account: "acct_b",
    id: "evt_revoke",
    type: "account.application.deauthorized",
  } as Stripe.Event;
  try {
    await handleStripeEvent(event, true);
    expect((await db.select().from(orgs).where(eq(orgs.id, orgB)))[0].stripeAccountId).toBe(
      "acct_b",
    );
    retrieve.mockRejectedValueOnce(new Stripe.errors.StripeAPIError({ message: "Unavailable" }));
    await expect(handleStripeEvent(event, true)).rejects.toThrow("Unavailable");
    expect((await db.select().from(orgs).where(eq(orgs.id, orgB)))[0].stripeAccountId).toBe(
      "acct_b",
    );
    retrieve.mockRejectedValueOnce(
      new Stripe.errors.StripeAPIError({ code: "account_invalid", message: "Revoked" }),
    );
    await handleStripeEvent(event, true);
    expect((await db.select().from(orgs).where(eq(orgs.id, orgB)))[0].stripeAccountId).toBeNull();
  } finally {
    retrieve.mockRestore();
  }
});

test("checkout reuses a matching session, switches intervals, and prevents duplicate subscriptions", async () => {
  const { createBillingCheckout } = await import("../../src/lib/billing");
  const sessions = new Map<
    string,
    { id: string; price: string; status: string; subscription?: string; url: string }
  >();
  const customer = spyOn(stripe.customers, "create").mockResolvedValue({
    id: "cus_checkout",
  } as Stripe.Response<Stripe.Customer>);
  const create = spyOn(stripe.checkout.sessions, "create").mockImplementation(
    async (params: Stripe.Checkout.SessionCreateParams) => {
      const id = `cs_fixture_${sessions.size}`;
      const session = {
        id,
        price: params.line_items![0].price!,
        status: "open",
        url: `https://checkout.stripe.com/${id}`,
      };
      sessions.set(id, session);
      return session as unknown as Stripe.Response<Stripe.Checkout.Session>;
    },
  );
  const retrieve = spyOn(stripe.checkout.sessions, "retrieve").mockImplementation(
    async (id: string) => sessions.get(id) as unknown as Stripe.Response<Stripe.Checkout.Session>,
  );
  const items = spyOn(stripe.checkout.sessions, "listLineItems").mockImplementation(
    async (id: string) =>
      ({ data: [{ price: { id: sessions.get(id)!.price } }] }) as unknown as Stripe.Response<
        Stripe.ApiList<Stripe.LineItem>
      >,
  );
  const expire = spyOn(stripe.checkout.sessions, "expire").mockImplementation(
    async (id: string) => {
      sessions.get(id)!.status = "expired";
      return sessions.get(id) as unknown as Stripe.Response<Stripe.Checkout.Session>;
    },
  );
  const subscription = spyOn(stripe.subscriptions, "retrieve").mockResolvedValue({
    status: "active",
  } as Stripe.Response<Stripe.Subscription>);
  try {
    const monthly = await Promise.all(
      [1, 2].map(() => createBillingCheckout(orgCheckout, "test@example.com", "month")),
    );
    expect(monthly[0]).toEqual(monthly[1]);
    expect(sessions.size).toBe(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
    });
    const yearly = await createBillingCheckout(orgCheckout, "test@example.com", "year");
    expect(yearly.url).not.toBe(monthly[0].url);
    expect(sessions.get("cs_fixture_0")!.status).toBe("expired");
    expect(sessions.get("cs_fixture_1")!.price).toBe("price_year");
    Object.assign(sessions.get("cs_fixture_1")!, {
      status: "complete",
      subscription: "sub_checkout",
    });
    await expect(createBillingCheckout(orgCheckout, "test@example.com", "month")).rejects.toThrow(
      "being processed",
    );
    subscription.mockResolvedValue({ status: "canceled" } as Stripe.Response<Stripe.Subscription>);
    expect((await createBillingCheckout(orgCheckout, "test@example.com", "month")).url).not.toBe(
      yearly.url,
    );
  } finally {
    for (const mock of [customer, create, retrieve, items, expire, subscription]) {
      mock.mockRestore();
    }
  }
});

test("webhook routes require signatures from their own endpoint and account scope", async () => {
  const { POST: platform } = await import("../../src/app/api/webhooks/stripe/route");
  const { POST: connected } = await import("../../src/app/api/webhooks/stripe-connect/route");
  const payload = JSON.stringify({
    data: { object: {} },
    id: "evt_ignored",
    type: "ignored.event",
  });
  const request = async (secret?: string) =>
    new Request("http://localhost:3019/api/webhooks/stripe", {
      body: payload,
      headers: secret
        ? {
            "stripe-signature": await Stripe.webhooks.generateTestHeaderStringAsync({
              payload,
              secret,
            }),
          }
        : {},
      method: "POST",
    });
  expect((await platform(await request())).status).toBe(400);
  expect((await platform(await request("whsec_connect_fixture"))).status).toBe(400);
  expect((await connected(await request("whsec_platform_fixture"))).status).toBe(400);
  expect((await connected(await request("whsec_connect_fixture"))).status).toBe(500);
  expect((await platform(await request("whsec_platform_fixture"))).status).toBe(200);
});

test("partial payments derive balance, public views dedupe, and credit notes reverse receivables", async () => {
  const id = await draft(orgA, clientA);
  expect(await sendInvoice(context(orgA), id)).toMatchObject({ success: true });
  expect(
    await recordInvoicePayment(context(orgA), id, { amount: 5, method: "bank_transfer" }),
  ).toMatchObject({ success: true });
  expect(
    await recordInvoicePayment(context(orgA), id, { amount: 0.001, method: "other" }),
  ).toMatchObject({ error: "Payment exceeds the remaining balance" });
  expect(await getInvoiceDetail(orgA, id)).toMatchObject({
    balance: "7.50",
    paidAmount: "5.00",
    settlementStatus: "partially_paid",
  });

  const [sent] = await db.select().from(invoices).where(eq(invoices.id, id));
  const { GET } = await import("../../src/app/api/public/invoices/[token]/route");
  expect(
    (
      await GET(new Request("http://localhost"), {
        params: Promise.resolve({ token: sent.publicToken! }),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await GET(new Request("http://localhost"), {
        params: Promise.resolve({ token: sent.publicToken! }),
      })
    ).status,
  ).toBe(200);
  expect(
    await db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.invoiceId, id), eq(activityLog.action, "viewed"))),
  ).toHaveLength(1);

  const creditResult = await createCreditNote(context(orgA), id);
  expect(creditResult).toMatchObject({ success: true });
  if (!("invoiceId" in creditResult)) {
    throw new Error("Credit note was not created");
  }
  madeInvoices.push(creditResult.invoiceId);
  expect((await getInvoiceDetail(orgA, creditResult.invoiceId))?.number).toBe("CN-0001");
  expect(await sendInvoice(context(orgA), creditResult.invoiceId)).toMatchObject({ success: true });
  expect(await getInvoiceDetail(orgA, id)).toMatchObject({
    balance: "0.00",
    creditedAmount: "12.50",
    settlementStatus: "paid",
    status: "cancelled",
  });
  expect(
    await recordInvoicePayment(context(orgA), id, { amount: 1, method: "other" }),
  ).toMatchObject({ error: "Only an outstanding issued invoice can receive payments" });
});

test("chat persists and reminder proposals enqueue their frozen payload", async () => {
  const thread = await getChatThread({ orgId: orgA, userId });
  await saveChatMessage(thread.id, {
    id: `message-${userId}`,
    parts: [{ text: "Hello", type: "text" }],
    role: "user",
  });
  expect(await loadChatMessages(thread.id)).toMatchObject([
    { parts: [{ text: "Hello", type: "text" }], role: "user" },
  ]);

  const id = await draft(orgA, clientA);
  expect(await sendInvoice(context(orgA), id)).toMatchObject({ success: true });
  const created = await createReminderProposal(context(orgA), id, "Invoice is overdue");
  expect(created).toHaveProperty("proposal");
  if (!("proposal" in created)) {
    throw new Error("Proposal was not created");
  }
  expect(await approveProposal(context(orgA), created.proposal.id)).toMatchObject({
    success: true,
  });
  const [saved] = await db.select().from(proposals).where(eq(proposals.id, created.proposal.id));
  expect(saved.status).toBe("approved");
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.invoiceId, id), eq(jobs.type, "send_invoice_reminder_email")));
  expect(job.payload).toMatchObject({
    proposalId: created.proposal.id,
    reminder: { invoiceNumber: id, to: "test@example.com" },
  });
});

afterAll(async () => {
  priceMock.mockRestore();
  linkMock.mockRestore();
  linkUpdateMock.mockRestore();
  for (const id of madeInvoices.reverse()) {
    await db.delete(activityLog).where(eq(activityLog.invoiceId, id));
    await db.delete(invoices).where(eq(invoices.id, id));
    await db.delete(stripeEvents).where(like(stripeEvents.id, `evt_${id}%`));
  }
  await db.delete(chatThreads).where(eq(chatThreads.userId, userId));
  for (const id of [orgA, orgB, orgFree, orgOAuth, orgCheckout]) {
    await db.delete(clients).where(eq(clients.orgId, id));
    await db.delete(orgs).where(eq(orgs.id, id));
  }
  await db.delete(users).where(eq(users.id, userId));
});
