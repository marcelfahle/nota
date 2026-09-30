import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  InvalidGrantError,
  InvalidRequestError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createRemoteNotaClient } from "./client.js";

const randomToken = () => randomBytes(32).toString("base64url");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const now = () => Math.floor(Date.now() / 1000);
type Grant = {
  apiKey: string;
  clientId: string;
  expiresAt: number;
  family: string;
  scopes: string[];
};
type Code = Grant & { challenge: string; redirectUri: string };
type State = {
  clients: Record<string, OAuthClientInformationFull>;
  codes: Record<string, Code>;
  access: Record<string, Grant>;
  refresh: Record<string, Grant>;
};

// Encrypted, atomic, single-process storage. Run one instance with a persistent volume.
class OAuthStore {
  readonly state: State;
  private readonly key: Buffer;
  constructor(
    private readonly filename: string,
    secret: string,
  ) {
    if (!/^[a-f\d]{64}$/i.test(secret))
      throw new Error("NOTA_OAUTH_SECRET must be 32 random bytes encoded as 64 hex characters.");
    this.key = Buffer.from(secret, "hex");
    if (existsSync(filename)) {
      const encrypted = Buffer.from(readFileSync(filename, "utf8"), "base64");
      const decipher = createDecipheriv("aes-256-gcm", this.key, encrypted.subarray(0, 12));
      decipher.setAuthTag(encrypted.subarray(12, 28));
      this.state = JSON.parse(
        Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString("utf8"),
      ) as State;
    } else this.state = { clients: {}, codes: {}, access: {}, refresh: {} };
  }
  save() {
    for (const records of [this.state.codes, this.state.access, this.state.refresh]) {
      for (const [key, grant] of Object.entries(records))
        if (grant.expiresAt <= now()) delete records[key];
    }
    mkdirSync(dirname(this.filename), { recursive: true, mode: 0o700 });
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(this.state)), cipher.final()]);
    writeFileSync(
      `${this.filename}.tmp`,
      Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64"),
      { mode: 0o600 },
    );
    renameSync(`${this.filename}.tmp`, this.filename);
  }
}

