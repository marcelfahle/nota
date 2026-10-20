# Nota

Nota is invoicing for small teams and freelancers. You tell it what to bill, and it takes care of
clients, invoices, PDFs, XRechnung, reminders and payments.

The hosted version runs at [app.withnota.com](https://app.withnota.com). This repository holds the
whole product: the web app, the CLI, the MCP server and the TypeScript SDK, all on one REST API and
one service layer.

## Four ways in

- **Web and chat.** Sign in at [app.withnota.com](https://app.withnota.com) and tell Nota what to
  invoice in the chat.
- **CLI.** `npx @nota-app/cli login`, then `nota invoices create`. See
  [`apps/cli/README.md`](./apps/cli/README.md).
- **MCP.** `claude mcp add --transport http nota https://mcp.withnota.com/mcp`, or run the stdio
  server with `npx -y @nota-app/mcp`. See [`apps/mcp/README.md`](./apps/mcp/README.md).
- **REST API.** `curl -H "Authorization: Bearer $NOTA_API_KEY" https://app.withnota.com/api/v1/invoices`.
  Reference in [`apps/web/docs/api.md`](./apps/web/docs/api.md); typed client in
  [`packages/sdk`](./packages/sdk).

## Repository layout

- [`apps/web`](./apps/web): the Next.js app, REST API, in-app chat and the hosted remote MCP endpoint
- [`apps/cli`](./apps/cli): the `nota` terminal client, published as `@nota-app/cli`
- [`apps/mcp`](./apps/mcp): the MCP server for Claude, ChatGPT, Cursor and other clients, published as `@nota-app/mcp`
- [`packages/sdk`](./packages/sdk): the shared TypeScript API client, published as `@nota-app/sdk`

## Run it locally

You need [Bun](https://bun.sh) 1.3 and a local Postgres.

```sh
bun install
createdb nota_dev
cp apps/web/.env.example apps/web/.env.local
```

In `apps/web/.env.local`, point `DATABASE_URL` at `postgresql://localhost:5432/nota_dev` and set a
random `SESSION_SECRET`. The other values have local defaults: email goes to a log, files go to
local storage, and chat stays off until you add an `ANTHROPIC_API_KEY`. The comments in the file
explain the rest.

```sh
bun run --cwd apps/web db:migrate
SEED_CONFIRM=disposable bun run --cwd apps/web db:seed
bun run dev
```

The seed creates a workspace with the login `admin@nota.test` / `nota-demo-password` and refuses to
run without `SEED_CONFIRM=disposable`, so you never seed a real database by accident. Open
<http://localhost:3000/login>.

## Tests and checks

```sh
bun run test      # unit tests for web, CLI and MCP
bun run check     # tsc for every package, oxlint and oxfmt for apps/web
bun run test:e2e  # Playwright, against the database in apps/web/.env.local
```

`bun run --cwd apps/web format` fixes formatting.

## Docs

- [`CONTRIBUTING.md`](./CONTRIBUTING.md): local workflow and pull request conventions
- [`AGENTS.md`](./AGENTS.md): engineering invariants, especially invoice numbering
- [`apps/web/README.md`](./apps/web/README.md): web app setup, environment variables, deployment
- [`apps/web/docs/api.md`](./apps/web/docs/api.md): REST API reference
- [`docs/runbooks`](./docs/runbooks): operations runbooks
- [`SECURITY.md`](./SECURITY.md): how to report a vulnerability

## Self-hosting

Nota runs as a Docker Compose stack with Postgres, migrations, cron and optional MCP. Self-hosted
installs keep every invoicing feature and have no subscription quotas. Start with
[`docs/self-hosting.md`](./docs/self-hosting.md).

## License

MIT. Copyright (c) 2026 No Rules Software SL. See [`LICENSE`](./LICENSE).
