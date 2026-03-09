"use server";

import { randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { InviteEmail } from "@/emails/invite";
import { DEFAULT_FROM_EMAIL } from "@/lib/app-brand";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { invites, orgMembers, orgRoleEnum, orgs, users } from "@/lib/db/schema";
import { getResend } from "@/lib/email";
import { getEmailEnv } from "@/lib/env";
import { getInviteLink } from "@/lib/invites";
import { canManageMembers, getInsufficientPermissionsError } from "@/lib/roles";

const inviteSchema = z.object({
  email: z.email("Enter a valid email address"),
  role: z.enum(orgRoleEnum.enumValues),
});

const memberRoleSchema = z.object({
  role: z.enum(orgRoleEnum.enumValues),
});

export type InviteMemberState = {
  error?: string;
  inviteUrl?: string;
  success?: boolean;
  warning?: string;
} | null;

function createInviteToken() {
  return randomBytes(32).toString("base64url");
}

async function requireOwnerContext() {
  const context = await getCurrentUser();

  if (!canManageMembers(context.role)) {
    return { error: getInsufficientPermissionsError() };
  }

  return { context };
}

async function countOwners(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], orgId: string) {
  const members = await tx
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(eq(orgMembers.orgId, orgId));

  return members.filter((member) => member.role === "owner").length;
}

export async function inviteMember(_prevState: InviteMemberState, formData: FormData) {
  const ownerResult = await requireOwnerContext();
  if ("error" in ownerResult) {
    return { error: ownerResult.error };
  }

  const result = inviteSchema.safeParse({
    email: (formData.get("email") as string | null)?.trim().toLowerCase(),
    role: formData.get("role"),
  });

  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const {
    context: { org, user },
  } = ownerResult;

  const [existingMember] = await db
    .select({ id: orgMembers.id })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(orgMembers.orgId, org.id), eq(users.email, result.data.email)))
    .limit(1);

  if (existingMember) {
    return { error: "That user is already a member of this organization" };
  }

  const [existingInvite] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.orgId, org.id), eq(invites.email, result.data.email)))
    .limit(1);

  const token = createInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const inviteUrl = getInviteLink(token);

  if (existingInvite) {
    await db
      .update(invites)
      .set({
        acceptedAt: null,
        expiresAt,
        invitedBy: user.id,
        role: result.data.role,
        token,
      })
      .where(eq(invites.id, existingInvite.id));
  } else {
    await db.insert(invites).values({
      email: result.data.email,
      expiresAt,
      invitedBy: user.id,
      orgId: org.id,
      role: result.data.role,
      token,
    });
  }

  try {
    if (!inviteUrl.startsWith("http")) {
      throw new Error("APP_URL must be configured for invite emails");
    }

    await getResend().emails.send({
      from: getEmailEnv().RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
      react: InviteEmail({
        inviteUrl,
        orgName: org.businessName ?? org.name,
        role: result.data.role,
      }),
      subject: `You've been invited to join ${org.businessName ?? org.name} on Nota`,
      to: [result.data.email],
    });
  } catch {
    return {
      inviteUrl,
      success: true,
      warning: "Invite created, but the email could not be sent. Share the link manually.",
    };
  }

  return { inviteUrl, success: true };
}

export async function removeMember(memberId: string) {
  const ownerResult = await requireOwnerContext();
  if ("error" in ownerResult) {
    return { error: ownerResult.error };
  }

  const {
    context: { org },
  } = ownerResult;

  return db.transaction(async (tx) => {
    const [member] = await tx
      .select({ id: orgMembers.id, role: orgMembers.role })
      .from(orgMembers)
      .where(and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, org.id)))
      .limit(1);

    if (!member) {
      return { error: "Member not found" };
    }

    if (member.role === "owner" && (await countOwners(tx, org.id)) <= 1) {
      return { error: "Cannot remove the last owner" };
    }

    await tx.delete(orgMembers).where(eq(orgMembers.id, memberId));
    return { success: true };
  });
}

export async function updateMemberRole(
  memberId: string,
  role: (typeof orgRoleEnum.enumValues)[number],
) {
  const ownerResult = await requireOwnerContext();
  if ("error" in ownerResult) {
    return { error: ownerResult.error };
  }

  const roleResult = memberRoleSchema.safeParse({ role });
  if (!roleResult.success) {
    return { error: roleResult.error.issues[0].message };
  }

  const {
    context: { org },
  } = ownerResult;

  return db.transaction(async (tx) => {
    const [member] = await tx
      .select({ id: orgMembers.id, role: orgMembers.role })
      .from(orgMembers)
      .where(and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, org.id)))
      .limit(1);

    if (!member) {
      return { error: "Member not found" };
    }

    if (
      member.role === "owner" &&
      roleResult.data.role !== "owner" &&
      (await countOwners(tx, org.id)) <= 1
    ) {
      return { error: "Cannot demote the last owner" };
    }

    await tx
      .update(orgMembers)
      .set({ role: roleResult.data.role })
      .where(eq(orgMembers.id, memberId));
    return { success: true };
  });
}

export async function listMembers() {
  const ownerResult = await requireOwnerContext();
  if ("error" in ownerResult) {
    return { error: ownerResult.error };
  }

  const {
    context: { org },
  } = ownerResult;

  const [members, pendingInvites, [organization]] = await Promise.all([
    db
      .select({
        createdAt: orgMembers.createdAt,
        email: users.email,
        id: orgMembers.id,
        name: users.name,
        role: orgMembers.role,
        userId: users.id,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(eq(orgMembers.orgId, org.id)),
    db
      .select({
        acceptedAt: invites.acceptedAt,
        createdAt: invites.createdAt,
        email: invites.email,
        expiresAt: invites.expiresAt,
        id: invites.id,
        role: invites.role,
        token: invites.token,
      })
      .from(invites)
      .where(and(eq(invites.orgId, org.id), isNull(invites.acceptedAt))),
    db
      .select({ businessName: orgs.businessName, name: orgs.name })
      .from(orgs)
      .where(eq(orgs.id, org.id))
      .limit(1),
  ]);

  return {
    members,
    organizationName: organization?.businessName ?? organization?.name ?? org.name,
    pendingInvites,
  };
}

export async function revokeInvite(inviteId: string) {
  const ownerResult = await requireOwnerContext();
  if ("error" in ownerResult) {
    return { error: ownerResult.error };
  }

  const {
    context: { org },
  } = ownerResult;

  const [invite] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.id, inviteId), eq(invites.orgId, org.id)))
    .limit(1);

  if (!invite) {
    return { error: "Invite not found" };
  }

  await db.delete(invites).where(eq(invites.id, inviteId));
  return { success: true };
}
