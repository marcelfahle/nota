"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { PasswordResetEmail } from "@/emails/password-reset";
import { DEFAULT_FROM_EMAIL } from "@/lib/app-brand";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { resend } from "@/lib/email";
import { getAppEnv, getEmailEnv } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createPasswordResetToken, verifyPasswordResetToken } from "@/lib/password-reset";

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  email: z.email("Enter a valid email address"),
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

type AuthFormState = {
  error?: string;
  success?: string;
} | null;

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
  const [user] = await db
    .insert(users)
    .values({
      email: result.data.email,
      name: result.data.name,
      passwordHash,
    })
    .returning({ id: users.id });

  await setSessionCookie(user.id);
  redirect("/invoices");
}

export async function requestPasswordReset(_prevState: AuthFormState, formData: FormData) {
  const result = passwordResetRequestSchema.safeParse({
    email: (formData.get("email") as string | null)?.trim().toLowerCase(),
  });

  if (!result.success) {
    return { error: result.error.issues[0].message };
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
    const resetUrl = new URL("/reset-password", getAppEnv().APP_URL);
    resetUrl.searchParams.set("token", token);

    await resend.emails.send({
      from: getEmailEnv().RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
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
