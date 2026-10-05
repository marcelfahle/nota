# PostHog deployment verification

## Configuration

- Set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` in Vercel Production, Preview, and Development. These values are bundled at build time; environment updates require a new deployment.
- GitHub Actions uses repository variables with the same names. `.agents/setup` passes supplied development values into the generated web `.env`.
- AI privacy mode is enabled in `apps/web/src/lib/posthog-ai.ts`: prompts and completions are omitted; model, usage, timing, session, and trace metadata remain.
- For source maps, add `POSTHOG_API_KEY` (a personal key with error tracking write access) and `POSTHOG_PROJECT_ID` to Vercel's build environments. Also add the personal key as a GitHub Actions secret and the project ID as a repository variable. The project ingestion key is not a substitute for the personal key.
- `@posthog/nextjs-config` uploads maps during the actual Next build and removes them afterward. Without both upload credentials, builds still work but source-map upload is disabled. Verify symbol sets and de-minified stacks after deployment; a separate build's maps do not prove the deployed chunks match.

Reference: [PostHog Next.js source-map upload](https://posthog.com/docs/error-tracking/upload-source-maps/nextjs).

## Product events

Use a disposable account and invoices in a deployment connected to test payment/email services. Confirm each event in PostHog with that account's distinct ID and the current timestamp.

| Action | Expected event |
| --- | --- |
| Register directly or through an invitation | `account_created` |
| Complete onboarding registration | `onboarding_account_created` |
| Sign in | `user_signed_in` |
| Create or edit an invoice | `invoice_submitted` |
| Send an invoice | `invoice_sent` |
| Mark an invoice as sent | `invoice_marked_sent` |
| Send a reminder | `invoice_reminder_sent` |
| Record a payment | `invoice_payment_recorded` |
| Cancel an invoice | `invoice_cancelled` |
| Start a billing action | `billing_action_started` |
| Remove an agent connection | `agent_access_removed` |

Reopen an authenticated dashboard without signing in again. Confirm `dashboard-shell.tsx` identifies the same user, and subsequent events keep that distinct ID. Sign out and confirm identity resets.

## Errors, AI, and logs

- In a disposable preview deployment, temporarily trigger an unhandled App Router render error that reaches `src/app/global-error.tsx`. Confirm the exception in Error Tracking and the de-minified source location. Remove the temporary trigger before production.
- Exercise chat and the onboarding website reader. Confirm `$ai_generation` events, shared trace/session IDs across model calls, and a complete trace tree in AI Observability. Check that prompts, completions, and tool contents are absent.
- Send a chat message. Confirm `Chat generation started` and `Chat generation completed` in PostHog Logs, both with `service.name=nota-web`, severity `INFO` (9), and route `/api/chat`.
- No CSP is currently configured in this repository. If one is added, inspect the browser console and network requests for blocked PostHog ingestion and asset hosts.

## External sources

- Stripe: for automatic real-time webhook setup, grant the restricted integration key **Webhooks: Write** and retry source setup. Verify delivery and updates/deletions, not only initial imports.
- Resend: finish the browser source setup with a valid full-access `re_` key. Tracked in [NOTA-40](https://linear.app/boldvideo/issue/NOTA-40/finish-posthog-mailer-setup-with-a-resend-api-key). Never put credentials in tickets or this document.

## Verification status — 2026-10-04

- PostHog public key and host configured and verified in all three Vercel environments and GitHub Actions variables.
- Local tests verify AI privacy against actual SDK export payloads and both log messages against the real OpenTelemetry exporter, using local receivers.
- `bun run test`: 203 tests pass (189 web, 6 CLI, 8 MCP). `bun run check`: workspace type, lint, and formatting checks pass.
- `bun run build`: the final production build passes for web, SDK, CLI, and MCP. These changes have not been deployed.
- All 26 browser tests were exercised against a fresh local `nota_ci` database. After rerunning failures with the same session secret in the runner and web server, 25 have passing evidence. The unchanged invoice-list test still reports two pixels of desktop table overflow at `apps/web/tests/e2e/invoices-list.e2e.ts:92` (allows one pixel); this is not a PostHog ingestion check.
- Source-map credentials were added on 2026-10-05; see the follow-up below.
- Deployment event arrival, returning-user identification, Error Tracking, live AI trace trees, and Logs remain unverified in PostHog. Local tests do not establish ingestion by the live service.
- Stripe permissions and Resend source completion remain external setup tasks.

## Landing-page follow-up — 2026-10-05

- The landing repository at `../payme-lp/amp` uses the same PostHog project as the app. Both explicitly share the anonymous cookie on `.withnota.com`; their events have `site_surface=marketing` or `site_surface=app`. Landing signup and login links capture explicit CTA events.
- Plausible uses site script `pa-Y6EflSWkCHCE9SURwRlsq` in the landing root layout for production deployments.
- The corrected personal key authenticates to Error Tracking. Public configuration, numeric project ID, and private upload key are configured for all three Vercel environments in both `nota` and `nota-lp`; the app's GitHub Actions upload secret is configured too.
- Landing lint, TypeScript, and production build pass. A browser test with intercepted ingestion confirms one landing pageview per tool, a signup CTA event, and the same anonymous identity on the app's `/start` page. No uncaught browser errors occurred.
- Both app and landing production builds successfully uploaded source maps. These code changes remain undeployed; live event and authenticated identification checks still require deployment.

## Production deployment — 2026-10-05

- App deployed as `dpl_3xEcFc4Nv3sSQVZgHLusZF6CJKEs`; `app.withnota.com` was explicitly aliased to it because the production deploy did not move that custom alias automatically. Verify this alias on future app releases. The domain-add command reports an existing project assignment, so no forced domain move was performed.
- Landing deployment: `https://nota-rewojp8dj-marcelfahles-projects.vercel.app`, served at `www.withnota.com`.
- Both Vercel production builds uploaded source maps successfully. Landing CTAs now use immediate beacon delivery before cross-site navigation.
- `/`, `/freshbooks`, app `/start`, and app `/login` return HTTP 200.
- Live browser verification passed: marketing and app pageviews use the same anonymous distinct ID, signup CTA payload is emitted, PostHog ingestion returns 200, and Plausible ingestion returns 202. No uncaught browser errors. Playwright request routing continued real ingestion requests to make navigation beacon payloads observable; no mock responses were used. Authenticated signup, AI/logs, and error-dashboard checks are still separate pending checks.
