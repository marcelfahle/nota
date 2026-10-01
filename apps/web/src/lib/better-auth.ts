import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { PasswordResetEmail } from "@/emails/password-reset";
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
import { getResend } from "@/lib/email";
import { getBetterAuthEnv, getEmailEnv } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";

const env = getBetterAuthEnv();
const appUrl = getAuthIssuer();

async function joinOrCreateWorkspace(user: { email: string; id: string; name: string }) {
  // An open invite for this email wins; otherwise the user gets their own workspace.
  const [invite] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.email, user.email.toLowerCase()),
        isNull(invites.acceptedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invites.createdAt))
    .limit(1);

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
      .values({ name: `${user.name}'s Workspace` })
      .returning({ id: orgs.id });
    await tx.insert(orgMembers).values({ orgId: org.id, role: "owner", userId: user.id });
  });
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
        after: async (user) => {
          await joinOrCreateWorkspace(user);
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
      await getResend().emails.send({
        from: getEmailEnv().RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
        react: PasswordResetEmail({ name: user.name, resetUrl: url }),
        subject: "Reset your nota password",
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
  secret: env.BETTER_AUTH_SECRET ?? env.SESSION_SECRET,
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
});

export type Auth = typeof auth;
