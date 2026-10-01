import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      // The canonical MCP URL is <host>/mcp (mcp.withnota.com/mcp in production).
      beforeFiles: [{ destination: "/api/mcp", source: "/mcp" }],
    };
  },
};

export default nextConfig;
