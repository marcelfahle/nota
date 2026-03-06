import { createHmac, timingSafeEqual } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { orgMembers, orgRoleEnum, orgs, users } from "@/lib/db/schema";
import { getAuthEnv } from "@/lib/env";

type UserRecord = typeof users.$inferSelect;
type OrgRecord = typeof orgs.$inferSelect;
export type AuthenticatedRole = (typeof orgRoleEnum.enumValues)[number];
export type AuthenticatedUserContext = UserRecord & {
  org: OrgRecord;
  role: AuthenticatedRole;
  user: UserRecord;
};

function signUserId(userId: string): string {
  return createHmac("sha256", getAuthEnv().SESSION_SECRET).update(userId).digest("hex");
}

function buildAuthContext(
  user: UserRecord,
  org: OrgRecord,
  role: AuthenticatedRole,
): AuthenticatedUserContext {
  return {
    ...user,
    org,
    role,
    user,
  };
}

export function createSessionValue(userId: string): string {
  return `${userId}.${signUserId(userId)}`;
}

export function getSessionUserId(sessionValue?: string): string | null {
  if (!sessionValue) {
    return null;
  }

  const [userId, signature] = sessionValue.split(".");
  if (!userId || !signature) {
    return null;
  }

  const expectedSignature = signUserId(userId);
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const actualBuffer = Buffer.from(signature, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  return userId;
}

export async function setSessionCookie(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set("session", createSessionValue(userId), {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: getAuthEnv().NODE_ENV === "production",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

export async function getCurrentUserOrNull(): Promise<AuthenticatedUserContext | null> {
  const cookieStore = await cookies();
  const sessionUserId = getSessionUserId(cookieStore.get("session")?.value);

  if (!sessionUserId) {
    return null;
  }

  const [context] = await db
    .select({
      org: orgs,
      role: orgMembers.role,
      user: users,
    })
    .from(users)
    .innerJoin(orgMembers, eq(orgMembers.userId, users.id))
    .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
    .where(eq(users.id, sessionUserId))
    .orderBy(asc(orgMembers.createdAt))
    .limit(1);

  if (!context) {
    return null;
  }

  return buildAuthContext(context.user, context.org, context.role);
}

export async function getCurrentUser(): Promise<AuthenticatedUserContext> {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function getCurrentOrg(): Promise<OrgRecord> {
  const user = await getCurrentUser();
  return user.org;
}
