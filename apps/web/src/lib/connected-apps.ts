import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
} from "@/lib/db/schema";

/** Removing consent invalidates even already-issued JWT access tokens. */
export async function disconnectApp(userId: string, clientId: string) {
  await db.transaction(async (tx) => {
    await tx
      .delete(oauthAccessTokens)
      .where(and(eq(oauthAccessTokens.clientId, clientId), eq(oauthAccessTokens.userId, userId)));
    await tx
      .delete(oauthRefreshTokens)
      .where(and(eq(oauthRefreshTokens.clientId, clientId), eq(oauthRefreshTokens.userId, userId)));
    await tx
      .delete(oauthConsents)
      .where(and(eq(oauthConsents.clientId, clientId), eq(oauthConsents.userId, userId)));
  });
}

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
