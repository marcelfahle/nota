# Production auth and email test — 2026-10-05

Target: `https://app.withnota.com`. No real customer invoice was sent.

## Configuration and deployment

- Helo's four production environment variables are configured as sensitive values.
- Sender: Nota <hello@withnota.com>; existing verified transactional channel.
- Prior production deployment: `nota-nar8hxznu-marcelfahles-projects.vercel.app`.
- CLI/Helo initial deployment: `nota-dv6mx4c35-marcelfahles-projects.vercel.app`.
- Branded email and public logo: `nota-hzdux6olv-marcelfahles-projects.vercel.app`.
- Callback fix: `nota-eopm9cyto-marcelfahles-projects.vercel.app`, explicitly
  promoted and confirmed behind `app.withnota.com`.
- Vercel CLI `--prod` built and assigned the default Vercel alias, but custom domains
  initially stayed on the old version. An explicit `vercel promote` moved them.
  Verify the actual custom domain with `vercel inspect`, not just build success.
- No database migration was required. Concurrent build workers logged duplicate
  OAuth resource initialization; the build completed and the resource exists.

## Confirmed

- 200 web tests, type check, lint and formatting passed before the callback fix rollout.
- Latest email design checks and four provider adapter tests pass.
- 20 CLI tests and the Node-targeted build pass.
- CLI tarball runs from an empty directory using both npx and bunx.
- Public OAuth discovery: HTTP 200, canonical issuer, PKCE S256.
- Anonymous `/api/v1/me`: HTTP 401.
- Native CLI registration: HTTP 201, correct loopback callback stored in Postgres.
- Production password reset delivered to m.fahle@gmail.com at 05:25:10 UTC.
  See `email-inventory.md` for provider ID and inbox evidence.
- Public email logo: HTTP 200, image/png, 1,674 bytes, no session needed.
- Production CLI browser consent and PKCE exchange succeeded for
  `hello@withnota.com`, Nota workspace, owner role. Isolated test config only.
- Live `whoami`, `clients list`, and `invoices list` succeeded without mutations.
- Two concurrent commands refreshed an expired local cache timestamp safely;
  the production provider rotated the refresh token and both commands succeeded.
- Credential directory/file permissions were 0700/0600.
- CLI logout removed local credentials and disconnected the server connection.
  Both original and refreshed access tokens then returned HTTP 401; the refresh
  token returned HTTP 400 `invalid_grant`. A signed-out command prompted login.
- Connected apps was checked in the production browser after logout and shows
  no remaining connections. No email or invoice mutation occurred in this test.
- npm login completed as `marcelfahle`; free `nota-app` organization created and
  owner membership verified. Release archive includes the MIT license, README,
  package metadata and executable only (four files, approximately 15.9 KB).
- `@nota-app/cli@0.1.0` is public on npm with the `latest` tag. The downloaded
  registry archive's SHA-512 integrity matches the reviewed local archive.
- Fresh `npx @nota-app/cli --version/--help` and `bunx @nota-app/cli --version/--help`
  checks passed with isolated caches, outside the monorepo (Node 22.22.0,
  npm 10.9.4, Bun 1.3.6). Both report 0.1.0 and expose browser login commands.
  An initial npx check inside this workspace resolved local workspace context
  and failed to find its bin; the corrected external-directory check passed.

## Compact CLI 0.2.0 release

- Published by the user with npm 2FA; public registry version and `latest` tag
  both verified as 0.2.0. Downloaded archive SHA-512 matches the tested archive.
- Fresh npx and bunx installs with isolated caches outside the monorepo pass
  version and command-help checks. The four-file package is approximately 27.4 KB.
- 26 CLI tests pass (617 assertions), plus type checking and the Node build.
  Packed command checks cover fixture invoice JSON; real-terminal checks cover
  declining approval and cancellation with exit code 130.
- The compact renderer is live: dense invoice rows, responsive narrow output,
  concise details, JSON/no-input modes, pagination and mutation review/dry-run.
- This release's mutation checks used a local fixture server. Production OAuth,
  reads, refresh and revocation were verified with 0.1.0 as recorded above; no
  additional production invoice or email mutations were performed for 0.2.0.
- Client-side stale-invoice checks are not atomic server preconditions.

## Callback normalization bug

Next.js 16.1.6 normalized `127.0.0.1` to `localhost` inside the authorization
query string. Dynamic registration stored the original callback correctly, so
the OAuth provider correctly rejected the changed address as `invalid_redirect`.
Local Node and Bun provider checks passed because they bypassed Next's adapter.

Set Next's `skipProxyUrlNormalize: true` to preserve callback and signed query
values without relaxing OAuth redirect validation. A regression test covers the
loopback callback, opaque state, protected settings page, and public email logo.
See [Next.js proxy configuration](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
Production checks passed on the canonical domain after promotion: the registered
loopback callback reaches the login response with its address and opaque state
unchanged. A different callback path and a `localhost` callback remain rejected.
Anonymous API access stays 401, settings redirects to login, and the email logo
remains public. These checks do not substitute for a signed-in consent roundtrip.

## Still open

- CLI browser login, consent, refresh and logout are verified. Google sign-in is
  a separate pending check below; this roundtrip reused the existing web session.
- Separate production Google OAuth client is prepared, awaiting action-time
  credential-creation approval required by the browser tool.
- Verification email design is visually reviewed, but no real verification flow
  was exercised: the Gmail production account is already verified.
- Password reset completion requires the user to enter the new password.
- GitHub trusted publishing/provenance remains follow-up work in NOTA-2; this
  initial release was published manually by the user with 2FA.
