import { auth } from "@/lib/better-auth";

// RFC 9728 metadata for the MCP resource; served by the mcp() plugin.
export const GET = (request: Request) => auth.handler(request);
export const HEAD = GET;
