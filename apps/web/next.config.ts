import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp's shared libraries live in sibling packages that file tracing misses
  // under Bun's node_modules layout; without them the reader cannot load it.
  outputFileTracingIncludes: {
    "/api/onboarding/read": [
      "../../node_modules/.bun/@img+sharp-linux-x64@*/node_modules/@img/**/*",
      "../../node_modules/.bun/@img+sharp-libvips-linux-x64@*/node_modules/@img/**/*",
    ],
  },
  async rewrites() {
    return {
      // The canonical MCP URL is <host>/mcp (mcp.withnota.com/mcp in production).
      beforeFiles: [{ destination: "/api/mcp", source: "/mcp" }],
    };
  },
  serverExternalPackages: ["sharp"],
};

export default withBotId(nextConfig);
