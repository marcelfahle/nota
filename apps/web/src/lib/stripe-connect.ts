import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db";
import { orgMembers, orgs, stripeConnectStates } from "@/lib/db/schema";
import { getAppEnv, getStripeConnectEnv, getStripeMode } from "@/lib/env";
import { getStripe } from "@/lib/stripe";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function beginStripeConnect(orgId: string, userId: string) {
  if (getStripeMode().STRIPE_MODE !== "connect") {
    throw new Error("Connect is not enabled in direct mode");
  }
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  if (!org) {
    throw new Error("Organization not found");
  }
  if (org.stripeAccountId) {
    if (org.stripeChargesEnabled) {
      throw new Error("Stripe is already connected");
    }
    const link = await getStripe().accountLinks.create({
      account: org.stripeAccountId,
      refresh_url: `${getAppEnv().APP_URL}/settings?connect=expired`,
      return_url: `${getAppEnv().APP_URL}/settings?connect=returned`,
      type: "account_onboarding",
    });
    return { url: link.url };
  }
  const clientId = getStripeConnectEnv().STRIPE_CONNECT_CLIENT_ID;
  const state = randomBytes(32).toString("hex");
  await db.insert(stripeConnectStates).values({
    expiresAt: new Date(Date.now() + 15 * 60_000),
    orgId,
    tokenHash: hash(state),
    userId,
  });
  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${getAppEnv().APP_URL}/api/stripe/connect/callback`,
    response_type: "code",
    scope: "read_write",
    state,
  }).toString();
  return { url: url.toString() };
}

export async function finishStripeConnect(
  orgId: string,
  userId: string,
  state: string,
  code: string,
) {
  const [claimed] = await db
    .delete(stripeConnectStates)
    .where(
      and(
        eq(stripeConnectStates.tokenHash, hash(state)),
        eq(stripeConnectStates.orgId, orgId),
        eq(stripeConnectStates.userId, userId),
        gt(stripeConnectStates.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!claimed) {
    throw new Error("The Stripe connection link expired. Please start again.");
  }
  await db.transaction(async (tx) => {
    const [org] = await tx.select().from(orgs).where(eq(orgs.id, orgId)).for("update");
    const [owner] = await tx
      .select()
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.orgId, orgId),
          eq(orgMembers.userId, userId),
          eq(orgMembers.role, "owner"),
        ),
      );
    if (!owner || !org || org.stripeAccountId) {
      throw new Error("Workspace cannot connect this account");
    }
    const token = await getStripe().oauth.token({ code, grant_type: "authorization_code" });
    if (!token.stripe_user_id || token.scope !== "read_write") {
      throw new Error("Stripe did not grant payment access");
    }
    const account = await getStripe().accounts.retrieve(token.stripe_user_id);
    await tx
      .update(orgs)
      .set({
        stripeAccountId: account.id,
        stripeChargesEnabled: account.charges_enabled,
        stripePayoutsEnabled: account.payouts_enabled,
      })
      .where(eq(orgs.id, orgId));
  });
}

export async function refreshStripeConnect(orgId: string) {
  await db.transaction(async (tx) => {
    const [org] = await tx.select().from(orgs).where(eq(orgs.id, orgId)).for("update");
    if (!org?.stripeAccountId) {
      return;
    }
    const account = await getStripe().accounts.retrieve(org.stripeAccountId);
    await tx
      .update(orgs)
      .set({
        stripeChargesEnabled: account.charges_enabled,
        stripePayoutsEnabled: account.payouts_enabled,
      })
      .where(eq(orgs.id, org.id));
  });
}

export async function disconnectStripe(orgId: string) {
  await db.transaction(async (tx) => {
    const [org] = await tx.select().from(orgs).where(eq(orgs.id, orgId)).for("update");
    if (!org?.stripeAccountId) {
      return;
    }
    await getStripe().oauth.deauthorize({
      client_id: getStripeConnectEnv().STRIPE_CONNECT_CLIENT_ID,
      stripe_user_id: org.stripeAccountId,
    });
    await tx
      .update(orgs)
      .set({ stripeAccountId: null, stripeChargesEnabled: false, stripePayoutsEnabled: false })
      .where(eq(orgs.id, orgId));
  });
}

export async function reconcileStripeDeauthorization(accountId: string) {
  await db.transaction(async (tx) => {
    const [org] = await tx
      .select()
      .from(orgs)
      .where(eq(orgs.stripeAccountId, accountId))
      .for("update");
    if (!org) {
      return;
    }
    try {
      // A delayed event must not undo a newer connection to the same account.
      await getStripe().accounts.retrieve(accountId);
      return;
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "account_invalid"
      ) {
        throw error;
      }
    }
    await tx
      .update(orgs)
      .set({ stripeAccountId: null, stripeChargesEnabled: false, stripePayoutsEnabled: false })
      .where(eq(orgs.id, org.id));
  });
}
