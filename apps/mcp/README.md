# @nota-app/mcp

`@nota-app/mcp` exposes Nota's org-scoped invoicing API over stdio or remote Streamable HTTP with OAuth.

Claude and ChatGPT hosts that support MCP Apps can show an interactive invoice workspace. Other clients receive text and structured results.

## Remote connection for Claude and ChatGPT

Current deployment: **Hetzner `91.99.49.152`**, alongside Bold MCP, in its own `nota-mcp` container. Connect to:

```text
https://nota-mcp.91-99-49-152.sslip.io/mcp
```

Create a dedicated API key in [Nota Settings](https://nota-weld.vercel.app/settings), add the URL as a custom connector/app, and enter the key on the OAuth page. A branded domain can replace this initial hostname later. See [deployment operations](./deploy/README.md).

Build from the repository root with `bun install` and `bun run build:mcp`. Run the HTTP server on a persistent Node.js host behind HTTPS:

```bash
export NOTA_URL="https://your-nota-app.example"
export NOTA_MCP_PUBLIC_URL="https://mcp.your-domain.example"
export NOTA_OAUTH_STORE="/persistent/nota/oauth.enc"
export NOTA_OAUTH_SECRET="<64 hex characters from openssl rand -hex 32>"
export NOTA_MCP_HOST="0.0.0.0"
export PORT="3100"
node apps/mcp/dist/http.js
```

Use your own URLs. `NOTA_MCP_PUBLIC_URL` is the public origin, without `/mcp`; connect your AI client to `https://mcp.your-domain.example/mcp`. The reverse proxy must preserve the public Host header and forward requests to port 3100. Health check: `/health`. OAuth discovery, registration, PKCE, token refresh, and revocation are included.

For a single trusted reverse proxy, set `NOTA_TRUST_PROXY_HOPS=1` so rate limits use the client IP. The default is `0` for direct connections. Keep port 3100 private and match this count to your deployment's proxy chain; the supplied Compose configuration sets it for Caddy.

Run **one server process** with a persistent volume. This encrypted file store does not support multiple replicas or ephemeral serverless storage. Keep the encryption secret stable across restarts and back it up separately from the encrypted file. Losing it requires reconnecting users. Never put keys or this state file in source control.

In Claude, add that URL as a custom connector. In ChatGPT, enable Developer Mode where available and add the remote MCP URL as an app. The OAuth browser page asks for a dedicated Nota API key created in Nota Settings → API Keys. The assistant receives OAuth tokens; the underlying Nota key stays encrypted on the MCP server. Delete the dedicated Nota key to revoke the connection. Workspace and role permissions remain enforced by Nota.

The cards support browsing, filters, invoice details, PDF/XML downloads, and requesting an invoice send through the host conversation. They never charge a customer. File downloads require the host's MCP Apps download capability. Actual host UI, account availability, and connector approval are controlled by Claude/ChatGPT; test there before a public launch.

The remote server is deployed. Your individual Claude/ChatGPT account connection requires the OAuth consent step; no marketplace listing has been published. Local stdio remains available below.

## What it does

- Lists and creates clients
- Previews and imports client CSVs after explicit approval
- Lists invoices with status and client filters
- Creates draft invoices from structured line items or newline-based text input
- Resolves `clientName` and `invoiceNumber` references when UUIDs are not convenient
- Sends invoices, reminders, mark-paid actions, cancellations, and duplicates
- Downloads invoice PDFs
- Downloads XRechnung XML with matching filenames
- Reads client billing history before repeating services
- Changes due dates using short references such as `97` for `0000097`
- Shows interactive overview, list, and invoice cards through MCP Apps
- Publishes read-only resources for invoice summary, invoice detail, and client detail

## Requirements

- Node.js 20.19+
- A Nota deployment URL
- A Nota API key created in `Settings -> API Keys`

`NOTA_URL` should point at the app origin such as `https://nota-weld.vercel.app`. The MCP client appends `/api/v1` automatically.

## Environment

```bash
export NOTA_URL="https://nota-weld.vercel.app"
export NOTA_API_KEY="nota_..."
```

## Install

Run the published stdio server with:

```bash
NOTA_URL="https://app.withnota.com" NOTA_API_KEY="nota_..." npx -y @nota-app/mcp
```

Or install the binary globally with `npm install -g @nota-app/mcp` and run `nota-mcp`.
The server speaks MCP on stdio and waits for a client connection.

## Local build

```bash
cd apps/mcp
bun install
bun run build
NOTA_URL="https://nota-weld.vercel.app" \
NOTA_API_KEY="nota_..." \
node dist/index.js
```

The process speaks MCP on stdio, so it will wait for a client connection.

## Claude Desktop

Add a local stdio server entry to `claude_desktop_config.json`.

```json
{
  "mcpServers": {
    "nota": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@nota-app/mcp"],
      "env": {
        "NOTA_URL": "https://nota-weld.vercel.app",
        "NOTA_API_KEY": "nota_..."
      }
    }
  }
}
```

For a source checkout, use `"command": "node"` with
`"args": ["/absolute/path/to/nota/apps/mcp/dist/index.js"]` after building locally.

```json
{
  "mcpServers": {
    "nota": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@nota-app/mcp"],
      "env": {
        "NOTA_URL": "https://nota-weld.vercel.app",
        "NOTA_API_KEY": "nota_..."
      }
    }
  }
}
```

## Claude Code

Claude Code supports project-scoped MCP config in `.mcp.json`. User-scoped entries are stored in `~/.claude.json`.

Project config:

```json
{
  "mcpServers": {
    "nota": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@nota-app/mcp"],
      "env": {
        "NOTA_URL": "https://nota-weld.vercel.app",
        "NOTA_API_KEY": "nota_..."
      }
    }
  }
}
```

CLI alternative:

```bash
claude mcp add nota \
  --transport stdio \
  --env NOTA_URL=https://nota-weld.vercel.app \
  --env NOTA_API_KEY=nota_... \
  -- npx -y @nota-app/mcp
```

## Cursor

Cursor supports project config in `.cursor/mcp.json` and user config in `~/.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "nota": {
      "command": "npx",
      "args": ["-y", "@nota-app/mcp"],
      "env": {
        "NOTA_URL": "https://nota-weld.vercel.app",
        "NOTA_API_KEY": "nota_..."
      }
    }
  }
}
```

## Tools

| Tool                         | Description                                               | Example prompt                                              |
| ---------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| `list_clients`               | List clients with optional search                         | `Show clients matching acme.`                               |
| `preview_clients_csv`        | Preview a client CSV without saving                       | `Preview the clients in this CSV.`                          |
| `import_clients_csv`         | Add clients from an approved, unchanged preview           | `Import the clients from that preview.`                     |
| `invoice_overview`           | Counts and recent invoices in an interactive workspace    | `Show my billing dashboard.`                                |
| `get_client_billing_history` | Recent invoices with full line items                      | `What do we usually bill Ranger for?`                       |
| `change_invoice_due_date`    | Change only the due date                                  | `Change invoice 97's due date to October 8, 2026.`          |
| `create_client`              | Create a client record                                    | `Create a client for Acme GmbH with billing@acme.test.`     |
| `list_invoices`              | List invoices with status, client, and search filters     | `List overdue invoices for Acme.`                           |
| `create_invoice`             | Create a draft invoice from line items or `lineItemsText` | `Create an invoice for Acme: 2 x Strategy workshop @ 1500.` |
| `get_invoice`                | Load a single invoice by UUID or invoice number           | `Show me invoice INV-0001.`                                 |
| `send_invoice`               | Send a draft invoice                                      | `Send invoice INV-0001.`                                    |
| `send_reminder`              | Send a reminder for a sent or overdue invoice             | `Remind the client about INV-0001.`                         |
| `mark_paid`                  | Mark an invoice as paid                                   | `Mark INV-0001 as paid.`                                    |
| `cancel_invoice`             | Cancel a sent or overdue invoice                          | `Cancel invoice INV-0001.`                                  |
| `duplicate_invoice`          | Duplicate an invoice into a draft                         | `Duplicate invoice INV-0001.`                               |
| `download_pdf`               | Return the invoice PDF as base64 plus metadata            | `Download the PDF for INV-0001.`                            |
| `download_xml`               | Return XRechnung XML as base64 plus metadata              | `Download the XML for invoice 97.`                          |

## Resources

- `nota://invoices/summary`: org context, counts by invoice status, recent invoices
- `nota://invoices/{invoiceId}`: full invoice detail as JSON
- `nota://clients/{clientId}`: client detail as JSON
- `ui://nota/invoices.html`: the self-contained MCP Apps invoice workspace

## Input notes

For CSV migration, pass a UTF-8 client export to `preview_clients_csv`, explain its matched/unused columns and new/skipped rows, and ask the human to approve. Then pass the unchanged CSV plus the returned `hash` as `previewHash` to `import_clients_csv`. Limits: 250 KB and 1,000 rows. Existing emails are skipped; no invoices or emails are created. A 409 requires another preview and approval. These tools work through the same authenticated API as Nota Chat and the CLI.

`create_invoice` accepts either:

```json
{
  "clientName": "Acme GmbH",
  "lineItemsText": "2 x Strategy workshop @ 1500\nDiscovery session | 1 | 800"
}
```

or structured line items:

```json
{
  "clientId": "client_uuid",
  "lineItems": [
    {
      "description": "Strategy workshop",
      "quantity": 2,
      "unitPrice": 1500
    }
  ]
}
```

## Example conversations

- `Create a draft invoice for Acme GmbH for 2 x Strategy workshop @ 1500 and 1 x Discovery session @ 800.`
- `Show me overdue invoices and then remind the top two.`
- `Download the PDF for invoice INV-0007.`
- `Duplicate INV-0003 and keep the same line items.`
- `What does my invoice summary look like right now?`

## Commands

```bash
bun run check
bun run build
bun run test
```

## Publish

From the repository root:

```bash
bun install --frozen-lockfile
bun run check:mcp
bun run test:mcp
cd apps/mcp
npm pack
node scripts/smoke-package.mjs ./nota-app-mcp-0.1.0.tgz
```

Inspect the tarball, then install it in an empty directory outside the monorepo.
Check an MCP initialize request, tools/resources listing, and the invoice UI resource
using both npx and bunx. Check the exported client and server modules and TypeScript
declarations from that installation too. These checks need no production mutations.

Publish the reviewed archive with `npm publish ./nota-app-mcp-0.1.0.tgz --access public`
after npm login and 2FA. Verify the registry archive's integrity and repeat the fresh
install checks against `@nota-app/mcp@0.1.0`.

The published binary is `nota-mcp`. The build bundles the workspace Nota SDK and
includes its declarations; MCP, Express, and Zod remain regular npm dependencies.
