import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { oauthClients, oauthConsents } from "@/lib/db/schema";

export async function listConnectedApps(userId: string) {
  return db
    .select({
      clientId: oauthConsents.clientId,
      connectedAt: oauthConsents.createdAt,
      lastUsedAt: oauthConsents.updatedAt,
      name: oauthClients.name,
    })
    .from(oauthConsents)
    .innerJoin(oauthClients, eq(oauthClients.clientId, oauthConsents.clientId))
    .where(eq(oauthConsents.userId, userId))
    .orderBy(desc(oauthConsents.createdAt));
}
