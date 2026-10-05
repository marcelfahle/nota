import { expect, test } from "bun:test";

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getOAuthState } from "better-auth/api";

import { accountLinkingPolicy, googleCredentials, socialInviteToken } from "./social-auth";

const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

test("Google stays disabled without credentials and rejects half-configured environments", () => {
  expect(googleCredentials({})).toBeNull();
  expect(() => googleCredentials({ GOOGLE_CLIENT_ID: "id" })).toThrow();
  expect(() => googleCredentials({ GOOGLE_CLIENT_SECRET: "secret" })).toThrow();
  expect(googleCredentials({ GOOGLE_CLIENT_ID: " id ", GOOGLE_CLIENT_SECRET: " secret " })).toEqual(
    { clientId: "id", clientSecret: "secret" },
  );
});

async function googleFixture() {
  const data: Record<string, Array<Record<string, unknown>>> = {
    account: [],
    session: [],
    user: [],
    verification: [],
  };
  const invites: Array<string> = [];
  const auth = betterAuth({
    account: { accountLinking: accountLinkingPolicy },
    baseURL: "http://localhost:3999",
    database: memoryAdapter(data),
    databaseHooks: {
      user: {
        create: {
          after: async () => {
            const token = socialInviteToken(await getOAuthState());
            if (token) {
              invites.push(token);
            }
          },
        },
      },
    },
    emailAndPassword: { enabled: true },
    secret: "nota-test-secret-which-is-at-least-32-chars",
    socialProviders: { google: { clientId: "fixture", clientSecret: "fixture" } },
  });
  // Replace only the upstream Google exchange; run Better Auth's actual state,
  // callback, cookie, account-linking, and user hook implementation.
  const provider = (await auth.$context).socialProviders.find((item) => item.id === "google")!;
  provider.validateAuthorizationCode = async () => ({ accessToken: "fixture-upstream" });
  provider.getUserInfo = async () => ({
    data: { sub: "google-user" },
    user: {
      email: "google@test.example",
      emailVerified: true,
      id: "google-user",
      name: "Google User",
    },
  });
  const post = (path: string, body: unknown, cookie = "") =>
    auth.handler(
      new Request(`http://localhost:3999/api/auth/${path}`, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json", cookie, origin: "http://localhost:3999" },
        method: "POST",
      }),
    );

  async function google(linkCookie?: string) {
    const start = await post(
      linkCookie ? "link-social" : "sign-in/social",
      {
        additionalData: { inviteToken: "invitation-proof" },
        callbackURL: "/home",
        errorCallbackURL: "/login",
        provider: "google",
      },
      linkCookie,
    );
    const { url } = (await start.json()) as { url: string };
    expect(start.status).toBe(200);
    const state = new URL(url).searchParams.get("state")!;
    return auth.handler(
      new Request(
        `http://localhost:3999/api/auth/callback/google?code=fixture&state=${encodeURIComponent(state)}`,
        { headers: { accept: "text/html", cookie: cookies(start) } },
      ),
    );
  }
  return { auth, cookies, data, google, invites, post };
}

test("new Google signup carries the invite through protected OAuth state to provisioning", async () => {
  const f = await googleFixture();
  const result = await f.google();
  expect(result.headers.get("location")).toBe("/home");
  expect(f.data.user).toHaveLength(1);
  expect(f.data.account[0].providerId).toBe("google");
  expect(f.invites).toEqual(["invitation-proof"]);
});

test("Google cannot silently take over an unverified password account; signed-in linking works", async () => {
  const f = await googleFixture();
  const signup = await f.post("sign-up/email", {
    email: "google@test.example",
    name: "Password user",
    password: "fixture-password-123",
  });
  expect(signup.status).toBe(200);
  const implicit = await f.google();
  expect(
    new URL(implicit.headers.get("location")!, "http://localhost:3999").searchParams.get("error"),
  ).toBe("account_not_linked");
  expect(f.data.user).toHaveLength(1);
  expect(f.data.account).toHaveLength(1);
  const linked = await f.google(f.cookies(signup));
  expect(linked.headers.get("location")).toBe("/home");
  expect(f.data.user).toHaveLength(1);
  expect(f.data.account).toHaveLength(2);
});
