# Nota: invoicing product review

Reviewed September 30, 2026. Scope: repository implementation and the reported workflows; no live invoices, payments, or customer emails were changed during verification.

## What is already here

Nota has organization workspaces, roles and invitations, clients, bank accounts, invoice numbering, draft/sent/paid/overdue/cancelled states, PDF and XRechnung generation, Stripe payment links, email jobs and reminders, activity history, invoice analytics, ZIP downloads, a REST API, CLI, and AI chat. This is a useful invoicing foundation.

## Product philosophy

The [new landing page](https://nota.wtf) defines Nota as a focused way to create invoices and get paid, through chat, connected assistants, the CLI, and the API. Product work should remove invoicing steps, preserve trustworthy documents and payment records, and keep the four entry points consistent. Competing with FreshBooks means making this invoicing workflow easier to use; feature-for-feature accounting parity is not the goal.

Excluded from the roadmap: time tracking, expense management, payroll, project management, proposals/e-signatures, and a larger analytics dashboard. Existing invoice data can answer practical questions in chat without growing a reporting suite. A clean payment page and receipts serve the invoice; a full client portal is unnecessary at this stage.

CSV migration fits: the user already has the data, and asking them to retype it defeats the chat-first promise. Start with client exports, automatic column matching, a concise review, and one explicit import action. Retain invoice-history import as later migration work, preserving original numbers/statuses and never sending historical invoices.

## Implemented in this branch

- Repeat-service chat requests can inspect the client's invoice history, prefer finalized invoices over drafts, and use a separate service month. Copying July services for September updates the description while preserving quantities and rates. Issue and due dates remain separate.
- Assistant answers render Markdown with safe links, lists, tables, and emphasis.
- Short numeric invoice references resolve to padded numbers. Ambiguous suffixes fail with an explicit request for the full number.
- Due-date updates use one shared service with role checks, date validation, optimistic concurrency, a transaction, and an activity entry. Other invoice fields remain intact; paid and cancelled invoices cannot be changed.
- PDF and XML filenames use `buildInvoiceFilename` across web downloads, API, ZIP entries, and email attachments. SDK, CLI, and MCP preserve the server filename. Example: `0000099-ranger-september.pdf` and `.xml`.
- Filename rules: preserve the invoice number, use the first normalized customer-name token, then the common service month found at the end of line item descriptions. When a common month cannot be found, use the ISO issue date. Lowercase, hyphens, accent normalization, no unsafe path characters. Invoice numbers provide uniqueness. This deliberately avoids AI-generated filenames or a new naming-settings system.
- Remote OAuth MCP with encrypted persistent credential storage, PKCE, refresh rotation, revocation, and per-connection organization authorization. Local stdio still works.
- Standard MCP Apps cards for overview, browsing, filtering, invoice detail, PDF/XML download, and requesting sending through the host conversation. Text results remain available to hosts without cards.
- Client CSV migration in chat via the paperclip or drag-and-drop, with matched columns, billing details, duplicate/invalid-row explanations, and explicit import. The API, SDK, CLI, and MCP use the same preview/import service. Client imports preserve existing records and do not create invoices or send mail.
- In-app chat defaults to Sonnet 5.5 with adaptive thinking at low effort. Live fixture evaluations cover recurring September services and a due-date change using invoice number `97`, including rejection of unrelated mutations.

History means stored invoices; Nota does not currently read the customer's mailbox. These fixes do not retroactively edit existing July descriptions or rename already downloaded files.

## Prioritized remaining work

| Priority | Work                             | Scope and acceptance target                                                                                                                                                                                                                                                    |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0       | Trustworthy payment recording    | Validate paid status, amount, currency, invoice/session linkage, and async outcomes in the Stripe webhook. Apply payment and activity updates idempotently in one transaction. Replayed or unpaid events must not mark invoices paid.                                          |
| P0       | Immutable issued documents       | Freeze seller/buyer/tax/bank details and issued PDF/XML. Updating a client's address must not rewrite an old invoice.                                                                                                                                                          |
| P0       | Exact invoice money              | Replace floating-point totals with decimal arithmetic or validated minor units; handle rounding and currency exponents consistently across invoices, XML, and Stripe.                                                                                                          |
| P0       | Invoice corrections and balances | Support partial payments, refunds, and linked credit notes while preserving the original invoice. Keep this scoped to invoice balances and receipts.                                                                                                                           |
| P1       | Easy migration through chat      | Client CSV upload, automatic matching, preview, duplicate detection, and explicit import are implemented. Next, test real FreshBooks exports and add invoice-history import with preserved provenance. No imported invoice may automatically send an email or charge a client. |
| P1       | Dependable collection automation | Add recurring invoice drafts and optional reminders with pause/review controls. Make schedules, retries, and email delivery observable without requiring a new management dashboard. Prevent duplicate creation and sending.                                                   |
| P1       | Documents accountants can use    | Store service periods explicitly; validate XRechnung with the target profile and representative fixtures. Add concise CSV/accountant exports and receipts when needed. Keep currencies separate.                                                                               |
| P1       | Four consistent ways in          | Keep in-app chat, MCP, CLI, and API capabilities aligned. Finish real Claude/ChatGPT OAuth/card tests, use a branded domain, and prepare the plugin listing. Maintain invoice-specific model evaluations, modest reasoning, and useful errors.                                 |
| P1       | Simple, reliable hosted service  | Strengthen sessions, API keys, authorization, job monitoring, backups/restore, and merchant payment routing. Match the landing page's free/paid volume limits without feature gating or seat-based pricing.                                                                    |

The excluded accounting-suite features are deliberate product boundaries, not missing requirements. The previous assessment's estimates, broad client portal, time/expense/project tracking, and expanded analytics suggestions have been removed to match this direction.

These are product priorities, not changes made to production in this branch. Payment and issued-document integrity should precede a broad commercial launch. The CSV/client import and model change are the implemented migration improvements; the other priorities remain planned work.

## Verification and deployment

All 119 unit/protocol tests pass, along with the full monorepo static check and the web production build. Eighteen existing formatting failures were corrected mechanically to satisfy CI; migration snapshot and journal JSON are semantically unchanged. Browser checks exercised desktop/mobile cards, light/dark themes, downloads, filtering, send requests, and rejection of stale responses in a simulated MCP Apps host. Two additional browser tests mount the actual chat UI and styles with fixture HTTP, exercising CSV preview, row details, explicit import, duplicate-click protection, stale previews, and invalid files on desktop and mobile. Live model evaluations used fixture-only tool executors.

CSV tests use representative FreshBooks-style fixtures, not a customer-provided export. HTTP tests execute the real import handler/service/parser with a simulated transactional database; they do not constitute a live PostgreSQL integration test. Invoice-history CSV import remains future work.

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

The in-app chat now defaults to **Claude Sonnet 5.5** (`claude-sonnet-5-5`) with adaptive thinking at **low effort**, following the user's selection. `NOTA_CHAT_MODEL` still supports an explicit model override; Sonnet-specific options are applied only to this model. Update self-hosted environment overrides if they still select 4.5. This coding conversation runs in Codex, based on GPT-6; changing the app model does not change the model serving this session.

Before switching, both Sonnet 4.5 and Sonnet 5.5 low effort passed live fixture-only evaluations of the two reported prompts. A few runs do not establish a best model. The choice favors a capable tool user with modest reasoning rather than a separate routing framework. [Sonnet 5.5 documentation](https://platform.claude.com/docs/en/models/sonnet-5-5/overview).

Reproduce the live evaluation from `apps/web` with `bun --env-file=../../.env run eval:chat`. The evaluation now defaults to Sonnet 5.5 low effort; `NOTA_EVAL_MODEL` and `NOTA_EVAL_EFFORT` allow comparisons. The script replaces every tool executor with fixtures. It uses the configured Anthropic API key and incurs model usage, but cannot create real invoices or send mail. It is deliberately separate from the ordinary test suite.

I could not verify an OpenAI product called “Decisions API.” If the intended reference is **Responses API**, it is useful for an OpenAI provider, function calling, multi-step context, and remote MCP. It is not required for these fixes. Start with low reasoning for tool workflows, then benchmark lower effort where the model supports it. MCP host models are chosen by Claude/ChatGPT, independently of Nota's internal chat model. [Responses migration](https://developers.openai.com/api/docs/guides/migrate-to-responses), [Reasoning effort](https://developers.openai.com/api/docs/guides/reasoning).
