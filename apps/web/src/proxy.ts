import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

import { refusesWhileViewingAs, VIEW_AS_COOKIE } from "@/lib/admin-view-as";

const PUBLIC_PATHS = [
  "/.well-known",
  // Vercel BotID's challenge script and proxy.
  "/149e9513-01fa-4fb0-aad4-566afd725d1b",
  "/api/auth",
  "/api/cron",
  "/api/doctor",
  "/api/health",
  "/api/mcp",
  "/api/onboarding",
  "/api/public/",
  "/api/ready",
  "/api/storage/",
  "/api/v1",
  "/api/webhooks",
  "/forgot-password",
  "/i/",
  "/login",
  // The web app manifest and its icons are fetched without the session cookie.
  "/apple-icon",
  "/icon-",
  "/manifest.webmanifest",
  "/mcp",
  "/oauth",
  "/register",
  "/reset-password",
  "/start",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Email clients fetch this brand asset without a Nota session.
  const isPublic =
    pathname === "/email/nota-mark.png" || PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  // Optimistic cookie check only; pages verify the session against the database.
  const hasSession = Boolean(getSessionCookie(request));
  const viewingAs = request.cookies.has(VIEW_AS_COOKIE);

  // A super admin viewing a workspace as its owner is read-only. Server actions
  // and API routes are all POSTs, so this one check refuses every write.
  if (viewingAs && hasSession && refusesWhileViewingAs(request.method, pathname)) {
    return NextResponse.json({ error: "Read-only while viewing as support." }, { status: 403 });
  }

  const response =
    isPublic || hasSession
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/login", request.url));
  if (viewingAs && !hasSession) {
    // Signed out: the grant goes with the session, so whoever signs in next
    // on this browser is not read-only.
    response.cookies.delete(VIEW_AS_COOKIE);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
