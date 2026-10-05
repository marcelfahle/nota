import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { browserLogin, discover, normalizeIssuer } from "../src/oauth";

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});
function fixture() {
  let issuer = "";
  let redirect = "";
  let challenge = "";
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/.well-known/oauth-authorization-server")
        return Response.json({
          issuer,
          code_challenge_methods_supported: ["S256"],
          authorization_endpoint: `${issuer}/authorize`,
          registration_endpoint: `${issuer}/register`,
          token_endpoint: `${issuer}/token`,
          revocation_endpoint: `${issuer}/revoke`,
        });
      if (url.pathname === "/register") {
        const data = (await request.json()) as any;
        expect(data.application_type).toBe("native");
        expect(data.token_endpoint_auth_method).toBe("none");
        redirect = data.redirect_uris[0];
        expect(new URL(redirect).hostname).toBe("127.0.0.1");
        return Response.json({ client_id: "test-client" });
      }
      if (url.pathname === "/token") {
        const data = new URLSearchParams(await request.text());
        expect(data.get("redirect_uri")).toBe(redirect);
        expect(createHash("sha256").update(data.get("code_verifier")!).digest("base64url")).toBe(
          challenge,
        );
        expect(data.get("code")).toBe("one-time-code");
        return Response.json({
          access_token: "secret-access",
          refresh_token: "secret-refresh",
          token_type: "Bearer",
          expires_in: 3600,
        });
      }
      return new Response(null, { status: 404 });
    },
  });
  servers.push(server);
  issuer = `http://127.0.0.1:${server.port}`;
  return {
    issuer,
    callback(authorization: string) {
      const auth = new URL(authorization);
      challenge = auth.searchParams.get("code_challenge")!;
      const callback = new URL(redirect);
      callback.searchParams.set("code", "one-time-code");
      callback.searchParams.set("state", auth.searchParams.get("state")!);
      return callback;
    },
  };
}

test("PKCE callback ignores forged state, mismatched issuer, and wrong method", async () => {
  const f = fixture();
  const result = await browserLogin(f.issuer, {
    onAuthorize: async (url) => {
      expect(url).not.toContain("secret");
      const callback = f.callback(url);
      const forged = new URL(callback);
      forged.searchParams.set("state", "forged");
      expect((await fetch(forged)).status).toBe(400);
      forged.searchParams.set("state", callback.searchParams.get("state")!);
      forged.searchParams.set("iss", "https://other.example");
      expect((await fetch(forged)).status).toBe(400);
      expect((await fetch(callback, { method: "POST" })).status).toBe(400);
      const success = await fetch(callback);
      expect(success.headers.get("cache-control")).toBe("no-store");
      expect(await success.text()).not.toContain("one-time-code");
    },
  });
  expect(result.accessToken).toBe("secret-access");
});

test("denial closes callback server and does not exchange a token", async () => {
  const f = fixture();
  let callback: URL;
  await expect(
    browserLogin(f.issuer, {
      onAuthorize: async (url) => {
        callback = f.callback(url);
        callback.searchParams.set("error", "access_denied");
        await fetch(callback);
      },
    }),
  ).rejects.toThrow("cancelled");
  await expect(fetch(callback!)).rejects.toThrow();
});

test("timeout and cancellation close the callback server", async () => {
  const f = fixture();
  await expect(
    browserLogin(f.issuer, { onAuthorize: async () => {}, timeoutMs: 20 }),
  ).rejects.toThrow("timed out");
  const controller = new AbortController();
  await expect(
    browserLogin(f.issuer, {
      onAuthorize: async () => {
        controller.abort();
      },
      signal: controller.signal,
    }),
  ).rejects.toThrow("cancelled");
});

test("rejects unsafe origins and cross-origin token endpoints", async () => {
  for (const url of [
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com?token=x",
  ])
    expect(() => normalizeIssuer(url)).toThrow();
  expect(normalizeIssuer("https://app.withnota.com/")).toBe("https://app.withnota.com");
  let issuer = "";
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch() {
      return Response.json({
        issuer,
        code_challenge_methods_supported: ["S256"],
        authorization_endpoint: `${issuer}/authorize`,
        registration_endpoint: `${issuer}/register`,
        token_endpoint: "https://attacker.example/token",
      });
    },
  });
  servers.push(server);
  issuer = `http://127.0.0.1:${server.port}`;
  await expect(discover(issuer)).rejects.toThrow("another origin");
});
