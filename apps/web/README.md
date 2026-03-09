# nota web

`nota web` is the Next.js app for Nota: an org-scoped invoicing workspace with a REST API, terminal and MCP integrations, and an in-app AI assistant.

## Current capabilities

- email/password auth with workspace creation on registration
- `owner`, `admin`, and `member` roles
- invite links and team management
- clients, bank accounts, invoices, activity log, PDF, and XRechnung
- Stripe payment links and Stripe webhook handling
- API keys and bearer-token REST API under `/api/v1`
- in-app chat powered by Vercel AI SDK
- queued email jobs plus overdue/job crons
- ops dock for Stripe and job visibility

## Stack

- Next.js App Router
- React 19
- Drizzle ORM
- Neon Postgres
- Stripe
- Resend
- Vercel AI SDK with Anthropic
- Bun for local commands

## Local setup

1. Install dependencies.

```bash
bun install
```

2. Copy the sample environment file and fill in real values.

```bash
cp .env.example .env
```

3. Run database migrations.

```bash
bun run db:migrate
```

4. Seed an owner account.

```bash
bun run db:seed
```

By default the seed command creates:

- email: `admin@nota.app`
- password: `changeme`
- workspace: `Admin's Workspace`

Override those with `SEED_EMAIL`, `SEED_NAME`, and `SEED_PASSWORD`.

5. Start the app.

```bash
bun run dev
```

Open `http://localhost:3000/login`.

## Environment variables

### Required

- `DATABASE_URL`: Postgres connection string
- `SESSION_SECRET`: HMAC secret for signed session cookies
- `APP_URL`: absolute app URL used in invites and password reset emails
- `RESEND_API_KEY`: API key used to send invites, invoices, reminders, and payment emails
- `STRIPE_SECRET_KEY`: Stripe secret key used to create payment links
- `STRIPE_WEBHOOK_SECRET`: webhook signing secret for `/api/webhooks/stripe`
- `CRON_SECRET`: bearer token expected by `/api/cron/overdue` and `/api/cron/jobs`
- `ANTHROPIC_API_KEY`: provider key for the in-app AI assistant
- `BLOB_READ_WRITE_TOKEN`: required for owner logo uploads

### Recommended

- `RESEND_FROM_EMAIL`: branded sender, for example `Your Business <billing@example.com>`
- `NOTA_CHAT_MODEL`: override the default Anthropic model used by `/api/chat`

## Branding assets

- owner logo uploads use Vercel Blob server uploads
- uploaded logos are stored as public blob URLs in `orgs.logoUrl`
- the same logo URL is reused in the app header and fetched into invoice PDFs at render time

### Optional seed values

- `SEED_EMAIL`
- `SEED_NAME`
- `SEED_PASSWORD`

## Teams

- registration creates a user, a workspace, and an `owner` membership
- owners can manage settings, invites, members, and roles
- admins can operate invoices and bank accounts but cannot manage workspace settings or membership
- members can create and edit drafts, but cannot send, cancel, delete, or mark invoices paid
- the current auth model assumes one active workspace per user and uses the first membership returned by `org_members`

## API

- create API keys in Settings
- REST API reference: [docs/api.md](./docs/api.md)
- web UI and API routes share the same invoice service layer

## Integrations

- CLI: [`../cli/README.md`](../cli/README.md)
- MCP server: [`../mcp/README.md`](../mcp/README.md)
- in-app AI assistant: available inside the authenticated dashboard via `/api/chat`

## Common commands

```bash
bun run dev
bun run build
bun test
bun run test:e2e
bun run lint
bun run format:check
bun run db:migrate
bun run db:seed
bun run db:studio
```

## Deploying on Vercel

1. Provision a Postgres database.
2. Add all required environment variables from `.env.example` in the Vercel project.
3. Run Drizzle migrations against the production database.
4. Seed the first owner account once.
5. Configure a Stripe webhook that points to `https://your-domain.com/api/webhooks/stripe`.
6. Configure a verified sending domain in Resend and set `RESEND_FROM_EMAIL`.
7. Keep `vercel.json` committed so Vercel runs the overdue and job crons.

## Tests

Unit and integration tests:

```bash
bun test
```

Browser tests:

```bash
bunx playwright install chromium
bun run test:e2e
```

The Playwright suite uses the real app against your configured Postgres database, so point `.env` at a disposable local or development database before running it.

## Known limits

- one active workspace per user for now
- registration is open and does not include email verification yet
- the ops/jobs layer still uses database-backed cron processing rather than dedicated workflow infrastructure

## Production checklist

Use the runbooks in [docs/runbooks](./docs/runbooks) before relying on the app in production, especially:

- [docs/runbooks/nota-deploy-smoke-checklist.md](./docs/runbooks/nota-deploy-smoke-checklist.md)
- [docs/runbooks/vercel-first-deploy.md](./docs/runbooks/vercel-first-deploy.md)
