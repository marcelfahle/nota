import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/better-auth";
import { getUserContextById, type AuthenticatedUserContext } from "@/lib/user-context";

export type { AuthenticatedRole, AuthenticatedUserContext } from "@/lib/user-context";

export async function getCurrentUserOrNull(): Promise<AuthenticatedUserContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return null;
  }

  return getUserContextById(session.user.id);
}

export async function getCurrentUser(): Promise<AuthenticatedUserContext> {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function getCurrentOrg() {
  const user = await getCurrentUser();
  return user.org;
}
