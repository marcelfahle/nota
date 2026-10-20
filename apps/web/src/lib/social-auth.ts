/** Shared configuration and input policy; no secrets are sent to the browser. */
export function googleCredentials(env: NodeJS.ProcessEnv = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google sign-in.");
  }
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function socialInviteToken(state: unknown): string | undefined {
  if (!state || typeof state !== "object" || !("inviteToken" in state)) {
    return undefined;
  }
  const token = state.inviteToken;
  return typeof token === "string" && token.length > 0 && token.length <= 512 ? token : undefined;
}

// Keep the framework's verified-email requirement explicit. Existing unverified
// password users connect Google from an authenticated Settings session instead.
export const accountLinkingPolicy = {
  allowDifferentEmails: false,
  enabled: true,
  requireLocalEmailVerified: true,
};

export function googleErrorMessage(code: string | null) {
  if (!code) {
    return null;
  }
  if (code === "account_not_linked") {
    return "Sign in with your password first, then connect Google in Settings → Account.";
  }
  if (code === "invite_invalid") {
    return "This invitation expired or is for a different email. Use the invited Google account or request a new link.";
  }
  if (code === "access_denied") {
    return "Google sign-in was cancelled. You can try again.";
  }
  return "Google sign-in could not be completed. Try again, or sign in with email and password.";
}
