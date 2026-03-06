"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { PasswordResetEmail } from "@/emails/password-reset";
import { DEFAULT_FROM_EMAIL } from "@/lib/app-brand";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { invites, orgMembers, orgs, users } from "@/lib/db/schema";
import { getResend } from "@/lib/email";
import { getActiveInviteByToken } from "@/lib/invites";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createPasswordResetToken, verifyPasswordResetToken } from "@/lib/password-reset";

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  email: z.email("Enter a valid email address"),
  invite: z.string().trim().optional(),
  name: z.string().trim().min(1, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const passwordResetRequestSchema = z.object({
  email: z.email("Enter a valid email address"),
});

const passwordResetSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  token: z.string().min(1, "Reset token is required"),
});

const passwordResetDeliveryEnvSchema = z.object({
  APP_URL: z.url("APP_URL must be a valid absolute URL"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  RESEND_FROM_EMAIL: z.string().min(1).optional(),
});

type AuthFormState = {
  error?: string;
  success?: string;
} | null;

function getWorkspaceName(name: string) {
  return `${name}'s Workspace`;
}

function getPasswordResetDeliveryConfig() {
  const result = passwordResetDeliveryEnvSchema.safeParse(process.env);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Password reset is not configured" };
  }

  return {
    appUrl: result.data.APP_URL,
    fromEmail: result.data.RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
  };
}

export async function login(_prevState: AuthFormState, formData: FormData) {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  const result = loginSchema.safeParse({ email, password });
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const [user] = await db.select().from(users).where(eq(users.email, result.data.email)).limit(1);
  if (!user) {
    return { error: "Invalid email or password" };
  }

  const valid = await verifyPassword(result.data.password, user.passwordHash);
  if (!valid) {
    return { error: "Invalid email or password" };
  }

  await setSessionCookie(user.id);
  redirect("/invoices");
}

export async function register(_prevState: AuthFormState, formData: FormData) {
  const result = registerSchema.safeParse({
    email: (formData.get("email") as string | null)?.trim().toLowerCase(),
    invite: (formData.get("invite") as string | null)?.trim() || undefined,
    name: formData.get("name"),
    password: formData.get("password"),
  });

  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, result.data.email))
    .limit(1);

  if (existingUser) {
    return { error: "An account already exists for that email" };
  }

  const passwordHash = await hashPassword(result.data.password);
  const invite = result.data.invite ? await getActiveInviteByToken(result.data.invite) : null;

  if (result.data.invite && !invite) {
    return { error: "Invite link is invalid or expired" };
  }

  if (invite && invite.email !== result.data.email) {
    return { error: `This invite is reserved for ${invite.email}` };
  }

  const [created] = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: result.data.email,
        name: result.data.name,
        passwordHash,
      })
      .returning({ id: users.id });

    if (invite) {
      await tx.insert(orgMembers).values({
        orgId: invite.orgId,
        role: invite.role,
        userId: user.id,
      });

      await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
    } else {
      const [org] = await tx
        .insert(orgs)
        .values({
          name: getWorkspaceName(result.data.name),
        })
        .returning({ id: orgs.id });

      await tx.insert(orgMembers).values({
        orgId: org.id,
        role: "owner",
        userId: user.id,
      });
    }

    return [{ id: user.id }];
  });

  await setSessionCookie(created.id);
  redirect("/invoices");
}

export async function requestPasswordReset(_prevState: AuthFormState, formData: FormData) {
  const result = passwordResetRequestSchema.safeParse({
    email: (formData.get("email") as string | null)?.trim().toLowerCase(),
  });

  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const deliveryConfig = getPasswordResetDeliveryConfig();
  if ("error" in deliveryConfig) {
    return { error: deliveryConfig.error };
  }

  const [user] = await db
    .select({
      email: users.email,
      id: users.id,
      name: users.name,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, result.data.email))
    .limit(1);

  if (user) {
    const token = createPasswordResetToken(user.id, user.passwordHash);
    const resetUrl = new URL("/reset-password", deliveryConfig.appUrl);
    resetUrl.searchParams.set("token", token);

    await getResend().emails.send({
      from: deliveryConfig.fromEmail,
      react: PasswordResetEmail({
        name: user.name,
        resetUrl: resetUrl.toString(),
      }),
      subject: "Reset your nota password",
      to: [user.email],
    });
  }

  return {
    success: "If that account exists, a password reset link has been sent.",
  };
}

export async function resetPassword(_prevState: AuthFormState, formData: FormData) {
  const result = passwordResetSchema.safeParse({
    password: formData.get("password"),
    token: formData.get("token"),
  });

  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const [user] = await db
    .select({
      email: users.email,
      id: users.id,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, result.data.token.split(".")[0] ?? ""))
    .limit(1);

  if (!user) {
    return { error: "Reset link is invalid or expired" };
  }

  const verifiedToken = verifyPasswordResetToken(result.data.token, user.passwordHash);
  if (!verifiedToken) {
    return { error: "Reset link is invalid or expired" };
  }

  const passwordHash = await hashPassword(result.data.password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

  await setSessionCookie(user.id);
  redirect("/invoices");
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}
