# nota

`nota` is a lean monorepo for the Nota invoicing product.

## Apps

- [`apps/web`](./apps/web): the deployed Next.js invoicing app
- [`apps/cli`](./apps/cli): scaffold for the future Nota CLI
- [`apps/mcp`](./apps/mcp): MCP server for Claude Desktop, Claude Code, Cursor, and other MCP clients

## Start here

- Web app setup: [`apps/web/README.md`](./apps/web/README.md)
- MCP server setup: [`apps/mcp/README.md`](./apps/mcp/README.md)
- Vercel first deploy runbook: [`apps/web/docs/runbooks/vercel-first-deploy.md`](./apps/web/docs/runbooks/vercel-first-deploy.md)
- Post-deploy smoke checklist: [`apps/web/docs/runbooks/nota-deploy-smoke-checklist.md`](./apps/web/docs/runbooks/nota-deploy-smoke-checklist.md)

`packages/` is intentionally absent for now. Add shared packages only when code is actually shared across apps.
