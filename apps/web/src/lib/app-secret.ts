// The same secret Better Auth signs with (see better-auth.ts), read directly
// so signing a cookie never needs the rest of the auth config.
export function appSecret() {
  const value =
    process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET ?? process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("Set BETTER_AUTH_SECRET, AUTH_SECRET or SESSION_SECRET (32+ characters)");
  }
  return value;
}
