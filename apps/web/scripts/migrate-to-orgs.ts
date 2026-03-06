/* eslint-disable no-console */
import { Pool } from "@neondatabase/serverless";
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import { bankAccounts, clients, invoices, orgMembers, orgs, users } from "../src/lib/db/schema";
import { getDbEnv } from "../src/lib/env";

const pool = new Pool({ connectionString: getDbEnv().DATABASE_URL });
const db = drizzle({ client: pool });

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function defaultOrgName(user: { businessName: string | null; name: string }) {
  return trimOrNull(user.businessName) ?? `${user.name}'s Workspace`;
}

const existingUsers = await db
  .select({
    businessAddress: users.businessAddress,
    businessName: users.businessName,
    createdAt: users.createdAt,
    defaultCurrency: users.defaultCurrency,
    email: users.email,
    id: users.id,
    invoiceDigits: users.invoiceDigits,
    invoicePrefix: users.invoicePrefix,
    invoiceSeparator: users.invoiceSeparator,
    logoUrl: users.logoUrl,
    name: users.name,
    nextInvoiceNumber: users.nextInvoiceNumber,
    vatNumber: users.vatNumber,
  })
  .from(users);

for (const user of existingUsers) {
  await db.transaction(async (tx) => {
    const [existingMembership] = await tx
      .select({ orgId: orgMembers.orgId })
      .from(orgMembers)
      .where(eq(orgMembers.userId, user.id))
      .limit(1);

    let orgId = existingMembership?.orgId;

    if (!orgId) {
      const [org] = await tx
        .insert(orgs)
        .values({
          businessAddress: trimOrNull(user.businessAddress),
          businessName: trimOrNull(user.businessName),
          createdAt: user.createdAt ?? new Date(),
          defaultCurrency: trimOrNull(user.defaultCurrency) ?? "EUR",
          invoiceDigits: user.invoiceDigits ?? 4,
          invoicePrefix: trimOrNull(user.invoicePrefix) ?? "INV",
          invoiceSeparator: trimOrNull(user.invoiceSeparator) ?? "-",
          logoUrl: trimOrNull(user.logoUrl),
          name: defaultOrgName(user),
          nextInvoiceNumber: user.nextInvoiceNumber ?? 1,
          vatNumber: trimOrNull(user.vatNumber),
        })
        .returning({ id: orgs.id });

      orgId = org.id;

      await tx.insert(orgMembers).values({
        orgId,
        role: "owner",
        userId: user.id,
      });

      console.log(`Created org and owner membership for ${user.email}`);
    }

    await tx
      .update(bankAccounts)
      .set({ orgId })
      .where(and(eq(bankAccounts.userId, user.id), isNull(bankAccounts.orgId)));

    await tx
      .update(clients)
      .set({ orgId })
      .where(and(eq(clients.userId, user.id), isNull(clients.orgId)));

    await tx
      .update(invoices)
      .set({ orgId })
      .where(and(eq(invoices.userId, user.id), isNull(invoices.orgId)));
  });
}

const [clientsWithoutOrg] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(clients)
  .where(isNull(clients.orgId));

const [invoicesWithoutOrg] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(invoices)
  .where(isNull(invoices.orgId));

const [bankAccountsWithoutOrg] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(bankAccounts)
  .where(isNull(bankAccounts.orgId));

const [usersWithoutMembership] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(users)
  .leftJoin(orgMembers, eq(orgMembers.userId, users.id))
  .where(isNull(orgMembers.id));

console.log("Backfill verification:");
console.log(`- clients without org: ${clientsWithoutOrg?.count ?? 0}`);
console.log(`- invoices without org: ${invoicesWithoutOrg?.count ?? 0}`);
console.log(`- bank accounts without org: ${bankAccountsWithoutOrg?.count ?? 0}`);
console.log(`- users without membership: ${usersWithoutMembership?.count ?? 0}`);

await pool.end();
