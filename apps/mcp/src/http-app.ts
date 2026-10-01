import express from "express";
import { rateLimit } from "express-rate-limit";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import {
  mcpAuthRouter,
  getOAuthProtectedResourceMetadataUrl,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createRemoteNotaClient } from "./client.js";
import { NotaOAuthProvider } from "./oauth.js";
import { createNotaMcpServer } from "./server.js";

export function createNotaHttpApp(options: {
  notaUrl: string;
  publicUrl: string;
  storeFile: string;
  secret: string;
  trustProxyHops?: number;
}) {
  const trustProxyHops = options.trustProxyHops ?? 0;
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0)
    throw new Error("NOTA_TRUST_PROXY_HOPS must be a non-negative integer.");
  const issuer = new URL(options.publicUrl);
  if (issuer.pathname !== "/" || issuer.search || issuer.hash || issuer.username || issuer.password)
    throw new Error("NOTA_MCP_PUBLIC_URL must be an origin without a path or credentials.");
  if (
    issuer.protocol !== "https:" &&
    !(issuer.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(issuer.hostname))
  )
    throw new Error("Remote MCP requires HTTPS (localhost may use HTTP).");
  const resource = new URL("/mcp", issuer);
  const provider = new NotaOAuthProvider(
    options.notaUrl,
    resource,
    options.storeFile,
    options.secret,
  );
  const app = createMcpExpressApp({ host: "0.0.0.0", allowedHosts: [issuer.hostname] });
  app.set("trust proxy", trustProxyHops);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: issuer,
      resourceServerUrl: resource,
      resourceName: "Nota invoicing",
      scopesSupported: ["nota"],
    }),
  );
  app.post(
    "/connect",
    rateLimit({ windowMs: 900_000, limit: 30 }),
    express.urlencoded({ extended: false, limit: "8kb" }),
    async (req, res) => {
      if (req.headers.origin !== issuer.origin) {
        res.status(403).send("Connection must be approved on this server.");
        return;
      }
      const { nonce, apiKey } = req.body as Record<string, unknown>;
      if (typeof nonce !== "string" || typeof apiKey !== "string" || !apiKey.startsWith("nota_")) {
        res.status(400).send("Provide a Nota API key.");
        return;
      }
      try {
        res.redirect(303, await provider.approve(nonce, apiKey.trim()));
      } catch {
        res
          .status(400)
          .send(
            "Could not connect. Check your API key and start the connection again from your assistant.",
          );
      }
    },
  );
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use(
    "/mcp",
    (req, res, next) => {
      if (req.headers.origin && req.headers.origin !== issuer.origin) {
        res.status(403).send("Invalid Origin.");
        return;
      }
      next();
    },
    requireBearerAuth({
      verifier: provider,
      requiredScopes: ["nota"],
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resource),
    }),
  );
  app.post("/mcp", express.json({ limit: "1mb" }), async (req, res) => {
    const apiKey = req.auth?.extra?.apiKey;
    if (typeof apiKey !== "string") {
      res.sendStatus(401);
      return;
    }
    const server = createNotaMcpServer(createRemoteNotaClient(options.notaUrl, apiKey));
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent)
        res
          .status(500)
          .json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "MCP request failed" },
            id: null,
          });
    }
  });
  // Stateless HTTP has no long-lived notification stream or session to delete.
  app.all("/mcp", (_req, res) => {
    res.setHeader("Allow", "POST");
    res.sendStatus(405);
  });
  return app;
}
