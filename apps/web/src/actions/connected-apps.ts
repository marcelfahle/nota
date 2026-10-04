"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { oauthAccessTokens, oauthConsents, oauthRefreshTokens } from "@/lib/db/schema";

/**
 * Disconnects an assistant by removing its consent and all issued tokens.
 * API authentication also requires active consent, invalidating JWTs immediately.
 */
export async function disconnectAppAction(clientId: string) {
  const { user } = await getCurrentUser();

  await db.transaction(async (tx) => {
    await tx
      .delete(oauthAccessTokens)
      .where(and(eq(oauthAccessTokens.clientId, clientId), eq(oauthAccessTokens.userId, user.id)));
    await tx
      .delete(oauthRefreshTokens)
      .where(
        and(eq(oauthRefreshTokens.clientId, clientId), eq(oauthRefreshTokens.userId, user.id)),
      );
    await tx
      .delete(oauthConsents)
      .where(and(eq(oauthConsents.clientId, clientId), eq(oauthConsents.userId, user.id)));
  });

  revalidatePath("/agents");
  return { success: true };
}
