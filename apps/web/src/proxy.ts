import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

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

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Optimistic cookie check only; pages verify the session against the database.
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
