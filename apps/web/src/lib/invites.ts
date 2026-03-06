import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { invites, orgs } from "@/lib/db/schema";

export type ActiveInvite = {
  email: string;
  expiresAt: Date;
  id: string;
  orgId: string;
  orgName: string;
  role: "owner" | "admin" | "member";
  token: string;
};

export function buildInviteUrl(appUrl: string, token: string) {
  const inviteUrl = new URL("/register", appUrl);
  inviteUrl.searchParams.set("invite", token);
  return inviteUrl.toString();
}

export async function getActiveInviteByToken(token: string): Promise<ActiveInvite | null> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return null;
  }

  const [invite] = await db
    .select({
      email: invites.email,
      expiresAt: invites.expiresAt,
      id: invites.id,
      orgBusinessName: orgs.businessName,
      orgId: invites.orgId,
      orgName: orgs.name,
      role: invites.role,
      token: invites.token,
    })
    .from(invites)
    .innerJoin(orgs, eq(orgs.id, invites.orgId))
    .where(
      and(
        eq(invites.token, trimmedToken),
        isNull(invites.acceptedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!invite) {
    return null;
  }

  return {
    email: invite.email,
    expiresAt: invite.expiresAt,
    id: invite.id,
    orgId: invite.orgId,
    orgName: invite.orgBusinessName ?? invite.orgName,
    role: invite.role,
    token: invite.token,
  };
}
