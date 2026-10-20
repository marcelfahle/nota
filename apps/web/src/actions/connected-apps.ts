"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { disconnectApp } from "@/lib/connected-apps";

/** Revoke only the current user's connection, including issued access tokens. */
export async function disconnectAppAction(clientId: string) {
  const { user } = await getCurrentUser();
  await disconnectApp(user.id, clientId);
  revalidatePath("/agents");
  revalidatePath("/settings");
  return { success: true };
}
