# nota

`nota` is a Bun workspace monorepo for the Nota invoicing product.

## Packages

- [`apps/web`](./apps/web): the deployed Next.js app for teams, billing operations, REST API, and in-app AI chat
- [`apps/cli`](./apps/cli): the `nota` terminal client for invoices and clients
- [`apps/mcp`](./apps/mcp): the MCP server for Claude Desktop, Claude Code, Cursor, and similar clients
- [`packages/sdk`](./packages/sdk): the shared TypeScript API client used by the CLI and MCP server

## Product surface

- org-based workspaces with `owner`, `admin`, and `member` roles
- invite flow and team management
- clients, bank accounts, invoices, activity log, PDF, and XRechnung
- bearer-token REST API
- CLI, MCP server, and in-app AI chat on top of the same API and service layer

## Common commands

```bash
bun install
bun run check
bun run build
bun run test
bun run test:e2e
```

## Start here

- Web app setup: [`apps/web/README.md`](./apps/web/README.md)
- CLI usage: [`apps/cli/README.md`](./apps/cli/README.md)
- MCP setup: [`apps/mcp/README.md`](./apps/mcp/README.md)
- Web API reference: [`apps/web/docs/api.md`](./apps/web/docs/api.md)
- Vercel first deploy runbook: [`apps/web/docs/runbooks/vercel-first-deploy.md`](./apps/web/docs/runbooks/vercel-first-deploy.md)
- Post-deploy smoke checklist: [`apps/web/docs/runbooks/nota-deploy-smoke-checklist.md`](./apps/web/docs/runbooks/nota-deploy-smoke-checklist.md)
