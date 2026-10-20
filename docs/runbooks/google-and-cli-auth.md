# Google and CLI authentication

Nota uses Better Auth for password/Google sessions and as the OAuth authorization server for
its CLI and remote MCP. Google authenticates the person; Nota issues the CLI/MCP credentials.
No Google client secret belongs in the CLI, SDK, browser bundle, or npm package.

## Development configuration

Google Cloud project: `nota-auth-marcelfahle` (1098957381546), app name `Nota`, external audience
in Testing. The `Nota web — development` web client has these callback URIs:

- `http://localhost:3000/api/auth/callback/google`
- `http://localhost:3001/api/auth/callback/google`
- `https://bold.eu.ngrok.io/api/auth/callback/google`

Set both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in ignored `apps/web/.env.local`.
`APP_URL` must match the browser's origin and an authorized callback above. For this workspace,
Nota uses `http://localhost:3001` because another project occupies port 3000:

```sh
bun run --cwd apps/web dev --port 3001
bun run --cwd apps/cli dev login --url http://localhost:3001
bun run --cwd apps/cli dev whoami
bun run --cwd apps/cli dev logout
```

Only basic Google identity scopes are requested. Google's [testing-mode exception](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
allows basic identity sign-in without adding every account as a test user. No Gmail, Drive, or
Google Cloud access is requested.

## Existing accounts and onboarding

Google can automatically link only when the provider and existing local email are verified.
For an existing unverified password account, sign in with the password and use Settings →
Account → Connect Google. The email must match. Password login continues to work.

New Google users follow the existing workspace provisioning hook. Website onboarding waits
for its profile to save before redirecting to Google. Invitations travel in protected OAuth
state and are validated against the invitation email and expiry; acceptance is atomic.
Existing-account workspace switching is not supported by the invitation flow.

## CLI and MCP

`nota login` registers a native public OAuth client, opens the browser, and uses authorization
code + PKCE S256. The local callback binds only to `127.0.0.1` on an ephemeral port, checks the
state and optional issuer, and times out after five minutes. No secret is embedded in the CLI.

CLI access tokens target `<APP_URL>/api/v1`; MCP tokens target the configured MCP resource.
REST accepts these two audiences, checks the token issuer and signature, then checks current
consent, workspace membership, role, and workspace activation. Google access tokens cannot
be used as Nota API credentials.

CLI refreshes use a process lock and atomically persist rotated refresh tokens. Logout clears
local credentials and calls `DELETE /api/v1/auth/session` to remove that user's current client
consent and tokens, invalidating already-issued JWTs. No client ID can be supplied to revoke
another connection. Offline logout reports that remote revocation is still needed in Settings.
API-key authentication remains available for CI and existing integrations.

## Production rollout

The current Google credentials are for development. A separate production web client is prepared
in the dedicated Nota Google project with only `https://app.withnota.com/api/auth/callback/google`.
After credential-creation approval, create it and configure the two
secrets in production, and set the production `APP_URL`. Follow Google's [production readiness
guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
for branding, audience, domains, and publishing status. Do not copy development credentials
into production. Deploy the web changes before releasing the CLI.

No schema migration is needed: the existing Better Auth account and OAuth tables are reused.
The npm package has not been published. Its workspace SDK is now bundled into the Node ESM
executable, and the local package tarball runs through npx and bunx. Production authentication
and npm publishing access are the remaining release gates. See the dated production test log.

## Verification

CLI tests cover callback forgery, denial, cancellation, timeout, PKCE, endpoint-origin checks,
private credential files, and concurrent refresh. Web tests run the actual Better Auth provider
with a memory adapter and only the upstream Google exchange stubbed, covering social callback
continuation into CLI consent, token rotation/revocation, invite state, and account linking.
A real Google account consent/login is a separate final smoke test; these fixtures do not claim
to exercise Google's live token service.
