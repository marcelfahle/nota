import { expect, test } from "bun:test";

import { getAuthIssuer, getMcpResource } from "@/lib/auth-config";

test("issuer is the bare app origin and the MCP resource defaults to /mcp on it", () => {
  expect(getAuthIssuer()).toBe(new URL(process.env.APP_URL!).origin);
  expect(getMcpResource()).toBe(`${new URL(process.env.APP_URL!).origin}/mcp`);
});
