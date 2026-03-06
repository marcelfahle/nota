# nota

`nota` is a single-owner invoicing app built with Next.js, Drizzle, Neon, Stripe, and Resend.

It is designed for the use case this repo actually has today:

- one business owner
- a small number of invoices per month
- Stripe payment links for card payments
- PDF and XRechnung invoice exports
- enough operational visibility to self-host or deploy on Vercel without guessing

## Current scope

- owner login with database-backed user records
- self-service registration and password reset
- clients, bank accounts, invoices, and activity log stored in Postgres
- PDF invoice generation
- XRechnung XML export
- Stripe payment link creation and Stripe webhook handling
- overdue marking via cron
- retryable outbound email jobs via cron
- internal Stripe dock for inspecting created Stripe resources

This is intentionally not a multi-tenant SaaS. There is no public signup, team model, or client portal.

## Stack

- Next.js App Router
- React 19
- Drizzle ORM
- Neon Postgres
- Stripe
- Resend
- Bun for local development commands

## Local setup

1. Install dependencies.

```bash
bun install
```

2. Copy the sample environment file and fill in real values.

```bash
cp .env.example .env
```

3. Run the database migrations.

```bash
bun run db:migrate
```

4. Seed the owner account.

```bash
bun run db:seed
```

By default the seed command creates:

- email: `admin@nota.app`
- password: `changeme`

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
- `APP_URL`: absolute app URL used in password reset emails
- `RESEND_API_KEY`: API key used to send invoice and payment emails
- `STRIPE_SECRET_KEY`: Stripe secret key used to create payment links
- `STRIPE_WEBHOOK_SECRET`: webhook signing secret for `/api/webhooks/stripe`
- `CRON_SECRET`: bearer token expected by `/api/cron/overdue`

### Recommended

- `RESEND_FROM_EMAIL`: branded sender, for example `Your Business <billing@example.com>`

### Optional seed values

- `SEED_EMAIL`
- `SEED_NAME`
- `SEED_PASSWORD`

## API

- Full API reference: [docs/api.md](./docs/api.md)

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

1. Provision a Postgres database. Neon is the path already used by this app.
2. Add all required environment variables from `.env.example` in the Vercel project.
3. Run Drizzle migrations against the production database.
4. Seed the owner user once.
5. Configure a Stripe webhook that points to:

```text
https://your-domain.com/api/webhooks/stripe
```

Listen for:

- `checkout.session.completed`

6. Configure a verified sending domain in Resend and set `RESEND_FROM_EMAIL`.
7. Keep `vercel.json` committed so Vercel runs both the overdue cron and the email-job cron automatically.

When `CRON_SECRET` is present, Vercel Cron requests will include the expected bearer token for `/api/cron/overdue`.

## Browser tests

Install Chromium for Playwright once:

```bash
bunx playwright install chromium
```

Then run:

```bash
bun run test:e2e
```

The browser suite uses the real app against your configured Postgres database, so point `.env` at a disposable local or development database before running it.

## Hosting notes

- `src/proxy.ts` protects dashboard routes and keeps `/login` plus the Stripe webhook public.
- `src/proxy.ts` keeps `/register`, `/forgot-password`, `/reset-password`, `/api/webhooks/*`, and `/api/cron/*` public.
- Session cookies are signed with `SESSION_SECRET`.
- Stripe-created resources are visible in the bottom dock on dashboard pages.
- Sent invoices are treated as historical records. Drafts are editable, while sent/paid invoices are constrained by lifecycle rules.
- Outbound invoice emails are queued in the database and retried by `/api/cron/jobs`.

## Known limits

- This is still an internal app, not a public product.
- Registration is currently open and does not include email verification yet.
- Manual `Mark Sent` does not create a Stripe payment link, so Stripe reminders are only available for invoices that were sent through the app.

## Suggested production checklist

Before relying on the app in production:

1. Verify Stripe webhook delivery in the Stripe dashboard.
2. Send a real invoice to yourself and confirm PDF, email, payment link, and webhook settlement.
3. Confirm the overdue cron marks a test invoice correctly.
4. Confirm `/api/cron/jobs` drains queued emails.
5. Export and restore a database backup at least once.
6. Set a real `RESEND_FROM_EMAIL` on a verified domain.

For a fuller post-deploy flow, use [docs/runbooks/nota-deploy-smoke-checklist.md](./docs/runbooks/nota-deploy-smoke-checklist.md) and [docs/runbooks/vercel-first-deploy.md](./docs/runbooks/vercel-first-deploy.md).
