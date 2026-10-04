import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  activityLog,
  bankAccounts,
  clients,
  invoices,
  orgMembers,
  orgs,
  users,
} from "@/lib/db/schema";
import { deleteManagedLogo } from "@/lib/logo-storage";

const LIVE_SUBSCRIPTION = new Set(["active", "past_due", "trialing", "unpaid"]);

export type WorkspaceDeletion =
  | { error: string }
  | { deleted: { clients: number; invoices: number; users: number } };

/**
 * Deletes a workspace and everything in it, for good: invoices, clients, bank
 * details, invites, API keys, chat, and every member who belongs to no other
 * workspace. Members of another workspace keep their account. Operators only;
 * the caller checks that.
 */
export async function deleteWorkspace(orgId: string): Promise<WorkspaceDeletion> {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
  if (!org) {
    return { error: "Workspace not found." };
  }
  // A paying workspace would keep being billed by Stripe after its rows are gone.
  if (org.stripeSubscriptionStatus && LIVE_SUBSCRIPTION.has(org.stripeSubscriptionStatus)) {
    return { error: "This workspace has a live subscription. Cancel it in Stripe first." };
  }

  const deleted = await db.transaction(async (tx) => {
    const soleMembers = await tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(orgMembers, eq(orgMembers.userId, users.id))
      .where(
        and(
          eq(orgMembers.orgId, orgId),
          eq(users.isSuperAdmin, false),
          sql`not exists (select 1 from org_members other where other.user_id = ${users.id} and other.org_id <> ${orgId})`,
        ),
      );
    const userIds = soleMembers.map((member) => member.id);
    // Rows from before workspaces existed carry no org; they go with their owner.
    const hasOwners = userIds.length > 0;
    const invoiceScope = hasOwners
      ? or(
          eq(invoices.orgId, orgId),
          and(isNull(invoices.orgId), inArray(invoices.userId, userIds)),
        )
      : eq(invoices.orgId, orgId);
    const clientScope = hasOwners
      ? or(eq(clients.orgId, orgId), and(isNull(clients.orgId), inArray(clients.userId, userIds)))
      : eq(clients.orgId, orgId);
    const bankScope = hasOwners
      ? or(
          eq(bankAccounts.orgId, orgId),
          and(isNull(bankAccounts.orgId), inArray(bankAccounts.userId, userIds)),
        )
      : eq(bankAccounts.orgId, orgId);

    const doomed = await tx.select({ id: invoices.id }).from(invoices).where(invoiceScope);
    const invoiceIds = doomed.map((invoice) => invoice.id);
    if (invoiceIds.length > 0) {
      await tx.delete(activityLog).where(inArray(activityLog.invoiceId, invoiceIds));
      await tx
        .update(invoices)
        .set({ creditsInvoiceId: null })
        .where(inArray(invoices.id, invoiceIds));
      // Line items, payments, proposals and jobs go with their invoice.
      await tx.delete(invoices).where(inArray(invoices.id, invoiceIds));
    }
    const removedClients = await tx
      .delete(clients)
      .where(clientScope)
      .returning({ id: clients.id });
    await tx.delete(bankAccounts).where(bankScope);
    // Members, invites, API keys, chat, payments and model overrides cascade.
    await tx.delete(orgs).where(eq(orgs.id, orgId));
    if (userIds.length > 0) {
      // Sessions, credentials and OAuth grants cascade from the user.
      await tx.delete(users).where(inArray(users.id, userIds));
    }
    return { clients: removedClients.length, invoices: invoiceIds.length, users: userIds.length };
  });

  // Stored files are outside the transaction; a leftover file is harmless.
  await Promise.all([deleteManagedLogo(org.logoUrl), deleteManagedLogo(org.faviconUrl)]);
  return { deleted };
}
