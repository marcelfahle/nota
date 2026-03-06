"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { createApiKey } from "@/lib/api-auth";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { canManageApiKeys, getInsufficientPermissionsError } from "@/lib/roles";

const createApiKeySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(64, "Name must be 64 characters or fewer"),
});

export type CreateApiKeyState = {
  error?: string;
  key?: string;
  keyName?: string;
  keyPrefix?: string;
  success?: boolean;
} | null;

async function requireApiKeyManager() {
  const context = await getCurrentUser();

  if (!canManageApiKeys(context.role)) {
    return { error: getInsufficientPermissionsError() };
  }

  return { context };
}

export async function createApiKeyAction(_prevState: CreateApiKeyState, formData: FormData) {
  const permissionResult = await requireApiKeyManager();
  if ("error" in permissionResult) {
    return { error: permissionResult.error };
  }

  const result = createApiKeySchema.safeParse({
    name: formData.get("name"),
  });

  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const {
    context: { org, user },
  } = permissionResult;
  const created = await createApiKey(org.id, user.id, result.data.name);

  return {
    key: created.key,
    keyName: created.name,
    keyPrefix: created.keyPrefix,
    success: true,
  };
}

export async function deleteApiKeyAction(apiKeyId: string) {
  const permissionResult = await requireApiKeyManager();
  if ("error" in permissionResult) {
    return { error: permissionResult.error };
  }

  const {
    context: { org },
  } = permissionResult;

  const [existingApiKey] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.orgId, org.id)))
    .limit(1);

  if (!existingApiKey) {
    return { error: "API key not found" };
  }

  await db.delete(apiKeys).where(eq(apiKeys.id, apiKeyId));
  return { success: true };
}
