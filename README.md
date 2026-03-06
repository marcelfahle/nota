# payme

This repository currently centers on [`inv/`](./inv/), a single-owner invoicing app built with Next.js, Drizzle, Neon, Stripe, and Resend.

## Primary app

- [`inv/`](./inv/): production-focused invoicing app with PDF and XRechnung export, Stripe payment links, and Vercel-ready cron/webhook routes

## Start here

- App overview and local setup: [`inv/README.md`](./inv/README.md)
- Vercel first deploy runbook: [`inv/docs/runbooks/vercel-first-deploy.md`](./inv/docs/runbooks/vercel-first-deploy.md)
- Post-deploy smoke checklist: [`inv/docs/runbooks/inv-deploy-smoke-checklist.md`](./inv/docs/runbooks/inv-deploy-smoke-checklist.md)

The `inv/` directory is the maintained product surface. Other top-level folders may contain adjacent work that is not part of the invoicing app.
