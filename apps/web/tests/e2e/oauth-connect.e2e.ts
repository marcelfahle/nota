import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

// Real OAuth consent and browser CSP, using only local fixture credentials.
test("OAuth consent reaches the registered callback on another origin", async ({ page }) => {
  const servers: Array<Server> = [];
  const dir = await mkdtemp(join(tmpdir(), "nota-oauth-browser-"));
  async function listen(server: Server) {
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    return `http://127.0.0.1:${address.port}`;
  }
  try {
    const apiUrl = await listen(
      createServer((req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (
          req.url !== "/api/v1/me" ||
          req.headers.authorization !== "Bearer nota_browser_fixture"
        ) {
          res.writeHead(401).end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
        res.end(
          JSON.stringify({
            data: {
              org: { id: "fixture-org", name: "Fixture" },
              role: "owner",
              user: { email: "fixture@test.example", id: "fixture-user", name: "Fixture" },
            },
          }),
        );
      }),
    );
    let callbackMethod: string | undefined;
    const callbackUrl = `${await listen(
      createServer((req, res) => {
        callbackMethod = req.method;
        res.setHeader("Content-Type", "text/html");
        res.end("<h1>Connected to fixture</h1>");
      }),
    )}/callback`;
    const mcp = createServer();
    const publicUrl = await listen(mcp);
    // Use the actual bundled server rather than a mock of the consent page.
    const { createNotaHttpApp } = await import("../../../mcp/dist/http-app.js");
    mcp.on(
      "request",
      createNotaHttpApp({
        notaUrl: apiUrl,
        publicUrl,
        secret: randomBytes(32).toString("hex"),
        storeFile: join(dir, "oauth.enc"),
      }),
    );
    const registration = await page.request.post(`${publicUrl}/register`, {
      data: {
        client_name: "Browser fixture",
        grant_types: ["authorization_code"],
        redirect_uris: [callbackUrl],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
    });
    expect(registration.status()).toBe(201);
    const { client_id: clientId } = await registration.json();
    const verifier = randomBytes(32).toString("base64url");
    const params = new URLSearchParams({
      client_id: clientId,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      redirect_uri: callbackUrl,
      resource: `${publicUrl}/mcp`,
      response_type: "code",
      scope: "nota",
      state: "browser-state",
    });
    const cspErrors: Array<string> = [];
    page.on("console", (message) => {
      if (/Content Security Policy|form-action/i.test(message.text())) {
        cspErrors.push(message.text());
      }
    });
    await page.goto(`${publicUrl}/authorize?${params}`);
    await page.getByLabel("Nota API key").fill("nota_browser_fixture");
    await page.getByRole("button", { name: "Connect workspace" }).click();
    await expect(page.getByRole("heading", { name: "Connected to fixture" })).toBeVisible();
    const redirect = new URL(page.url());
    expect(redirect.origin).toBe(new URL(callbackUrl).origin);
    expect(redirect.searchParams.get("state")).toBe("browser-state");
    expect(redirect.searchParams.get("code")).toBeTruthy();
    expect(page.url()).not.toContain("nota_browser_fixture");
    expect(callbackMethod).toBe("GET");
    expect(cspErrors).toEqual([]);
  } finally {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
          }),
      ),
    );
    await rm(dir, { force: true, recursive: true });
  }
});
