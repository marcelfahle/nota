import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

export type OAuthSession = {
  issuer: string;
  clientId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export function normalizeIssuer(value: string): string {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("Use a Nota HTTPS origin, or an HTTP localhost origin for development.");
  }
  return url.origin;
}

async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_grant")
      throw new Error("Your Nota session expired or was revoked. Run 'nota login' again.");
    throw new Error(
      `Nota authentication failed (HTTP ${response.status}). Try 'nota login' again.`,
    );
  }
  return response.json() as Promise<Record<string, unknown>>;
}

export async function discover(issuer: string) {
  issuer = normalizeIssuer(issuer);
  const metadata = await requestJson(`${issuer}/.well-known/oauth-authorization-server`);
  if (
    metadata.issuer !== issuer ||
    !Array.isArray(metadata.code_challenge_methods_supported) ||
    !metadata.code_challenge_methods_supported.includes("S256")
  ) {
    throw new Error("This Nota server does not support secure browser login.");
  }
  const endpoint = (key: string) => {
    const value = metadata[key];
    if (typeof value !== "string") throw new Error(`Nota server is missing ${key}.`);
    const url = new URL(value);
    if (url.origin !== issuer || url.username || url.password || url.hash) {
      throw new Error("Nota returned an authentication endpoint on another origin.");
    }
    return url.href;
  };
  return {
    authorize: endpoint("authorization_endpoint"),
    register: endpoint("registration_endpoint"),
    token: endpoint("token_endpoint"),
    revoke: endpoint("revocation_endpoint"),
  };
}

function sessionFrom(
  body: Record<string, unknown>,
  issuer: string,
  clientId: string,
  previousRefresh?: string,
): OAuthSession {
  const refreshToken = body.refresh_token ?? previousRefresh;
  if (
    typeof body.access_token !== "string" ||
    !body.access_token ||
    typeof refreshToken !== "string" ||
    !refreshToken ||
    typeof body.token_type !== "string" ||
    body.token_type.toLowerCase() !== "bearer" ||
    typeof body.expires_in !== "number" ||
    !Number.isFinite(body.expires_in) ||
    body.expires_in <= 0
  ) {
    throw new Error("Nota returned an incomplete login session. Run 'nota login' again.");
  }
  return {
    issuer,
    clientId,
    accessToken: body.access_token,
    refreshToken,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}

export async function refreshSession(session: OAuthSession) {
  const endpoints = await discover(session.issuer);
  const body = await requestJson(endpoints.token, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: session.clientId,
      refresh_token: session.refreshToken,
      resource: `${session.issuer}/api/v1`,
    }),
  });
  return sessionFrom(body, session.issuer, session.clientId, session.refreshToken);
}

export async function revokeSession(session: OAuthSession) {
  const endpoints = await discover(session.issuer);
  const response = await fetch(endpoints.revoke, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({
      token: session.refreshToken,
      token_type_hint: "refresh_token",
      client_id: session.clientId,
    }),
  });
  if (!response.ok) throw new Error("The server could not revoke this connection.");
}

export async function disconnectSession(session: OAuthSession) {
  // An expired session can still be refreshed to authenticate its revocation.
  if (session.expiresAt <= Date.now() + 5_000) session = await refreshSession(session);
  const response = await fetch(`${normalizeIssuer(session.issuer)}/api/v1/auth/session`, {
    method: "DELETE",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${session.accessToken}`, "User-Agent": "nota-cli" },
  });
  if (!response.ok) {
    // Best effort: at least stop refresh if the new API endpoint is unavailable.
    await revokeSession(session);
    throw new Error("Disconnect this client in Settings to invalidate existing access tokens.");
  }
}

export async function openBrowser(url: string): Promise<boolean> {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  return new Promise((resolve) => {
    const child = spawn(command as string, args as string[], { stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}

/** A native public client: no client secret, PKCE, and a loopback-only callback. */
export async function browserLogin(
  issuer: string,
  options: {
    onAuthorize: (url: string) => Promise<void>;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<OAuthSession> {
  issuer = normalizeIssuer(issuer);
  const endpoints = await discover(issuer);
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");
  let redirectUri = "";
  let finish!: (code: string) => void;
  let fail!: (error: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  // Install rejection handling before registration/browser launch can await.
  void codePromise.catch(() => {});
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    );
    if (
      request.method !== "GET" ||
      url.pathname !== "/callback" ||
      request.headers.host !== new URL(redirectUri).host ||
      url.searchParams.get("state") !== state ||
      (url.searchParams.has("iss") && url.searchParams.get("iss") !== issuer)
    ) {
      response.writeHead(400).end("Invalid login callback.");
      return;
    }
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      `<!doctype html><html><head><title>Nota</title><meta name="viewport" content="width=device-width"><style>body{background:#faf9f6;color:#25251f;font:18px system-ui;margin:15vh auto;max-width:480px;padding:24px}small{color:#777}h1{font-weight:500;letter-spacing:-1px}</style></head><body><small>nota / cli</small><h1>${error || !code ? "Sign-in cancelled." : "You can return to your terminal."}</h1><p>${error || !code ? "Run nota login to try again." : "Nota is finishing your connection. You can close this tab."}</p></body></html>`,
    );
    if (error || !code) fail(new Error("Sign-in was cancelled. Run 'nota login' to try again."));
    else finish(code);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => fail(new Error("Sign-in cancelled."));
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Cannot open the local login callback.");
    redirectUri = `http://127.0.0.1:${address.port}/callback`;
    options.signal?.throwIfAborted();
    options.signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(
      () => fail(new Error("Sign-in timed out. Run 'nota login' to try again.")),
      options.timeoutMs ?? 300_000,
    );
    const registration = await requestJson(endpoints.register, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Nota CLI",
        application_type: "native",
        token_endpoint_auth_method: "none",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "openid profile email offline_access",
        resources: [`${issuer}/api/v1`],
      }),
    });
    if (typeof registration.client_id !== "string" || !registration.client_id)
      throw new Error("Nota could not register this CLI.");
    options.signal?.throwIfAborted();
    const authorization = new URL(endpoints.authorize);
    authorization.search = new URLSearchParams({
      response_type: "code",
      client_id: registration.client_id,
      redirect_uri: redirectUri,
      scope: "openid profile email offline_access",
      resource: `${issuer}/api/v1`,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    await options.onAuthorize(authorization.href);
    const code = await codePromise;
    const body = await requestJson(endpoints.token, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: registration.client_id,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource: `${issuer}/api/v1`,
      }),
    });
    return sessionFrom(body, issuer, registration.client_id);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    server.closeAllConnections();
    server.close();
  }
}
