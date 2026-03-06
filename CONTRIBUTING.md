# Contributing

Thanks for contributing.

## Scope

This repository is organized as a monorepo under `apps/`.

- `apps/web` is the production app today.
- `apps/cli` and `apps/mcp` are reserved for the CLI and MCP server.

## Local workflow

1. Copy `apps/web/.env.example` to `apps/web/.env` and fill in safe development credentials.
2. Install dependencies from the repository root.
3. Run migrations and seed a development owner account in `apps/web`.
4. Start the web app and verify the affected flow locally.

```bash
bun install
cd apps/web
bun run db:migrate
bun run db:seed
bun run dev
```

## Before opening a PR

Run the shared checks from the repository root:

```bash
bun run test:web
bun run check:web
bun run check:cli
bun run check:mcp
bun run build:web
```

If you touched browser flows, also run:

```bash
bun run test:e2e:web
```

## Guidelines

- Keep the app intentionally single-owner unless the change explicitly expands scope.
- Do not commit secrets or real `.env` files.
- Prefer small, reviewable pull requests with a clear problem statement.
- Update docs and runbooks when behavior or deployment requirements change.
