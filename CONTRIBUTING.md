# Contributing

Thanks for contributing.

## Scope

This repository is organized as a monorepo under `apps/`.

- `apps/web` is the production app today.
- `apps/cli` is the published terminal client; `apps/mcp` serves local and remote agent integrations.
- `packages/sdk` is their shared REST client.

Nota is maintained by No Rules Software SL.

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

## Amp orbs

`.agents/setup` prepares Bun (from `packageManager`), Node 22 LTS, locked workspace
dependencies, SDK/MCP build outputs, Playwright Chromium, and a disposable Postgres
15 database. Amp can snapshot this environment; repeated setup reuses installed
tools and caches. `.agents/resume` only checks/starts the local database.
Setup also enables Linux memory overcommit inside the orb so Oxlint's JS plugins
can reserve their large virtual-memory blocks on small machines without swap.

The local database is `nota_orb` on loopback port 5433, managed by the
`postgresql@15-nota` systemd service. Setup always migrates this database, never an
inherited `DATABASE_URL`. It seeds `admin@nota.app` with the development password
`changeme` only when that user is absent. Local database authentication trusts
loopback connections, and durability is disabled; never expose it or use it for
non-disposable data.

Setup creates `apps/web/.env` with local database/auth defaults only if neither
`.env` nor `.env.local` exists. Existing configuration and injected environment
variables still control the app, so check the database target before running
database-backed browser tests. Stripe, Helo, Anthropic, and Blob integrations
require separate development secrets; setup does not copy credentials into the
snapshot. After changing dependencies, rerun `.agents/setup`.

## Before opening a PR

Run focused tests and static checks for the surfaces you changed. Before a release or a cross-surface change, run the shared checks from the repository root:

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

- Preserve workspace isolation and the existing owner/admin/member permissions across every surface.
- Do not commit secrets or real `.env` files.
- Prefer small, reviewable pull requests with a clear problem statement.
- Update docs and runbooks when behavior or deployment requirements change.
