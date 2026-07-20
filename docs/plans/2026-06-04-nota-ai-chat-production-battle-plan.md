---
date: 2026-06-04
topic: nota-ai-chat-production
---

# Nota AI Chat Production Battle Plan

## Goal

Make Nota feel like an invoicing operator, not a form with a chatbot attached. The chat should reliably turn messy human intent into correct drafts, edits, sends, reminders, and follow-up work with the same authority as the UI.

## What Was Fixed First

- `create_invoice` now accepts flat totals like "for 1000" through `totalAmount`.
- Requests like "for May" can resolve to the end of that invoice month with a due date based on the issue date.
- Requests like "same as last time" can reuse the latest invoice structure for the resolved client.
- Missing amount/line item and ambiguous client cases now return normal clarification output instead of red tool errors.
- Client matching now prefers literal client-name matches over company/contact-field matches.

## Product Principles

- The assistant must never throw user-correctable validation as a tool failure. It should ask for the missing piece or show options.
- Every UI action needs an agent capability: create, edit, send, remind, mark paid, cancel, duplicate, client management, settings, and invoice export.
- Drafting is low-risk and can happen immediately. Sending, deleting, payment-link creation, and external emails need explicit confirmation.
- Voice should feel first-class: short dictation in, structured invoice preview out, one confirmation to create or send.

## Near-Term Reliability Work

1. Add an agent regression suite with real user prompts:
   - "another invoice for Ranger, like the last ones, for 1000, for May"
   - "send the one I just made"
   - "make that 1200 instead"
   - "use the German reverse charge wording"
   - "who still owes me money?"
2. Log each chat request, tool call, tool result, and clarification reason. Use this to find failed intents.
3. Turn every tool's user-fixable errors into structured `needs-input` results.
4. Add tool previews for mutations: assistant proposes the exact invoice/client/action before irreversible work.
5. Add a capability map in docs and keep it updated when UI or tools change.

## AI Chat Tool Expansion

- `update_invoice`: edit client, amount, line items, tax, dates, notes, reverse charge, bank account, and payment terms.
- `preview_invoice`: show a draft without committing it, useful for voice and uncertain requests.
- `create_from_previous_invoice`: explicit repeat-invoice tool with amount/month overrides.
- `bulk_create_invoices`: "create May retainers for all active clients."
- `reconcile_payments`: ingest bank/payment exports and suggest paid matches.
- `collections_copilot`: summarize overdue invoices, draft reminders, escalate repeated non-payment.
- `client_memory`: aliases, preferred invoice wording, default line items, tax treatment, PO requirements, billing contacts.
- `explain_invoice`: answer "why is this total 1190?" or "what changed from last month?"
- `schedule_work`: recurring monthly invoices, reminder cadence, and end-of-month checklists.

## Voice Flow

1. User says: "Invoice Ranger for May, same as last time, one thousand euros."
2. Nota extracts: client, month, amount, copied template, tax, currency, due date.
3. Nota shows a compact preview with client, invoice date, due date, line item, tax, total.
4. User says "create it" or "send it."
5. Nota creates the draft, then requires explicit confirmation before sending.
6. Nota learns aliases and defaults from corrections, e.g. "when I say Ranger, use Ranger Marketing & Vertriebs GmbH."

## Production/Auth Plan

- Move auth to Clerk for the web app, using `@clerk/nextjs`, `ClerkProvider`, `clerkMiddleware`, and server helpers like `auth()` / `currentUser()`.
- Keep Nota's `users`, `orgs`, and `org_members` tables as the product authorization model. Store Clerk IDs on local records and map Clerk sessions to local org context.
- Migrate current custom session-cookie login gradually: add Clerk sign-in/register routes, create/link local users on first Clerk login, then remove password/session-cookie paths after data migration.
- Keep API keys separate from Clerk browser sessions. API auth remains bearer-token based for the CLI, MCP, and integrations.
- Before launch: backups, migration rollback, rate limiting, audit logs, email deliverability, Stripe webhook checks, cron/job monitoring, and smoke tests for create/send/pay/remind flows.

## Wild But Worth Building

- "End-of-month autopilot": Nota asks one question, then prepares all recurring invoices.
- "Inbox-to-invoice": forward a contract, email thread, or timesheet and let Nota draft the invoice.
- "Client negotiation memory": remembers how each client likes invoices phrased and when they usually pay.
- "Revenue radar": predicts cash gaps from open invoices and likely payment behavior.
- "Boardroom mode": one spoken prompt returns MRR-ish cashflow, overdue exposure, clients at risk, and next actions.
