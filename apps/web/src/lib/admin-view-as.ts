import { createHmac, timingSafeEqual } from "node:crypto";

import { appSecret } from "@/lib/app-secret";

/**
 * "View as": a super admin opens a workspace the way its owner sees it, for
 * support. The grant is a signed, httpOnly cookie next to the admin's own
 * session, not a session for the owner. It lasts half an hour and every
 * request that could change something is refused while it is set.
 */
export const VIEW_AS_COOKIE = "nota_view_as";
export const VIEW_AS_TTL_SECONDS = 30 * 60;

export type ViewAsClaims = {
  adminUserId: string;
  /** Unix seconds. */
  exp: number;
  orgId: string;
  userId: string;
};

function sign(payload: string) {
  return createHmac("sha256", appSecret()).update(`view-as:${payload}`).digest("base64url");
}

export function signViewAs(claims: ViewAsClaims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The claims from a cookie value, or null when it is malformed, forged or expired. */
export function verifyViewAs(
  value: string | null | undefined,
  now = new Date(),
): ViewAsClaims | null {
  const [payload, signature] = (value ?? "").split(".");
  if (!payload || !signature) {
    return null;
  }
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  let claims: ViewAsClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  const valid =
    typeof claims.adminUserId === "string" &&
    typeof claims.orgId === "string" &&
    typeof claims.userId === "string" &&
    typeof claims.exp === "number";
  return valid && claims.exp * 1000 > now.getTime() ? claims : null;
}

export function viewAsCookieOptions(expires: Date) {
  return {
    expires,
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

const MUTATING_METHODS = new Set(["DELETE", "PATCH", "POST", "PUT"]);
// Leaving view-as and signing out are the only writes that make sense here,
// so only those two exact paths pass. Admin actions wait until the admin exits.
export const VIEW_AS_EXIT_PATH = "/admin/view-as/exit";
const ALLOWED_WHILE_VIEWING = new Set([VIEW_AS_EXIT_PATH, "/api/auth/sign-out"]);

/**
 * Whether a request must be refused while viewing as support. Server actions
 * and API routes both arrive as POST, so one method check covers every write.
 */
export function refusesWhileViewingAs(method: string, pathname: string) {
  if (!MUTATING_METHODS.has(method.toUpperCase())) {
    return false;
  }
  return !ALLOWED_WHILE_VIEWING.has(pathname);
}
