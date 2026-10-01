import { createHash, randomBytes } from "node:crypto";

import { verifyBearerToken } from "better-auth/oauth2";
import { and, eq } from "drizzle-orm";

import { getAuthIssuer, getMcpResource } from "@/lib/auth-config";
import { db } from "@/lib/db";
import { apiKeys, orgMembers, orgs, users } from "@/lib/db/schema";
import { getUserContextById, type AuthenticatedRole } from "@/lib/user-context";

const API_KEY_PREFIX = "nota_";
const API_KEY_PREFIX_LENGTH = 8;
const API_KEY_TOKEN_BYTES = 24;

type ApiKeyRecord = typeof apiKeys.$inferSelect;
type OrgRecord = typeof orgs.$inferSelect;
type UserRecord = typeof users.$inferSelect;

export type ApiRequestAuthContext = {
  /** The `nota_` key used, or null for an OAuth access token (ChatGPT, Claude). */
  apiKey: ApiKeyRecord | null;
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

/**
 * OAuth access tokens are JWTs that Better Auth issues to MCP clients, bound to
 * the MCP resource. The MCP route forwards them here unchanged.
 */
async function authenticateOAuthToken(token: string): Promise<ApiRequestAuthContext | null> {
  let userId: string | undefined;
  try {
    const claims = await verifyBearerToken(token, {
      jwksUrl: `${getAuthIssuer()}/api/auth/jwks`,
      verifyOptions: { audience: getMcpResource(), issuer: getAuthIssuer() },
    });
    userId = typeof claims.sub === "string" ? claims.sub : undefined;
  } catch {
    return null;
  }
  if (!userId) {
    return null;
  }

  const context = await getUserContextById(userId);
  if (!context) {
    return null;
  }

  return { apiKey: null, org: context.org, role: context.role, user: context.user };
}

export async function authenticateApiRequest(
  request: Request,
): Promise<ApiRequestAuthContext | null> {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }
  if (!token.startsWith(API_KEY_PREFIX)) {
    return authenticateOAuthToken(token);
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
