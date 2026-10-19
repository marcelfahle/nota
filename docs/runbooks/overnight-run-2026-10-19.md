# Overnight run, 19 to 20 October 2026

Everything below is on branches and draft PRs. Nothing was merged to main, nothing was deployed,
no email left the machine, the production database was never touched. Decisions you made before
bed: du in the app, neutral documents, branches and draft PRs allowed, legal entity No Rules
Software SL, Kleinunternehmer text per § 19 UStG.

## Start here

1. Pull. Main is unchanged. Your old dirty working tree is preserved on `wip/main-working-tree-20261019`
   (it was an older snapshot of PR #55; nothing in it is missing from #55).
2. The one branch that has everything German: `mfahle/german-core`, draft PR #65. It stacks on #55.
   Check it out, `bun install`, point `apps/web/.env.local` at a fresh local database, run
   `bun run --cwd apps/web db:migrate` and `db:seed`, and walk through it as a German workspace.
3. Local dev on german-core needs `STORAGE=local` and `LOCAL_STORAGE_PATH` in `.env.local` (see `.env.example`), or issuing fails because the Blob token is missing. The issuance catch block now logs the real cause.
4. #66 and #67 appear as "merged" on GitHub because their base branch `mfahle/german-core` received their commits when I pushed the integration merges. Nothing reached main. Their diffs are still readable there.
5. Review order that reads well: #55 (already yours) → #59 → #60 → #62 → #61 → #63 → #64 → #66 → #67, or just #65 for the German set.

## What landed

| PR | Branch | What | Base | Status |
| --- | --- | --- | --- | --- |
| #55 | release/cli-helo-merged-updates | CLI OAuth + Helo email (yours). Merged with main, pushed. | main | CI green |
| #59 | mfahle/nota-2-oss-ready | NOTA-2: LICENSEs (No Rules Software SL), README, SECURITY, CODE_OF_CONDUCT, package metadata, .gitignore | #55 | CI green |
| #60 | mfahle/chat-language-de-format | Chat answers in the user's language; `orgLocale`, `formatCurrency/Date/Number` with de-DE | #55 | CI green |
| #61 | mfahle/nota-54-german-invoice-model | NOTA-54: tax treatments (standard, zero-rated, § 19, § 13b), service period, buyer reference / Leitweg-ID, structured addresses, seller contact, one compliance module for web/API/SDK/MCP/CLI/chat | #55 | CI green |
| #62 | mfahle/super-admin-support-tools | Super admin: lookup by email, read-only "view as owner" (signed cookie, 30 min, method guard in proxy), audit log table and page | #55 | CI green |
| #63 | mfahle/nota-55-kosit-validation | NOTA-55: official KoSIT validator 1.6.3 + XRechnung 3.0.2 (2026-08-31) in CI, 7 fixtures, 0 errors, 0 warnings; mod-97 IBAN check | #61 | CI green |
| #64 | mfahle/nota-56-einvoice-email | NOTA-56: `eInvoiceDelivery` setting, PDF + XML attached to invoice emails, send refuses incomplete documents, public XML download | #61 | CI green |
| #65 | mfahle/german-core | Integration of #61 + #63 + #64 + #60 + #67 + #66, head 496f8fb. Migrations 0023 to 0026 in sequence. 321/26/8 tests, validator 7/7, browser regressions pass. | #55 | CI green |
| #66 | mfahle/nota-57-frozen-originals | NOTA-57: `issued_snapshot`, `invoice_documents`, stored PDF/XML originals served byte-for-byte, history with hashes, credit note links | #65 | CI green; GitHub shows it as merged into german-core (auto-closed when I pushed the merge) |
| #67 | mfahle/nota-58-german-localization | NOTA-58: next-intl, 947 German strings, user UI locale + org document locale + per-invoice document locale, PDF/public/emails/app in German. Includes #60. | #65 | Its own run failed on the browser fixture tests (chat panel mounted without the next-intl provider); the one-file fix e3d2f50 is in #65, which is green. GitHub shows #67 as merged into german-core. |

## Verified

- Unit tests green on every branch at hand-off (web 243 → 303 depending on branch, CLI 26, MCP 8).
- KoSIT: I ran the official validator myself on the NOTA-54 samples (accepted) and the integration branch (7/7 accepted, 0 warnings).
- Frozen originals: I hashed the worker's before/after downloads myself: PDF and XML identical after the client address, workspace address and IBAN changed.
- Screenshots for every UI change are in `/Users/mf/code/payme-wt/_screenshots/<branch>/` (chat, PDFs, emails, phone viewport, admin, German journey).

## Decisions I made alone

- Stacked everything on #55 instead of main, to avoid fighting the unmerged CLI auth and email work.
- Merged main into #55 (no history rewrite) instead of rebasing; it was one commit behind.
- Chose one `taxTreatment` enum plus a `servicePeriodStart/End` and `buyerReference`, and one jsonb `issued_snapshot` rather than many columns.
- Reminders do not attach the XML again; first-run test copies stay PDF only.
- API `problems[]` strings stay English; the UI translates them by code.
- Admin area, CLI and MCP stay English.
- Review step: workers ran the repo's code-review skill. Two of them (NOTA-54, super admin) let it send the staged diff to the Codex CLI (OpenAI) as that skill's default; the later workers declined that step to keep the diff on the machine. Tell me if you want the default changed.

## Needs you

- Migration numbers: #62 adds `0023_admin-audit-log`, #61 adds `0023_german-invoice-model`. Renumber whichever merges second. Inside german-core, #66 is 0025 and #67 was renumbered to 0026.
- Vercel Blob: stored originals use private access with overwrite. Confirm the Blob store supports private blobs before promoting #66. On S3 the `invoices/` prefix must not allow anonymous reads.
- `.env.local` on your machine still has a live Helo key; worktrees now blank it. Consider `EMAIL_PROVIDER=log` locally.
- Follow-ups workers flagged: repair migration for bank accounts whose IBAN was mangled by migration 0007 (no prod query was run); MCP/chat has no update_client or workspace-settings tool; email body text still reads live rows (only attachments are frozen).

## Nits seen in screenshots, not fixed

- Invoice form quantity/price inputs show four decimals ("2,0000", "600,0000").
- Floating Nota button overlaps the proposal text on the phone home.
- Draft titles show the full `DRAFT-<uuid>`.
- Not yet translated: Settings Team/Billing/API/Connected apps, /agents, /deactivated, OAuth consent, invite/verification/reset emails, server-action error strings.
- Pre-existing: brand-settings form encType warning; Radix Select hydration mismatch at phone width in the invoice form; local Postgres timezone Europe/Madrid delays inline job pickup by two hours locally.

## Not done (needs you or an account)

Stripe Connect in production, MCP branded domain, real Claude/ChatGPT connector test, Google Cloud changes, deploys, merges, real mail.
