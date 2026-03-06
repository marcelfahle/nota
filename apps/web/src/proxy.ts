import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/api/cron",
  "/api/v1",
  "/api/webhooks",
  "/forgot-password",
  "/login",
  "/register",
  "/reset-password",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const session = request.cookies.get("session")?.value;

  if (!session || !session.includes(".")) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
