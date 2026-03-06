# nota

`nota` is a lean monorepo for the Nota invoicing product.

## Apps

- [`apps/web`](./apps/web): the deployed Next.js invoicing app
- [`apps/cli`](./apps/cli): scaffold for the future Nota CLI
- [`apps/mcp`](./apps/mcp): scaffold for the future Nota MCP server

## Start here

- Web app setup: [`apps/web/README.md`](./apps/web/README.md)
- Vercel first deploy runbook: [`apps/web/docs/runbooks/vercel-first-deploy.md`](./apps/web/docs/runbooks/vercel-first-deploy.md)
- Post-deploy smoke checklist: [`apps/web/docs/runbooks/nota-deploy-smoke-checklist.md`](./apps/web/docs/runbooks/nota-deploy-smoke-checklist.md)

`packages/` is intentionally absent for now. Add shared packages only when code is actually shared across apps.
