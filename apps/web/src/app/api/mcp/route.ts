import { requireMcpAuth } from "@better-auth/mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createRemoteNotaClient } from "@nota-app/mcp/client";
import invoiceAppHtml from "@nota-app/mcp/invoice-app-html";
import { createNotaMcpServer } from "@nota-app/mcp/server";

import { getAuthIssuer, getMcpResource } from "@/lib/auth-config";
import { auth } from "@/lib/better-auth";

// Remote MCP for ChatGPT, Claude and other connectors. Served at /mcp
// (rewritten here) and on mcp.withnota.com. Stateless: one server per request.
const handleMcp = requireMcpAuth(
  auth,
  async (request) => {
    // The REST API accepts the same audience-bound access token, so tools act
    // with exactly this user's workspace and role.
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const server = createNotaMcpServer(createRemoteNotaClient(getAuthIssuer(), token), {
      invoiceAppHtml,
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      void server.close();
    }
  },
  { issuer: getAuthIssuer(), resource: getMcpResource() },
);

export const POST = handleMcp;

// No server-initiated stream or session to delete in stateless mode.
export function GET() {
  return new Response(null, { headers: { Allow: "POST" }, status: 405 });
}
export const DELETE = GET;
