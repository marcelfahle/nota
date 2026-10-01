import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/.well-known",
  "/api/auth",
  "/api/cron",
  "/api/mcp",
  "/api/v1",
  "/api/webhooks",
  "/forgot-password",
  "/login",
  "/mcp",
  "/oauth",
  "/register",
  "/reset-password",
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
