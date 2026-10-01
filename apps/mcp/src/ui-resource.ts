import { readFileSync } from "node:fs";
import { RESOURCE_MIME_TYPE, registerAppResource } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const invoiceUiMeta = { ui: { resourceUri: "ui://nota/invoices.html" } };

export function registerInvoiceUi(server: McpServer) {
  registerAppResource(
    server,
    "invoice-workspace",
    invoiceUiMeta.ui.resourceUri,
    {
      description:
        "Interactive Nota invoice workspace: browse invoices, inspect line items, and download PDFs.",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: RESOURCE_MIME_TYPE,
          text: readFileSync(new URL("../dist/invoice-app.html", import.meta.url), "utf8"),
          _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true } },
        },
      ],
    }),
  );
}
