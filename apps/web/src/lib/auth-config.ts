import { getBetterAuthEnv } from "@/lib/env";

// Read lazily so importing auth helpers never requires env (tests, scripts).

/** OAuth issuer for discovery and access tokens: the bare app origin. */
export function getAuthIssuer() {
  return new URL(getBetterAuthEnv().APP_URL).origin;
}

/** Canonical MCP resource. Access tokens are audience-bound to it. */
export function getMcpResource() {
  return getBetterAuthEnv().MCP_RESOURCE_URL ?? `${getAuthIssuer()}/mcp`;
}

/** CLI access tokens have a separate audience from MCP tokens. */
export function getApiResource() {
  return `${getAuthIssuer()}/api/v1`;
}
