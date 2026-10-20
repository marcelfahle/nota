# What Nota can learn from Helo

Checked 2026-10-05 against public documentation and an actual local integration.
This is a developer/agent usability audit, not a search-ranking study or a
benchmark across different LLMs.

## What worked

| Helo surface | Observed result | Nota action |
| --- | --- | --- |
| `docs.helohq.com/llms.txt` | HTTP 200, plain text, 11,457 characters; links and descriptions make relevant topics easy to find | Add a small public index on the canonical marketing domain |
| `docs.helohq.com/llms-full.txt` | HTTP 200, plain text, 132,376 characters | Add a compact full reference; generate larger bundles from source later |
| Markdown docs | `.md` pages expose headings, examples, failure behavior and source links without UI navigation | Add a Markdown quickstart with a read-only first API call |
| `docs.helohq.com/openapi.json` | HTTP 200, OpenAPI 3.1.0, 25 paths | Ticket a complete Nota contract with executable example checks |
| Credential permissions | Channel-scoped transactional-only credential available | Use least-privilege credential for Nota's current integration |
| Sandbox | Documented API-compatible non-delivery channel | Ticket isolated agent/developer fixtures, tied to staging |
| Activity, statuses and errors | Docs distinguish accepted, delayed, failed, suppressed, and delivered | Tighten local acknowledgement validation; ticket persistent delivery ledger |
| Product site | Crawlable product/pricing/about pages, canonical URL, robots/sitemap, WebSite/SoftwareApplication/Organization data | Build useful integration guides and measure signup/activation |

Our web-fetch tool failed on several Helo pages, but normal unauthenticated HTTP
fetches succeeded. Raw Markdown and schema downloads let the integration continue.
That is a useful resilience benefit; it does not prove every agent can access them.

## What not to copy blindly

- Narrative transactional examples use a string `from`; the generated schema uses
  a `{ email, name }` object. SDK method names differ across examples too. Use a
  single tested contract in Nota and execute snippets in CI.
- The transactional narrative documents `status: failed` inside responses. HTTP
  status alone is insufficient. Nota now accepts only `accepted` or `delayed`
  acknowledgements with a valid message ID.
- Helo's idempotency window is one hour and requires the same body. A stable key
  alone does not make long-lived invoice jobs exactly-once. Snapshot content and
  reconcile delivery; see NOTA-35.
- An API acknowledgement is not proof of inbox placement. Record both separately.
- No documented visual drip builder was found. Use Helo for delivery, with
  scheduling and behavior conditions in Nota (or evaluate an orchestration tool
  when nontechnical campaign editing becomes necessary).

## Small changes prepared locally

In `../payme-lp/amp`: `public/llms.txt`, `public/llms-full.txt`,
`public/docs/getting-started.md`, and the footer's real Docs link. The quickstart
documents `/api/v1/me`, workspace verification, remote MCP, action boundaries and
unpublished CLI status. It includes no customer data, credentials or recovery URLs.

At the live baseline, `www.withnota.com/llms.txt` returned 404, while the same path
on the app redirected to login. The new marketing resources are not deployed yet.
The app's authentication boundaries have not been opened for this docs change.

## Longer work in Linear

- [NOTA-42: Signup sequence](https://linear.app/boldvideo/issue/NOTA-42): welcome, conditional first-invoice help, agent connection tip, then a help email. Stop irrelevant steps and honor marketing preferences.
- [NOTA-43: Developer docs and OpenAPI](https://linear.app/boldvideo/issue/NOTA-43): generated Markdown/indexes and tested examples.
- [NOTA-44: Search discovery](https://linear.app/boldvideo/issue/NOTA-44): useful guides, canonical/indexing checks and conversion evidence.
- [NOTA-45: Agent sandbox](https://linear.app/boldvideo/issue/NOTA-45): safe reproducible workflows with no live side effects.
- [NOTA-35: Email delivery](https://linear.app/boldvideo/issue/NOTA-35): expanded with provider IDs, immutable payloads, webhook reconciliation and reply-to.
- [NOTA-40: PostHog delivery events](https://linear.app/boldvideo/issue/NOTA-40): updated from the retired Resend setup to Helo.
- [NOTA-46: All-inclusive pricing](https://linear.app/boldvideo/issue/NOTA-46): compare 6 and 9 while retaining one price for the full product and AI. Evaluate blended costs and absorb occasional outliers; premium workflows and usage billing are outside the chosen model.

## Verification

The marketing site's lint and production build pass. A local production server
returns HTTP 200 for both text files and the Markdown quickstart, with
`text/plain` and `text/markdown` content types. The rendered homepage links to
the quickstart. No deployment was performed.

Two controlled Helo messages reached the requested Gmail inbox: an invoice PDF
sample and a reminder sample. Gmail confirms SPF/DKIM passes on the invoice and
the attachment was readable. See [email inventory](runbooks/email-inventory.md)
for timestamps, message IDs, failed attempts and verification limits.

## Search is a separate concern

The purpose of llms.txt is reliable retrieval by interested agents. Do not claim
that it improves rankings or guarantees citations. Google says its AI search
features require no special AI text file or schema; crawlability, useful content,
accurate structured data, indexing and ordinary SEO remain the relevant work.
Existing Nota canonical/FAQ/robots/sitemap work should be preserved.

## Sources

- https://docs.helohq.com/llms.txt
- https://docs.helohq.com/llms-full.txt
- https://docs.helohq.com/openapi.json
- https://docs.helohq.com/core/sending-transactional
- https://docs.helohq.com/core/sending-broadcasts
- https://docs.helohq.com/core/channels-sandbox
- https://www.helohq.com/robots.txt
- https://www.helohq.com/sitemap.xml
- https://developers.google.com/search/docs/appearance/ai-features
