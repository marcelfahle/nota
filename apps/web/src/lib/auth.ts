import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { verifyViewAs, VIEW_AS_COOKIE } from "@/lib/admin-view-as";
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

/**
 * The workspace owner a super admin is viewing as for support, or null. The
 * grant only counts next to the session of the admin who started it; the
 * proxy refuses every write while the cookie is set.
 */
export const getViewAs = cache(async () => {
  const admin = await getCurrentSessionUser();
  if (!admin?.isSuperAdmin || admin.mustChangePassword) {
    return null;
  }
  const claims = verifyViewAs((await cookies()).get(VIEW_AS_COOKIE)?.value);
  return claims && claims.adminUserId === admin.id ? claims : null;
});

// The root layout, dashboard layout and page all ask who is signed in.
// cache() makes the workspace lookup run once per request.
export const getCurrentUserOrNull = cache(async (): Promise<AuthenticatedUserContext | null> => {
  const user = await getCurrentSessionUser();
  if (!user) {
    return null;
  }
  // Super admins are not workspace users, unless they are viewing one for support.
  if (user.isSuperAdmin) {
    const viewAs = await getViewAs();
    return viewAs ? getUserContextById(viewAs.userId, viewAs.orgId) : null;
  }

  return getUserContextById(user.id);
});

export async function getCurrentUser(): Promise<AuthenticatedUserContext> {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    redirect("/login");
  }
  const user = await getCurrentUserOrNull();
  if (!user) {
    if (sessionUser.isSuperAdmin) {
      redirect(sessionUser.mustChangePassword ? "/admin/password" : "/admin");
    }
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
