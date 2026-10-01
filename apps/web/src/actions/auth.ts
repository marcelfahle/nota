"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/better-auth";

// Sign-in, sign-up and password reset go through Better Auth's client
// (see src/lib/auth-client.ts) so pending OAuth authorizations can resume.

export async function logout() {
  // Deletes the session server-side, not just the cookie.
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