export function escapeHtml(value: string) {
  return value.replaceAll(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}

export class NotaOAuthProvider implements OAuthServerProvider {
  private readonly store: OAuthStore;
  private readonly pending = new Map<
    string,
    { client: OAuthClientInformationFull; params: AuthorizationParams; expiresAt: number }
  >();
  readonly clientsStore;

  constructor(
    private readonly notaUrl: string,
    private readonly resourceUrl: URL,
    filename: string,
    secret: string,
  ) {
    this.store = new OAuthStore(filename, secret);
    this.clientsStore = {
      getClient: (clientId: string) =>
        Object.hasOwn(this.store.state.clients, clientId)
          ? this.store.state.clients[clientId]
          : undefined,
      registerClient: async (
        client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
      ) => {
        if (Object.keys(this.store.state.clients).length >= 10_000)
          throw new InvalidRequestError("Client registration capacity reached.");
        const registered = { ...client, client_id: randomToken(), client_id_issued_at: now() };
        this.store.state.clients[registered.client_id] = registered;
        this.store.save();
        return registered;
      },
    };
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    this.checkResource(params.resource);
    if (params.scopes?.some((scope) => scope !== "nota"))
      throw new InvalidRequestError("Unsupported scope.");
    for (const [key, entry] of this.pending) if (entry.expiresAt <= now()) this.pending.delete(key);
    if (this.pending.size >= 1000) throw new InvalidRequestError("Too many pending connections.");
    const nonce = randomToken();
    this.pending.set(nonce, { client, params, expiresAt: now() + 600 });
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    res.setHeader("Referrer-Policy", "no-referrer");
    res
      .type("html")
      .send(
        `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Nota</title><style>body{font:16px/1.6 system-ui;background:#f7f7f3;color:#19191b;padding:32px}main{max-width:440px;margin:8vh auto}h1{letter-spacing:-.04em}label{display:block;font-weight:600}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;margin:8px 0 16px}button{padding:12px 18px;background:#19191b;color:white;border:0;border-radius:8px;font:inherit}small{color:#62626e}a{color:#126d58}</style><main><h1>Connect your billing.</h1><p><strong>${escapeHtml(client.client_name ?? "This AI assistant")}</strong> is requesting access to your Nota workspace.</p><p>It can read clients and invoices, create drafts, and perform invoice actions within your existing role. Sending an invoice emails your customer; marking paid records a payment rather than charging one.</p><form method="post" action="/connect"><input type="hidden" name="nonce" value="${nonce}"><label for="api-key">Nota API key</label><input id="api-key" type="password" name="apiKey" placeholder="nota_…" required autocomplete="off"><button>Connect workspace</button></form><p><small>Create a dedicated key in <a href="${escapeHtml(new URL("/settings", this.notaUrl).href)}" target="_blank" rel="noopener noreferrer">Nota Settings → API Keys</a>. Delete that key in Nota to revoke access. Your key is stored encrypted on this MCP server and never sent to the assistant.</small></p></main></html>`,
      );
  }

  async approve(nonce: string, apiKey: string) {
    const pending = this.pending.get(nonce);
    if (!pending || pending.expiresAt <= now())
      throw new InvalidRequestError("Connection expired. Start again in your AI assistant.");
    await createRemoteNotaClient(this.notaUrl, apiKey).getMe();
    // Consume only after successful authentication; prevent replay after the network await.
    if (!this.pending.delete(nonce)) throw new InvalidRequestError("Connection already approved.");
    const code = randomToken();
    this.store.state.codes[hash(code)] = {
      apiKey,
      clientId: pending.client.client_id,
      expiresAt: now() + 120,
      family: randomToken(),
      scopes: ["nota"],
      challenge: pending.params.codeChallenge,
      redirectUri: pending.params.redirectUri,
    };
    this.store.save();
    const redirect = new URL(pending.params.redirectUri);
    redirect.searchParams.set("code", code);
    if (pending.params.state !== undefined)
      redirect.searchParams.set("state", pending.params.state);
    return redirect.href;
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string) {
    return this.getCode(client.client_id, code).challenge;
  }
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.checkResource(resource);
    const grant = this.getCode(client.client_id, code);
    if (redirectUri !== grant.redirectUri)
      throw new InvalidGrantError("Redirect URI does not match.");
    delete this.store.state.codes[hash(code)];
    return this.issue(grant);
  }
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    token: string,
    scopes?: string[],
    resource?: URL,
  ) {
    this.checkResource(resource);
    const grant = this.store.state.refresh[hash(token)];
    if (!grant || grant.clientId !== client.client_id || grant.expiresAt <= now())
      throw new InvalidGrantError("Invalid refresh token.");
    if (scopes?.some((scope) => !grant.scopes.includes(scope)))
      throw new InvalidGrantError("Scope cannot be expanded.");
    await createRemoteNotaClient(this.notaUrl, grant.apiKey).getMe();
    if (!this.store.state.refresh[hash(token)])
      throw new InvalidGrantError("Refresh token already used.");
    delete this.store.state.refresh[hash(token)];
    return this.issue({ ...grant, scopes: scopes ?? grant.scopes });
  }
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const grant = this.store.state.access[hash(token)];
    if (!grant || grant.expiresAt <= now())
      throw new InvalidTokenError("Connection expired or revoked.");
    // Revalidate on every request so key deletion or membership removal takes effect immediately.
    try {
      await createRemoteNotaClient(this.notaUrl, grant.apiKey).getMe();
    } catch {
      throw new InvalidTokenError("Nota authorization is no longer valid.");
    }
    return {
      token,
      clientId: grant.clientId,
      scopes: grant.scopes,
      expiresAt: grant.expiresAt,
      resource: this.resourceUrl,
      extra: { apiKey: grant.apiKey },
    };
  }
  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest) {
    const key = hash(request.token);
    const grant = this.store.state.access[key] ?? this.store.state.refresh[key];
    if (!grant || grant.clientId !== client.client_id) return;
    for (const records of [this.store.state.access, this.store.state.refresh]) {
      for (const [id, entry] of Object.entries(records))
        if (entry.family === grant.family) delete records[id];
    }
    this.store.save();
  }
  private getCode(clientId: string, code: string) {
    const grant = this.store.state.codes[hash(code)];
    if (!grant || grant.expiresAt <= now() || grant.clientId !== clientId)
      throw new InvalidGrantError("Invalid or expired authorization code.");
    return grant;
  }
  private checkResource(resource?: URL) {
    if (resource && resource.href !== this.resourceUrl.href)
      throw new InvalidRequestError("Resource does not match this Nota server.");
  }
  private issue(grant: Grant): OAuthTokens {
    const access = randomToken();
    const refresh = randomToken();
    this.store.state.access[hash(access)] = { ...grant, expiresAt: now() + 3600 };
    this.store.state.refresh[hash(refresh)] = { ...grant, expiresAt: now() + 30 * 86400 };
    this.store.save();
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: 3600,
      scope: grant.scopes.join(" "),
    };
  }
}
