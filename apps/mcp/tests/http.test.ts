import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createNotaHttpApp } from "../src/http-app.js";

let api: Bun.Server;
let listener: Server;
let baseUrl: string;
const dir = mkdtempSync(join(tmpdir(), "nota-mcp-test-"));
const storeFile = join(dir, "oauth.enc");
const secret = randomBytes(32).toString("hex");
const revokedKeys = new Set<string>();

beforeAll(async () => {
  api = Bun.serve({
    port: 0,
    fetch(request) {
      const token = request.headers.get("authorization")?.replace("Bearer ", "");
      if (!token || !["nota_alpha", "nota_beta"].includes(token) || revokedKeys.has(token))
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      const name = token === "nota_alpha" ? "Alpha" : "Beta";
      if (new URL(request.url).pathname.endsWith("/me"))
        return Response.json({
          data: {
            org: { id: name, name },
            role: "owner",
            user: { id: name, name, email: `${name}@test.example` },
          },
        });
      return Response.json({
        data: [
          {
            id: name,
            number: name === "Alpha" ? "0000097" : "0000099",
            status: "draft",
            client: { name },
            total: "1000.00",
            currency: "EUR",
            issuedAt: "2026-10-01",
            dueAt: "2026-10-08",
          },
        ],
        pagination: { page: 1, perPage: 100, total: 1 },
      });
    },
  });
  // Allocate the port first so metadata advertises the actual HTTP test endpoint.
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port;
  await probe.stop();
  baseUrl = `http://127.0.0.1:${port}`;
  listener = createNotaHttpApp({
    notaUrl: `http://127.0.0.1:${api.port}`,
    publicUrl: baseUrl,
    secret,
    storeFile,
  }).listen(port, "127.0.0.1");
  await new Promise<void>((resolve) => listener.once("listening", resolve));
});
afterAll(async () => {
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  await api.stop();
  rmSync(dir, { recursive: true });
});

async function form(
  path: string,
  body: Record<string, string>,
  headers: Record<string, string> = {},
) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    body: new URLSearchParams(body),
    headers,
    redirect: "manual",
  });
}
async function connect(apiKey: string) {
  const registration = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Invoice test",
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(registration.status).toBe(201);
  const client = (await registration.json()) as { client_id: string };
  const verifier = randomBytes(32).toString("base64url");
  const params = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: "http://127.0.0.1/callback",
    response_type: "code",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: "invoice-test-state",
    scope: "nota",
    resource: `${baseUrl}/mcp`,
  });
  const authorization = await fetch(`${baseUrl}/authorize?${params}`);
  expect(authorization.status).toBe(200);
  expect(authorization.headers.get("content-security-policy")).toContain(
    "form-action 'self' http://127.0.0.1;",
  );
  const nonce = (await authorization.text()).match(/name="nonce" value="([^"]+)"/)?.[1];
  expect(nonce).toBeTruthy();
  const blocked = await form(
    "/connect",
    { nonce: nonce!, apiKey },
    { Origin: "https://evil.example" },
  );
  expect(blocked.status).toBe(403);
  const approval = await form("/connect", { nonce: nonce!, apiKey }, { Origin: baseUrl });
  expect(approval.status).toBe(303);
  const redirect = new URL(approval.headers.get("location")!);
  expect(redirect.searchParams.get("state")).toBe("invoice-test-state");
  const body = {
    client_id: client.client_id,
    grant_type: "authorization_code",
    code: redirect.searchParams.get("code")!,
    redirect_uri: "http://127.0.0.1/callback",
    code_verifier: verifier,
    resource: `${baseUrl}/mcp`,
  };
  const badPkce = await form("/token", { ...body, code_verifier: "incorrect-verifier" });
  expect(badPkce.status).toBe(400);
  const token = await form("/token", body);
  expect(token.status).toBe(200);
  expect((await form("/token", body)).status).toBe(400);
  return {
    ...((await token.json()) as { access_token: string; refresh_token: string }),
    clientId: client.client_id,
  };
}

test("remote OAuth provides discovery, PKCE, tenant isolation, refresh rotation, revocation, and encrypted persistence", async () => {
  const unauthorized = await fetch(`${baseUrl}/mcp`, { method: "POST" });
  expect(unauthorized.status).toBe(401);
  expect(unauthorized.headers.get("www-authenticate")).toContain("resource_metadata=");
  const metadata = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`);
  expect(((await metadata.json()) as { resource: string }).resource).toBe(`${baseUrl}/mcp`);
  const alpha = await connect("nota_alpha");
  const beta = await connect("nota_beta");
  for (const [connection, number] of [
    [alpha, "0000097"],
    [beta, "0000099"],
  ] as const) {
    const client = new Client({ name: "remote-test", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${connection.access_token}` } },
      }),
    );
    const invoices = await client.callTool({ name: "list_invoices", arguments: {} });
    expect(JSON.stringify(invoices.structuredContent)).toContain(number);
    const card = await client.readResource({ uri: "ui://nota/invoices.html" });
    expect(card.contents[0].mimeType).toBe("text/html;profile=mcp-app");
    await client.close();
  }
  expect(readFileSync(storeFile, "utf8")).not.toContain("nota_alpha");
  // Restart the server to prove the connection survives process replacement.
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  listener = createNotaHttpApp({
    notaUrl: `http://127.0.0.1:${api.port}`,
    publicUrl: baseUrl,
    secret,
    storeFile,
  }).listen(Number(new URL(baseUrl).port), "127.0.0.1");
  await new Promise<void>((resolve) => listener.once("listening", resolve));
  const refreshBody = {
    client_id: alpha.clientId,
    grant_type: "refresh_token",
    refresh_token: alpha.refresh_token,
    resource: `${baseUrl}/mcp`,
  };
  const refreshed = await form("/token", refreshBody);
  expect(refreshed.status).toBe(200);
  const rotated = (await refreshed.json()) as { access_token: string; refresh_token: string };
  expect((await form("/token", refreshBody)).status).toBe(400);
  const crossClient = await form("/token", {
    ...refreshBody,
    client_id: beta.clientId,
    refresh_token: rotated.refresh_token,
  });
  expect(crossClient.status).toBe(400);
  expect(
    (await form("/revoke", { client_id: alpha.clientId, token: rotated.refresh_token })).status,
  ).toBe(200);
  expect(
    (
      await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${rotated.access_token}` },
      })
    ).status,
  ).toBe(401);
  revokedKeys.add("nota_beta");
  expect(
    (
      await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${beta.access_token}` },
      })
    ).status,
  ).toBe(401);
});

test("consent rate limits distinguish client IPs behind one trusted proxy", async () => {
  const proxyListener = createNotaHttpApp({
    notaUrl: `http://127.0.0.1:${api.port}`,
    publicUrl: "http://127.0.0.1",
    secret,
    storeFile: join(dir, "proxy-oauth.enc"),
    trustProxyHops: 1,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => proxyListener.once("listening", resolve));
  const address = proxyListener.address() as { port: number };
  try {
    const request = (ip: string) => fetch(`http://127.0.0.1:${address.port}/connect`, {
      method: "POST",
      headers: { Origin: "http://127.0.0.1", "X-Forwarded-For": ip },
      body: new URLSearchParams({ nonce: "fixture", apiKey: "invalid" }),
    });
    for (let i = 0; i < 30; i++) expect((await request("192.0.2.1")).status).toBe(400);
    expect((await request("192.0.2.1")).status).toBe(429);
    expect((await request("192.0.2.2")).status).toBe(400);
  } finally {
    await new Promise<void>((resolve) => proxyListener.close(() => resolve()));
  }
});
