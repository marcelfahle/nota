import { withPostHogConfig } from "@posthog/nextjs-config";
import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp's shared libraries live in sibling packages that file tracing misses
  // under Bun's node_modules layout; without them the reader cannot load it.
  // Files only: a symlinked directory in the trace makes the deployment invalid.
  outputFileTracingIncludes: {
    "/api/onboarding/read": [
      "../../node_modules/.bun/@img+sharp-linux-x64@*/node_modules/@img/sharp-linux-x64/lib/*",
      "../../node_modules/.bun/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/lib/*.so*",
    ],
  },
  async rewrites() {
    return {
      // The canonical MCP URL is <host>/mcp (mcp.withnota.com/mcp in production).
      beforeFiles: [{ destination: "/api/mcp", source: "/mcp" }],
    };
  },
  serverExternalPackages: ["sharp"],
  // NextURL normalizes loopback literals even inside query values. OAuth redirect
  // URIs and signed consent queries must arrive byte-for-byte unchanged.
  skipProxyUrlNormalize: true,
};

// Runs during the actual Vercel/CI build so uploaded maps match deployed chunks.
// The personal key is build-only; never prefix it with NEXT_PUBLIC_.
const configuredNext = withBotId(nextConfig);
export default process.env.POSTHOG_API_KEY && process.env.POSTHOG_PROJECT_ID
  ? withPostHogConfig(configuredNext, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      personalApiKey: process.env.POSTHOG_API_KEY,
      projectId: process.env.POSTHOG_PROJECT_ID,
      sourcemaps: {
        deleteAfterUpload: true,
        enabled: true,
        releaseName: "nota-web",
      },
    })
  : configuredNext;
