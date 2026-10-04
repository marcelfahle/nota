import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/better-auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getUserContextById, type AuthenticatedUserContext } from "@/lib/user-context";

export type { AuthenticatedRole, AuthenticatedUserContext } from "@/lib/user-context";

export const getCurrentSessionUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return null;
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  return user ?? null;
});

// The root layout, dashboard layout and page all ask who is signed in.
// cache() makes the workspace lookup run once per request.
export const getCurrentUserOrNull = cache(async (): Promise<AuthenticatedUserContext | null> => {
  const user = await getCurrentSessionUser();
  if (!user || user.isSuperAdmin) {
    return null;
  }

  return getUserContextById(user.id);
});

export async function getCurrentUser(): Promise<AuthenticatedUserContext> {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    redirect("/login");
  }
  if (sessionUser.isSuperAdmin) {
    redirect(sessionUser.mustChangePassword ? "/admin/password" : "/admin");
  }
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login");
  }
  // A deactivated workspace keeps its data but its members cannot use the app.
  if (user.org.deactivatedAt) {
    redirect("/deactivated");
  }

  return user;
}

/** For API routes: a member of a deactivated workspace is treated as signed out. */
export async function getActiveUserOrNull() {
  const user = await getCurrentUserOrNull();
  return user && !user.org.deactivatedAt ? user : null;
}

export async function getCurrentOrg() {
  const user = await getCurrentUser();
  return user.org;
}

export async function requireSuperAdmin(options: { allowPasswordChange?: boolean } = {}) {
  const user = await getCurrentSessionUser();
  if (!user?.isSuperAdmin) {
    notFound();
  }
  if (user.mustChangePassword && !options.allowPasswordChange) {
    redirect("/admin/password");
  }
  return user;
}
