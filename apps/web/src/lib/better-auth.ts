import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { and, eq, gt, isNull } from "drizzle-orm";

import { PasswordResetEmail } from "@/emails/password-reset";
import { VerificationEmail } from "@/emails/verification";
import { DEFAULT_FROM_EMAIL } from "@/lib/app-brand";
import { getAuthIssuer, getMcpResource } from "@/lib/auth-config";
import { db } from "@/lib/db";
import {
  accounts,
  invites,
  jwks,
  oauthAccessTokens,
  oauthClientAssertions,
  oauthClientResources,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  oauthResources,
  orgMembers,
  orgs,
  sessions,
  users,
  verifications,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { getBetterAuthEnv, getEmailEnv } from "@/lib/env";
import {
  cookieValueFromHeader,
  finishOnboarding,
  getOnboardingSession,
  orgValuesFromProfile,
} from "@/lib/onboarding-session";
import { hashPassword, verifyPassword } from "@/lib/password";

const env = getBetterAuthEnv();
const appUrl = getAuthIssuer();

/** The invite token from the sign-up body; the invite link is the proof of access. */
export function inviteTokenFrom(context: { body?: unknown } | null | undefined) {
  const body = context?.body;
  if (body && typeof body === "object" && "inviteToken" in body) {
    const token = body.inviteToken;
    return typeof token === "string" && token.length > 0 ? token : undefined;
  }
  return undefined;
}

async function findInviteFor(email: string, token: string) {
  const [invite] = await db
    .select()
    .from(invites)
    .where(
      and(eq(invites.token, token), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())),
    )
    .limit(1);
  return invite && invite.email === email.toLowerCase() ? invite : null;
}

/** The onboarding cookie from the sign-up request, if the visitor read their site first. */
function onboardingCookieFrom(context: unknown) {
  const candidate = context as {
    headers?: Headers;
    request?: { headers?: Headers };
  } | null;
  const headers = candidate?.headers ?? candidate?.request?.headers;
  return cookieValueFromHeader(headers?.get?.("cookie"));
}

async function joinOrCreateWorkspace(
  user: { email: string; id: string; name: string },
  inviteToken?: string,
  onboardingCookie?: string | null,
) {
  const invite = inviteToken ? await findInviteFor(user.email, inviteToken) : null;
  // The website read is saved to an account here and nowhere else.
  const onboarding = invite ? null : await getOnboardingSession(onboardingCookie);
  const profile = onboarding?.profile ?? null;
  let orgId: string | null = null;

  await db.transaction(async (tx) => {
    if (invite) {
      await tx
        .insert(orgMembers)
        .values({ orgId: invite.orgId, role: invite.role, userId: user.id });
      await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
      return;
    }

    const [org] = await tx
      .insert(orgs)
      .values({
        ...(profile ? orgValuesFromProfile(profile) : {}),
        firstRunCompletedAt: null,
        name: profile?.fields.name?.value ?? `${user.name}'s Workspace`,
      })
      .returning({ id: orgs.id });
    await tx.insert(orgMembers).values({ orgId: org.id, role: "owner", userId: user.id });
    orgId = org.id;
  });

  if (onboarding && profile && orgId) {
    try {
      await finishOnboarding(onboarding.id, orgId, profile);
    } catch {
      // The account exists; a logo that failed to move is fixable in Settings.
    }
  }
}

export const auth = betterAuth({
  advanced: {
    database: { generateId: "uuid" },
  },
  appName: "Nota",
  baseURL: appUrl,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      account: accounts,
      jwks,
      oauthAccessToken: oauthAccessTokens,
      oauthClient: oauthClients,
      oauthClientAssertion: oauthClientAssertions,
      oauthClientResource: oauthClientResources,
      oauthConsent: oauthConsents,
      oauthRefreshToken: oauthRefreshTokens,
      oauthResource: oauthResources,
      session: sessions,
      user: users,
      verification: verifications,
    },
  }),
  databaseHooks: {
    user: {
      create: {
        after: async (user, context) => {
          await joinOrCreateWorkspace(
            user,
            inviteTokenFrom(context),
            onboardingCookieFrom(context),
          );
        },
        // Reject a bad invite before the account exists, as the old sign-up did.
        before: async (user, context) => {
          const token = inviteTokenFrom(context);
          if (token && !(await findInviteFor(user.email, token))) {
            throw new APIError("BAD_REQUEST", {
              message: "This invite link is invalid, expired, or for a different email.",
            });
          }
        },
      },
    },
  },
  // The OAuth provider owns /oauth2/token; the JWT plugin's /token would clash.
  disabledPaths: ["/token"],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Keep the existing scrypt format so current passwords keep working.
    password: {
      hash: hashPassword,
      verify: ({ hash, password }) => verifyPassword(password, hash),
    },
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ url, user }) => {
      await sendEmail({
        from: getEmailEnv().EMAIL_FROM ?? DEFAULT_FROM_EMAIL,
        react: PasswordResetEmail({ name: user.name, resetUrl: url }),
        subject: "Reset your nota password",
        to: [user.email],
      });
    },
  },
  emailVerification: {
    expiresIn: 60 * 60,
    sendOnSignUp: false,
    sendVerificationEmail: async ({ url, user }) => {
      await sendEmail({
        from: getEmailEnv().EMAIL_FROM ?? DEFAULT_FROM_EMAIL,
        react: VerificationEmail({ name: user.name, verificationUrl: url }),
        subject: "Confirm your email to send invoices",
        to: [user.email],
      });
    },
  },
  plugins: [
    jwt({ jwt: { issuer: appUrl } }),
    mcp({
      // ChatGPT and Claude register themselves (RFC 7591). CIMD covers newer clients.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      consentPage: "/oauth/consent",
      loginPage: "/login",
      resource: getMcpResource(),
      signup: { page: "/register" },
    }),
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
    nextCookies(),
  ],
  secret: env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET ?? env.SESSION_SECRET,
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
});

export type Auth = typeof auth;
