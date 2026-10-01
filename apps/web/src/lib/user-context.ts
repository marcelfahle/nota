import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { orgMembers, orgRoleEnum, orgs, users } from "@/lib/db/schema";

type UserRecord = typeof users.$inferSelect;
type OrgRecord = typeof orgs.$inferSelect;
export type AuthenticatedRole = (typeof orgRoleEnum.enumValues)[number];
export type AuthenticatedUserContext = UserRecord & {
  org: OrgRecord;
  role: AuthenticatedRole;
  user: UserRecord;
};

/** A user's workspace: their earliest membership, as everywhere else in Nota. */
export async function getUserContextById(userId: string): Promise<AuthenticatedUserContext | null> {
  const [context] = await db
    .select({
      org: orgs,
      role: orgMembers.role,
      user: users,
    })
    .from(users)
    .innerJoin(orgMembers, eq(orgMembers.userId, users.id))
    .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
    .where(eq(users.id, userId))
    .orderBy(asc(orgMembers.createdAt))
    .limit(1);

  if (!context) {
    return null;
  }

  return { ...context.user, org: context.org, role: context.role, user: context.user };
}
