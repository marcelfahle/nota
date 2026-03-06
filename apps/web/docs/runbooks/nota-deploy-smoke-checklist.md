---
title: nota Deploy Smoke Checklist
type: runbook
status: active
date: 2026-03-06
---

# nota Deploy Smoke Checklist

Use this after a production deploy, after rotating Stripe or Resend credentials, or before trusting the app for real invoicing.

## Preflight

- Confirm the deploy is on the expected commit.
- Confirm `DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`, and `CRON_SECRET` are set.
- Confirm Drizzle migrations have been applied.
- Confirm the owner account can sign in.

## Auth

- Open `/login`.
- Sign in with the owner email.
- Confirm dashboard routes load.
- Open a second browser session without cookies and confirm `/invoices` redirects to `/login`.

## Invoice Create Flow

- Create a test client.
- Create a draft invoice with one line item.
- Confirm the draft appears in `/invoices`.
- Confirm the invoice detail page shows `draft`.

## Send Flow

- Send the draft invoice through the app.
- Confirm invoice status becomes `sent`.
- Confirm the bottom dock shows a payment link ID and URL.
- Download the PDF and confirm the header branding looks correct.
- Confirm the invoice email arrives with the PDF attached and a working payment link.

## Webhook / Payment Flow

- Complete payment through the Stripe payment link in test mode.
- Confirm Stripe delivers `checkout.session.completed` successfully.
- Confirm the invoice changes to `paid`.
- Confirm a single `paid` activity log entry is present.
- Confirm only one payment-received email is sent to the owner on replayed webhook delivery.

## Overdue Cron

- Create or edit a sent invoice with a due date in the past.
- Trigger `/api/cron/overdue` with `Authorization: Bearer $CRON_SECRET`.
- Confirm the invoice changes to `overdue`.
- Confirm an overdue activity entry is added.

## Email Job Worker

- Send an invoice and confirm a `send_invoice_email` job is created and completed.
- Trigger `/api/cron/jobs` with `Authorization: Bearer $CRON_SECRET`.
- Confirm pending jobs move to `completed`, or to retry state with `last_error` if delivery fails.
- Trigger the route again and confirm retried jobs continue to drain.
- Confirm dead jobs appear in the bottom dock with their latest error.

## Lifecycle Safety

- Confirm draft invoices can be edited and deleted.
- Confirm sent invoices can no longer be edited.
- Confirm paid invoices cannot be cancelled.
- Confirm cancelling a sent invoice moves it to `cancelled`.
- If cancellation warns about Stripe cleanup, disable the payment link manually in Stripe and retry the scenario.

## Branding

- Confirm the app header shows the configured logo.
- Confirm the generated invoice PDF shows the configured logo or falls back cleanly if the logo URL is broken.

## If Anything Fails

- Check Vercel function logs for the failing route.
- Check Stripe event delivery logs for webhook failures.
- Check Resend activity for outbound email failures.
- Confirm the internal dock matches the invoice state in the database.
