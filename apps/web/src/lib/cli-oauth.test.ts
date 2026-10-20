import { expect, test } from "bun:test";

import { mcp } from "@better-auth/mcp";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { verifyBearerToken } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins";

import { browserLogin, refreshSession, revokeSession } from "../../../cli/src/oauth";

const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

test("CLI resumes through Google sign-in, completes PKCE, refreshes, and revokes", async () => {
  const database: Record<string, Array<Record<string, unknown>>> = {
    account: [],
    jwks: [],
    oauthAccessToken: [],
    oauthClient: [],
    oauthClientAssertion: [],
    oauthClientResource: [],
    oauthConsent: [],
    oauthRefreshToken: [],
    oauthResource: [],
    session: [],
    user: [],
    verification: [],
  };
  const server = Bun.serve({
    fetch: (request) => handler(request),
    hostname: "127.0.0.1",
    port: 0,
  });
  const issuer = `http://127.0.0.1:${server.port}`;
  const auth = betterAuth({
    baseURL: issuer,
    database: memoryAdapter(database),
    disabledPaths: ["/token"],
    emailAndPassword: { enabled: true },
    plugins: [
      jwt({ jwt: { issuer } }),
      mcp({
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationAllowedResources: [`${issuer}/mcp`, `${issuer}/api/v1`],
        consentPage: "/oauth/consent",
        loginPage: "/login",
        resource: `${issuer}/mcp`,
        resources: [`${issuer}/api/v1`],
      }),
    ],
    secret: "nota-test-secret-which-is-at-least-32-chars",
    socialProviders: { google: { clientId: "fixture", clientSecret: "fixture" } },
  });
  const handler = (request: Request) =>
    new URL(request.url).pathname === "/.well-known/oauth-authorization-server"
      ? oauthProviderAuthServerMetadata(auth)(request)
      : auth.handler(request);
  try {
    const provider = (await auth.$context).socialProviders.find((item) => item.id === "google")!;
    provider.validateAuthorizationCode = async () => ({ accessToken: "fixture-google" });
    provider.getUserInfo = async () => ({
      data: { sub: "google-cli" },
      user: { email: "cli@test.example", emailVerified: true, id: "google-cli", name: "CLI User" },
    });

    const session = await browserLogin(issuer, {
      onAuthorize: async (url) => {
        const authorization = new URL(url);
        expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
        expect(authorization.searchParams.get("resource")).toBe(`${issuer}/api/v1`);
        const response = await fetch(url, { redirect: "manual" });
        const loginUrl = new URL(response.headers.get("location")!, issuer);
        expect(loginUrl.pathname).toBe("/login");
        const social = await fetch(`${issuer}/api/auth/sign-in/social`, {
          body: JSON.stringify({
            callbackURL: "/home",
            oauth_query: loginUrl.search.slice(1),
            provider: "google",
          }),
          headers: { "Content-Type": "application/json", origin: issuer },
          method: "POST",
        });
        const socialData = (await social.json()) as { url: string };
        const googleState = new URL(socialData.url).searchParams.get("state")!;
        const callbackResponse = await fetch(
          `${issuer}/api/auth/callback/google?code=fixture&state=${encodeURIComponent(googleState)}`,
          { headers: { accept: "text/html", cookie: cookies(social) }, redirect: "manual" },
        );
        const cookie = cookies(callbackResponse);
        const consentUrl = new URL(callbackResponse.headers.get("location")!, issuer);
        expect(consentUrl.pathname).toBe("/oauth/consent");
        const consent = await fetch(`${issuer}/api/auth/oauth2/consent`, {
          body: JSON.stringify({ accept: true, oauth_query: consentUrl.search.slice(1) }),
          headers: { "Content-Type": "application/json", cookie, origin: issuer },
          method: "POST",
          redirect: "manual",
        });
        const data = (await consent.json()) as { url: string };
        expect(consent.status).toBe(200);
        expect(data.url).toBeString();
        const callback = await fetch(data.url);
        expect(callback.status).toBe(200);
        expect(callback.headers.get("referrer-policy")).toBe("no-referrer");
      },
    });
    expect(session.clientId).toBeTruthy();
    const claims = JSON.parse(
      Buffer.from(session.accessToken.split(".")[1], "base64url").toString(),
    );
    expect(claims.aud).toContain(`${issuer}/api/v1`);
    expect(claims.aud).not.toContain(`${issuer}/mcp`);
    expect(claims.iss).toBe(issuer);
    expect(claims.client_id).toBe(session.clientId);
    const verification = {
      jwksUrl: `${issuer}/api/auth/jwks`,
      verifyOptions: { audience: `${issuer}/api/v1`, issuer },
    };
    expect((await verifyBearerToken(session.accessToken, verification)).sub).toBe(claims.sub);
    await expect(
      verifyBearerToken(session.accessToken, {
        ...verification,
        verifyOptions: { audience: `${issuer}/mcp`, issuer },
      }),
    ).rejects.toThrow();
    const refreshed = await refreshSession(session);
    expect(refreshed.refreshToken).not.toBe(session.refreshToken);
    await revokeSession(refreshed);
    await expect(refreshSession(refreshed)).rejects.toThrow("expired or was revoked");
  } finally {
    server.stop(true);
  }
}, 20_000);
