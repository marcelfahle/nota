import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/better-auth";
import { getUserContextById, type AuthenticatedUserContext } from "@/lib/user-context";

export type { AuthenticatedRole, AuthenticatedUserContext } from "@/lib/user-context";

// The root layout, the dashboard layout and the page all ask who is signed in.
// cache() makes that one session lookup and one user query per request.
export const getCurrentUserOrNull = cache(async (): Promise<AuthenticatedUserContext | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return null;
  }

  return getUserContextById(session.user.id);
});

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
