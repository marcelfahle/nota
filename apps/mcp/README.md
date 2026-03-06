# @nota-app/mcp

`@nota-app/mcp` exposes Nota's org-scoped invoicing API as an MCP server over stdio.

It is built for local MCP clients such as Claude Desktop, Claude Code, Cursor, and any other client that can spawn a stdio MCP server.

## What it does

- Lists and creates clients
- Lists invoices with status and client filters
- Creates draft invoices from structured line items or newline-based text input
- Resolves `clientName` and `invoiceNumber` references when UUIDs are not convenient
- Sends invoices, reminders, mark-paid actions, cancellations, and duplicates
- Downloads invoice PDFs
- Publishes read-only resources for invoice summary, invoice detail, and client detail

## Requirements

- Node.js 20+
- A Nota deployment URL
- A Nota API key created in `Settings -> API Keys`

`NOTA_URL` should point at the app origin such as `https://nota-weld.vercel.app`. The MCP client appends `/api/v1` automatically.

## Environment

```bash
export NOTA_URL="https://nota-weld.vercel.app"
export NOTA_API_KEY="nota_..."
```

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
      "command": "node",
      "args": [
        "/absolute/path/to/nota/apps/mcp/dist/index.js"
      ],
      "env": {
        "NOTA_URL": "https://nota-weld.vercel.app",
        "NOTA_API_KEY": "nota_..."
      }
    }
  }
}
```

When the package is published, you can switch the command to `npx`.

```json
{
  "mcpServers": {
    "nota": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@nota-app/mcp"
      ],
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
      "command": "node",
      "args": [
        "/absolute/path/to/nota/apps/mcp/dist/index.js"
      ],
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
  -- node /absolute/path/to/nota/apps/mcp/dist/index.js
```

## Cursor

Cursor supports project config in `.cursor/mcp.json` and user config in `~/.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "nota": {
      "command": "node",
      "args": [
        "/absolute/path/to/nota/apps/mcp/dist/index.js"
      ],
      "env": {
        "NOTA_URL": "https://nota-weld.vercel.app",
        "NOTA_API_KEY": "nota_..."
      }
    }
  }
}
```

## Tools

| Tool | Description | Example prompt |
| --- | --- | --- |
| `list_clients` | List clients with optional search | `Show clients matching acme.` |
| `create_client` | Create a client record | `Create a client for Acme GmbH with billing@acme.test.` |
| `list_invoices` | List invoices with status, client, and search filters | `List overdue invoices for Acme.` |
| `create_invoice` | Create a draft invoice from line items or `lineItemsText` | `Create an invoice for Acme: 2 x Strategy workshop @ 1500.` |
| `get_invoice` | Load a single invoice by UUID or invoice number | `Show me invoice INV-0001.` |
| `send_invoice` | Send a draft invoice | `Send invoice INV-0001.` |
| `send_reminder` | Send a reminder for a sent or overdue invoice | `Remind the client about INV-0001.` |
| `mark_paid` | Mark an invoice as paid | `Mark INV-0001 as paid.` |
| `cancel_invoice` | Cancel a sent or overdue invoice | `Cancel invoice INV-0001.` |
| `duplicate_invoice` | Duplicate an invoice into a draft | `Duplicate invoice INV-0001.` |
| `download_pdf` | Return the invoice PDF as base64 plus metadata | `Download the PDF for INV-0001.` |

## Resources

- `nota://invoices/summary`: org context, counts by invoice status, recent invoices
- `nota://invoices/{invoiceId}`: full invoice detail as JSON
- `nota://clients/{clientId}`: client detail as JSON

## Input notes

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
