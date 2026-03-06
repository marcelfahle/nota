import { createHash, randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { AuthenticatedRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys, orgMembers, orgs, users } from "@/lib/db/schema";

const API_KEY_PREFIX = "nota_";
const API_KEY_PREFIX_LENGTH = 8;
const API_KEY_TOKEN_BYTES = 24;

type ApiKeyRecord = typeof apiKeys.$inferSelect;
type OrgRecord = typeof orgs.$inferSelect;
type UserRecord = typeof users.$inferSelect;

export type ApiRequestAuthContext = {
  apiKey: ApiKeyRecord;
  org: OrgRecord;
  role: AuthenticatedRole;
  user: UserRecord;
};

export function getApiKeyPrefix(apiKey: string) {
  return apiKey.slice(0, API_KEY_PREFIX_LENGTH);
}

export function hashApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

function createRawApiKey() {
  return `${API_KEY_PREFIX}${randomBytes(API_KEY_TOKEN_BYTES).toString("base64url")}`;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim();
}

export async function createApiKey(orgId: string, userId: string, name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error("API key name is required");
  }

  const key = createRawApiKey();
  const keyHash = hashApiKey(key);
  const keyPrefix = getApiKeyPrefix(key);

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      keyHash,
      keyPrefix,
      name: normalizedName,
      orgId,
      userId,
    })
    .returning({
      createdAt: apiKeys.createdAt,
      id: apiKeys.id,
      keyPrefix: apiKeys.keyPrefix,
      name: apiKeys.name,
      orgId: apiKeys.orgId,
      userId: apiKeys.userId,
    });

  return {
    ...apiKey,
    key,
  };
}

export async function authenticateApiRequest(
  request: Request,
): Promise<ApiRequestAuthContext | null> {
  const token = getBearerToken(request);
  if (!token || !token.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const keyHash = hashApiKey(token);
  const [context] = await db
    .select({
      apiKey: apiKeys,
      org: orgs,
      role: orgMembers.role,
      user: users,
    })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .innerJoin(
      orgMembers,
      and(eq(orgMembers.orgId, apiKeys.orgId), eq(orgMembers.userId, apiKeys.userId)),
    )
    .innerJoin(orgs, eq(orgs.id, apiKeys.orgId))
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!context) {
    return null;
  }

  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, context.apiKey.id));

  return context;
}
