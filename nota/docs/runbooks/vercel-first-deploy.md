---
title: nota Vercel First Deploy
type: runbook
status: active
date: 2026-03-06
---

# nota Vercel First Deploy

Use this when deploying the invoicing app from this repository to Vercel for the first time.

## Project shape

The app itself lives in `nota/`.

In Vercel:

1. Import the Git repository.
2. Set the project root directory to `nota`.
3. Keep the framework preset as Next.js.

## Required environment variables

Set every value from `nota/.env.example`:

- `DATABASE_URL`
- `SESSION_SECRET`
- `APP_URL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CRON_SECRET`

Set `APP_URL` to the final production domain before testing password reset emails.

## First deploy sequence

1. Deploy the project once so Vercel provisions the app URL.
2. Run database migrations against the production database:

```bash
cd nota
bun install
bun run db:migrate
```

3. Seed the initial owner account once:

```bash
cd nota
SEED_EMAIL='you@example.com' SEED_NAME='Your Name' SEED_PASSWORD='strong-password' bun run db:seed
```

4. Sign in and configure business details, bank account details, and logo URL in `/settings`.

## Stripe setup

1. Create or reuse a Stripe test account first.
2. Add a webhook endpoint pointing to:

```text
https://your-domain.com/api/webhooks/stripe
```

3. Subscribe to `checkout.session.completed`.
4. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

## Cron setup

This app keeps cron schedules in `nota/vercel.json`, so Vercel will register:

- `/api/cron/overdue`
- `/api/cron/jobs`

Both routes expect `Authorization: Bearer $CRON_SECRET`.

## Recommended first verification

After the first successful deploy:

1. Sign in and create a test client and invoice.
2. Send a test invoice to yourself.
3. Confirm the dock shows the created Stripe resources.
4. Complete a Stripe test payment.
5. Confirm the invoice becomes `paid`.
6. Run the smoke checklist in [`nota-deploy-smoke-checklist.md`](./nota-deploy-smoke-checklist.md).
