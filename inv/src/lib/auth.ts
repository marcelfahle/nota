import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

function signUserId(userId: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET!).update(userId).digest("hex");
}

export function createSessionValue(userId: string): string {
  return `${userId}.${signUserId(userId)}`;
}

function getSessionUserId(sessionValue?: string): string | null {
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

export async function getCurrentUserOrNull() {
  const cookieStore = await cookies();
  const sessionUserId = getSessionUserId(cookieStore.get("session")?.value);

  if (!sessionUserId) {
    return null;
  }

  const [user] = await db.select().from(users).where(eq(users.id, sessionUserId)).limit(1);
  return user ?? null;
}

export async function getCurrentUser() {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login");
  }

  return user;
}
