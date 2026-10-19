# Contributing

Thanks for contributing.

## Scope

This repository is organized as a monorepo under `apps/`.

- `apps/web` is the production app today.
- `apps/cli` is the published terminal client; `apps/mcp` serves local and remote agent integrations.
- `packages/sdk` is their shared REST client.

Nota is maintained by No Rules Software SL.

## Local workflow

1. Copy `apps/web/.env.example` to `apps/web/.env.local` and point `DATABASE_URL` at a disposable local Postgres database.
2. Install dependencies from the repository root.
3. Run migrations and seed a development owner account in `apps/web`.
4. Start the web app and verify the affected flow locally.

```bash
bun install
cd apps/web
bun run db:migrate
SEED_CONFIRM=disposable bun run db:seed
bun run dev
```

The seed creates `admin@nota.test` / `nota-demo-password` and refuses to run without
`SEED_CONFIRM=disposable`. Override the login with `SEED_EMAIL`, `SEED_NAME`, and `SEED_PASSWORD`.

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

Run the shared checks from the repository root. CI runs the same commands.

```bash
bun run test    # unit tests for web, CLI, and MCP
bun run check   # tsc for every package; oxlint and oxfmt for apps/web
```

`bun run --cwd apps/web format` fixes formatting with oxfmt. Before a release or a cross-surface
change, also run `bun run build`.

If you touched browser flows, also run:

```bash
bun run test:e2e:web
```

## Pull requests

- Open PRs against `main`. Prefix the title with the Linear issue key when there is one, for
  example `NOTA-51: Allocate invoice numbers at issuance`.
- Fill in the pull request template: summary, how you tested, and any env, migration, webhook, or
  cron changes.
- Keep commit messages plain and imperative.
- Prefer small, reviewable pull requests with a clear problem statement.

## Guidelines

- Read [AGENTS.md](./AGENTS.md) before touching invoice numbering, issuance, or audit events.
- Preserve workspace isolation and the existing owner/admin/member permissions across every surface.
- Do not commit secrets or real `.env` files. Report vulnerabilities as described in
  [SECURITY.md](./SECURITY.md), not in public issues.
- Update docs and runbooks when behavior or deployment requirements change.
- Be kind. The [code of conduct](./CODE_OF_CONDUCT.md) applies everywhere in this project.
