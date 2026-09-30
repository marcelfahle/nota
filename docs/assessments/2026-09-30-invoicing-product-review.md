# Nota: invoicing product review

Reviewed September 30, 2026. Scope: repository implementation and the reported workflows; no live invoices, payments, or customer emails were changed during verification.

## What is already here

Nota has organization workspaces, roles and invitations, clients, bank accounts, invoice numbering, draft/sent/paid/overdue/cancelled states, PDF and XRechnung generation, Stripe payment links, email jobs and reminders, activity history, invoice analytics, ZIP downloads, a REST API, CLI, and AI chat. This is a useful invoicing foundation.

FreshBooks also offers recurring invoices, estimates, credits, retainers, expenses, bills, vendors, bank connections, and time tracking. Competing with its invoicing workflow is a practical target; matching the whole accounting suite is a substantially larger product. [FreshBooks dashboard documentation](https://support.freshbooks.com/hc/en-us/articles/115015407988-How-do-I-use-my-dashboard).

## Implemented in this branch

- Repeat-service chat requests can inspect the client's invoice history, prefer finalized invoices over drafts, and use a separate service month. Copying July services for September updates the description while preserving quantities and rates. Issue and due dates remain separate.
- Assistant answers render Markdown with safe links, lists, tables, and emphasis.
- Short numeric invoice references resolve to padded numbers. Ambiguous suffixes fail with an explicit request for the full number.
- Due-date updates use one shared service with role checks, date validation, optimistic concurrency, a transaction, and an activity entry. Other invoice fields remain intact; paid and cancelled invoices cannot be changed.
- PDF and XML filenames use `buildInvoiceFilename` across web downloads, API, ZIP entries, and email attachments. SDK, CLI, and MCP preserve the server filename. Example: `0000099-ranger-september.pdf` and `.xml`.
- Filename rules: preserve the invoice number, use the first normalized customer-name token, then the common service month found at the end of line item descriptions. When a common month cannot be found, use the ISO issue date. Lowercase, hyphens, accent normalization, no unsafe path characters. Invoice numbers provide uniqueness. This deliberately avoids AI-generated filenames or a new naming-settings system.
- Remote OAuth MCP with encrypted persistent credential storage, PKCE, refresh rotation, revocation, and per-connection organization authorization. Local stdio still works.
- Standard MCP Apps cards for overview, browsing, filtering, invoice detail, PDF/XML download, and requesting sending through the host conversation. Text results remain available to hosts without cards.

History means stored invoices; Nota does not currently read the customer's mailbox. These fixes do not retroactively edit existing July descriptions or rename already downloaded files.

## Prioritized remaining work

| Priority | Work | Repository evidence and acceptance target |
| --- | --- | --- |
| P0 | Make payment recording trustworthy | `apps/web/src/app/api/webhooks/stripe/route.ts` marks invoices paid on Checkout completion. Verify paid status, amount, currency, invoice linkage, asynchronous success/failure, and cancelled invoices; make payment recording and activity idempotent and transactional. Replayed or unpaid events must not mark an invoice paid. |
| P0 | Freeze issued invoice documents | PDF/XML use current organization, client, and bank records. Snapshot seller/buyer/tax/bank details and immutable issued documents. Changing a client address must not rewrite last year's invoice. |
| P0 | Use exact money and currency rules | `invoice-service.ts` calculates totals with JavaScript numbers; `stripe.ts` uses two-decimal conversion. Adopt decimal arithmetic or validated minor units, explicit rounding, and currency exponent rules. Invoice totals, XML, and Stripe charges must agree. |
| P0 | Build a payment ledger and credit notes | Current status and paid timestamp are insufficient for partial payments, refunds, overpayments, deposits, and corrections. Record individual payments, balances, and linked credit notes; preserve the original issued invoice. |
| P1 | Recurring invoices and collection automation | Add schedules, review-before-send settings, reminders, retry handling, and pause controls. Current cron and email queue are useful infrastructure, but not a recurring billing workflow. Prevent duplicate creation and sending after retries. |
| P1 | Structured service periods and validated e-invoices | Store service dates explicitly rather than inferring descriptions. Validate XRechnung against the target profile with representative fixtures and a validator. Add jurisdiction-specific issuance/correction rules before advertising compliance. Generating XML alone does not prove compliance. |
| P1 | Bookkeeping exports and reconciliation | Add accountant-friendly CSV exports, payment reconciliation, aged receivables, and integrations selected for actual customer demand, such as DATEV. Keep currency totals separate. Existing analytics and PDF archives are a start. |
| P1 | Client payment experience | Add a secure client portal for invoices, history, documents, payment status, and receipts. For a multi-company commercial product, decide merchant onboarding and Stripe Connect routing; one platform secret is not a complete merchant model. |
| P1 | Estimates to invoices | Create estimates, approval, conversion, deposits, and reusable products/services. Preserve provenance so quoted and billed work can be reconciled. |
| P1 | Commercial security and operations | Add expiring/revocable sessions, scoped/expiring API keys, auth abuse protection, workspace switching, reliable job monitoring, and restore drills. Current roles, org scoping, invite flow, and queue should be extended rather than replaced. |
| P1 | AI quality gates and marketplace release | Evaluate month changes, ambiguous clients, short numbers, date rollover, permission failures, and hostile notes. Measure tool accuracy, latency, and cost. The remote MCP host is deployed; test real Claude/ChatGPT cards and OAuth, then prepare marketplace evidence and submission. |
| P2 | Broader FreshBooks coverage | Add time/project tracking, expenses, receipt capture, bank feeds, and mobile workflows when customers need them. Avoid delaying dependable invoicing to imitate every accounting feature. |

These are product priorities, not changes made to production in this branch. Payment and issued-document integrity should precede a broad commercial launch.

## Verification and deployment

All 113 unit/protocol tests pass, along with the full monorepo static check and the web production build. Eighteen existing formatting failures were corrected mechanically to satisfy CI; migration snapshot and journal JSON are semantically unchanged. Browser checks exercised desktop/mobile cards, light/dark themes, downloads, filtering, send requests, and rejection of stale responses in a simulated MCP Apps host. Live model evaluations used fixture-only tool executors.

The web changes are live at `https://nota-weld.vercel.app`; the remote MCP is healthy over HTTPS on Hetzner. The user's actual Claude/ChatGPT connection, host-native cards, and host-native downloads still require OAuth consent with a dedicated Nota API key. No real invoice mutations or customer emails were used as tests. Code review was a sequential self-review under the supplied AGENTS instructions, without an independent reviewer.

## OpenAI plugins: useful for Nota

OpenAI's current documentation describes portable plugins, a directory spanning ChatGPT and Codex, MCP connections, skills, and interactive UI through MCP Apps. This is a useful distribution path for Nota. The same standard card resource can serve Claude and ChatGPT; Nota does not need two separate invoice UIs. [Plugin overview](https://developers.openai.com/plugins), [ChatGPT UI](https://developers.openai.com/plugins/build/chatgpt-ui), [MCP Apps SDK](https://apps.extensions.modelcontextprotocol.io/api/).

The official DevDay site dates the 2026 event to September 29. I verified the current plugin documentation; I did not independently verify that this exact plugin program was first announced at that event. [DevDay](https://devday.openai.com/).

Recommended sequence:

1. The OAuth MCP is now hosted on the existing Bold Hetzner server, in its own container and persistent volume. Initial endpoint: `https://nota-mcp.91-99-49-152.sslip.io/mcp`; use `apps/mcp/README.md` to connect. Adopt a branded domain before directory submission.
2. Test privately in Claude and ChatGPT Developer Mode with a dedicated test workspace. Check OAuth reconnect/revoke, card rendering, downloads, permissions, and explicit sending.
3. Package `plugin.json`, typed `mcp.json`, and a short invoicing workflow skill. Use the documented portable schema; keep credentials out of the package.
4. Prepare the verified developer account, domain challenge, demo video, test workspace, and positive/negative test cases. Submit and publish only after review.

Public directory publication requires developer/account/domain steps and review. No listing is published, and the user's accounts still require their OAuth consent. [Build plugins](https://developers.openai.com/plugins/build/plugins), [Submission requirements](https://developers.openai.com/plugins/deploy/submission).

## Model choice

The in-app chat uses Anthropic through the AI SDK. `apps/web/src/lib/env.ts` defaults to `claude-sonnet-4-5`; neither inspected local environment file overrides `NOTA_CHAT_MODEL`. The Vercel production environment list also has no model override. Extended thinking is not explicitly enabled. This coding conversation runs in Codex, based on GPT-6; the exact serving variant is not exposed.

The key task is choosing correct tools and interpreting invoice history. Use modest reasoning plus explicit schemas and server validation. My first upgrade candidate is Sonnet 5.5 with low effort. Both it and the current Sonnet 4.5 passed live evaluations of the user's two exact prompts with mocked tools, without touching real invoices. A few runs are too small to establish a best model: creation took about 6.9–7.7s/7.5s and due-date editing 2.7–3.0s/2.3s for 4.5/5.5 respectively. The default remains unchanged. Consider a faster cheaper model only after it passes a broader set of invoice cases. The current Anthropic documentation lists Sonnet 5.5 with effort support and Haiku 4.5 as a fast cheaper model; its retirement timing also needs checking before adopting it. [Anthropic model overview](https://platform.claude.com/docs/en/models/overview).

Reproduce the live evaluation from `apps/web` with `bun --env-file=../../.env run eval:chat`. To test the candidate, set `NOTA_EVAL_MODEL=claude-sonnet-5-5 NOTA_EVAL_EFFORT=low`. The script replaces every tool executor with fixtures. It uses the configured Anthropic API key and incurs model usage, but cannot create real invoices or send mail. It is deliberately separate from the ordinary test suite.

I could not verify an OpenAI product called “Decisions API.” If the intended reference is **Responses API**, it is useful for an OpenAI provider, function calling, multi-step context, and remote MCP. It is not required for these fixes. Start with low reasoning for tool workflows, then benchmark lower effort where the model supports it. MCP host models are chosen by Claude/ChatGPT, independently of Nota's internal chat model. [Responses migration](https://developers.openai.com/api/docs/guides/migrate-to-responses), [Reasoning effort](https://developers.openai.com/api/docs/guides/reasoning).
