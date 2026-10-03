# Stripe Connect and Nota subscriptions

Nota has two separate payment flows:

- A workspace's client pays its invoice directly into that workspace's Standard Stripe account. The merchant pays processing fees. Nota sets no application fee and does not receive or transfer those funds.
- A workspace pays Nota for Pro using Checkout subscriptions on Nota's platform account. Prices are USD 9 monthly or USD 90 annually. Nota pays the Stripe fees for its own subscriptions.

## Configure each environment

Use an isolated database and Stripe sandbox for previews. Never deploy a preview against the production database. Do not copy another product's Stripe key into Nota.

1. Enable Connect for a SaaS platform with direct charges, full Stripe Dashboard access, merchant-paid processing fees, and Stripe responsibility for connected-account negative balances.
2. Enable OAuth for Standard accounts. Add the exact `${APP_URL}/api/stripe/connect/callback` redirect URI and set `STRIPE_CONNECT_CLIENT_ID`.
3. Set `STRIPE_MODE=connect` and `STRIPE_SECRET_KEY` to that environment's Nota platform key.
4. Create Nota Pro recurring prices: USD 900 cents monthly and USD 9000 cents annually. Set `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY`.
5. Configure the default customer portal for payment-method updates, invoice history and cancellation at period end. The app uses that default configuration.
6. Create the webhook endpoints below and save their distinct signing secrets. Exempt those endpoints from any preview authentication using an approved deployment-protection mechanism; they must be reachable by Stripe.

| Endpoint                                                  | Events                                                                                                                                                                      | Environment variable            |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `/api/webhooks/stripe` (platform events)                  | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` | `STRIPE_WEBHOOK_SECRET`         |
| `/api/webhooks/stripe-connect` (connected-account events) | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `account.updated`, `account.application.deauthorized`                                             | `STRIPE_CONNECT_WEBHOOK_SECRET` |

Use snapshot events compatible with the installed Stripe SDK. Payment matching requires the stored invoice ID, payment link, issuing account, amount, currency, and paid status. Duplicate payment events produce one paid activity and email job. Subscription events fetch current Stripe state, so delivery order cannot restore a cancelled plan.

## Live activation

Complete Stripe's legal-entity, representative, bank and service-agreement requirements with the account owner's verified information. Confirm the public name, support contacts, website, and statement descriptor belong to Nota.

Confirm whether advertised subscription prices include tax, the business's tax registrations, and the intended Stripe Tax configuration before accepting live subscription payments. The current Checkout integration collects billing addresses and tax IDs; it does **not** enable automatic tax calculation. Tax collection needs its own verified configuration before live billing.

## Migration and rollback

Apply migrations `0009` through `0011` to the isolated preview first. They add workspace billing state, invoice account snapshots, OAuth states, event deduplication and a send-usage ledger. The ledger backfill counts invoices with a recorded sent activity, using the original send month. It keeps usage after an invoice is deleted.

Before applying to production, run read-only checks:

```sql
SELECT stripe_customer_id, count(*) FROM orgs
WHERE stripe_customer_id IS NOT NULL
GROUP BY stripe_customer_id HAVING count(*) > 1;

SELECT status, count(*) FROM invoices
WHERE stripe_payment_link_id IS NOT NULL GROUP BY status;
```

Resolve duplicate customer IDs before the new unique constraint. Inventory old platform payment links before changing account keys. Existing links are not rewritten or disabled automatically. The new `invoices.stripe_account_id` captures the issuing account for future links; old links retain NULL.

After migration:

```sql
SELECT count(*) FROM invoices i
WHERE EXISTS (SELECT 1 FROM activity_log a WHERE a.invoice_id=i.id AND a.action='sent')
AND NOT EXISTS (SELECT 1 FROM invoice_sends s WHERE s.invoice_id=i.id);
```

Expected result: zero. Keep a database backup before the production rollout. The schema changes are additive; leave the new tables/columns in place during a code rollback. The previous application sends payments through one platform account, so reverting to it is **not** a safe routing rollback for hosted customers: pause invoice sending and billing actions until the Connect-capable release is restored. Never set hosted production to `direct` to work around a Connect outage.

## Validation

Run the web unit suite and typecheck. The payment integration suite uses a disposable local Postgres database on port 55439 and refuses remote databases:

```bash
DATABASE_URL=postgresql://nota@127.0.0.1:55439/postgres bun test tests/integration/stripe-billing.test.ts
```

Before live enablement, verify sandbox onboarding, two merchants' separate payment links, a paid invoice and duplicate webhook, bank-only sending, five concurrent Free sends, Pro upgrade, billing portal, cancellation, and disconnect/reconnect. Verify webhook delivery responses in Stripe and inspect the resulting application state. Test email jobs with delivery disabled or a test inbox.
