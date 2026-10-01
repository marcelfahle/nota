import { resolve } from "node:path";
import { createNotaHttpApp } from "./http-app.js";

const notaUrl = process.env.NOTA_URL;
const publicUrl = process.env.NOTA_MCP_PUBLIC_URL;
const secret = process.env.NOTA_OAUTH_SECRET;
if (!notaUrl || !publicUrl || !secret)
  throw new Error(
    "Set NOTA_URL, NOTA_MCP_PUBLIC_URL, and NOTA_OAUTH_SECRET. See apps/mcp/README.md.",
  );
const port = Number(process.env.PORT ?? "3100");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be between 1 and 65535.");
const app = createNotaHttpApp({
  notaUrl,
  publicUrl,
  secret,
  trustProxyHops: Number(process.env.NOTA_TRUST_PROXY_HOPS ?? "0"),
  storeFile: resolve(process.env.NOTA_OAUTH_STORE ?? ".nota/oauth.enc"),
});
const listener = app.listen(port, process.env.NOTA_MCP_HOST ?? "127.0.0.1", () => {
  console.error(`Nota MCP listening on port ${port}`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    listener.close();
  });
