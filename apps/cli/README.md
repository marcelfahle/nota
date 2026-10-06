# @nota-app/cli

Command-line interface for Nota.

## What is new in 0.2.0

Compact terminal output, JSON automation, pagination, and explicit review before sending or recording payments. Browser OAuth from 0.1.0 is retained.

## Design preview

Try the proposed terminal experience with offline sample data:

```bash
bun run --cwd apps/cli preview
bun run --cwd apps/cli preview tour
bun run --cwd apps/cli preview invoices create
bun run --cwd apps/cli preview invoices send INV-0044
```

This historical prototype does not access your account, save drafts, or send email. The live source now uses a denser version of its visual language.
See the [design and technology decisions](../../docs/design/2026-10-05-nota-cli-design.md)
and [captured visual preview](../../docs/design/nota-cli-preview.html).
The commands below describe 0.2.0.

## Install

Requires Node.js 22.13+ (22.x) or Node.js 24+. The SDK is bundled into the CLI;
running the published package does not require this monorepo or a separate SDK install.

Run without installation:

```bash
npx @nota-app/cli login
bunx @nota-app/cli login
bun add -g @nota-app/cli
```

Or run it from the repo:

```bash
bun run --cwd apps/cli dev -- --help
```

## Setup

Sign in with your browser and approve the CLI's access to your workspace:

```bash
nota login
nota whoami
nota logout
```

Use your existing email/password login, or Google when enabled on your server. Tokens refresh automatically. Logout removes
local credentials and disconnects this CLI on the server; Settings → API → Connected apps can revoke a
connection immediately too. An API-key login is removed locally without deleting the server key.

For a development server or API-key authentication:

```bash
bun run --cwd apps/cli dev login --url http://localhost:3001
nota login --api-key
nota login --no-browser
```

`--no-browser` prints a link and still requires a browser on the same computer (or an SSH tunnel
to the printed loopback port). It is not a device-code flow. Use `NOTA_API_KEY` for CI.

The CLI stores tokens in `~/.nota/config.json` with owner-only file permissions, atomic writes,
and a process lock for refresh rotation. It does not use the OS keychain. `NOTA_CONFIG_DIR`
overrides this directory for isolated environments. Never commit or share it.

Environment variables override file config:

```bash
export NOTA_URL=https://nota.example.com
export NOTA_API_KEY=nota_xxxxxxxxxxxxxxxxxxxxxxxxx
```

An environment API key takes precedence over browser login. A different `NOTA_URL` cannot
reuse stored credentials; log in to that server explicitly. Changing the saved URL clears
credentials for the old server.

## Output and automation (0.2.0)

`nota` shows a short start screen when signed out, or your workspace and five recent invoices when signed in. It does not pretend a page of results is an account-wide balance. Lists use a compact ledger; narrow terminals stack each record. Use `invoices show --activity` for the full history.

```bash
nota invoices --status overdue --page 2
nota invoice ls --all --json
nota clients --search oxide --json
nota invoices send INV-0007 --dry-run
nota invoices send INV-0007 --yes --no-input --json
NOTA_API_KEY=... nota login --api-key --no-input --json
```

Global flags: `--json`, `--no-color`, `--no-input`, `--yes` (`-y`). Lists accept `--page`, `--per-page` (1–100), and `--all`. `--all` cannot be combined with `--page`; keep filters when requesting another page. `invoice`/`client`, `ls`, and `new` are aliases.

JSON preserves API decimal strings. Lists return `{data, pagination}`; aggregated `--all` output also has `all: true` (pagination describes the starting page and reported total). Detail/identity commands return the record. Invoice mutations return `{invoice, warning?}`. Dry-runs return `{dryRun: true, ...}`. Errors are JSON on stderr with exit 1; cancellation exits 130. Success exits 0. Help/version perform no network requests. There is no prompt in JSON, CI or no-input mode. Browser login prints its link to stderr and requires normal mode; API-key login can use `NOTA_API_KEY` without prompting.

Sending, marking paid and duplicating require interactive approval or `--yes`. `--dry-run` makes no mutation. An edit detected during review requires a fresh review; this client-side check is not an atomic conditional-write guarantee. Sending reports **email queued**, not delivered. Draft creation with complete flags remains scriptable without prompting and never sends mail. Its input preview shows rates/tax/dates; the server calculates authoritative totals after saving.

PDF downloads refuse to overwrite an existing file unless `--force` is passed. CSV import retains its stronger `--confirm <preview-hash>` contract; `--yes` does not bypass it.

## Commands

### Config

```bash
nota config show
nota config set-url https://nota.example.com
nota config set-key nota_xxxxxxxxxxxxxxxxxxxxxxxxx
```

### Identity

```bash
nota whoami
```

### Clients

Preview a client CSV, then import the reviewed result using its hash:

```bash
nota clients import clients.csv
nota clients import clients.csv --confirm <preview-hash>
```

The preview explains duplicate/invalid rows. Imports preserve existing clients and do not create or send invoices. If the file or client list changes, preview again. Up to 250 KB and 1,000 rows per batch.

List clients:

```bash
nota clients
nota clients --search oxide
nota clients list --search oxide
```

Show a client by ID or exact name:

```bash
nota clients show "Oxide GmbH"
nota clients show 5c8d6d7f-1f68-4c86-a0c8-7f9f2bbfd123
```

Create a client interactively:

```bash
nota clients create
```

Create a client non-interactively:

```bash
nota clients create \
  --name "Oxide GmbH" \
  --email billing@oxide.test \
  --company "Oxide" \
  --currency EUR
```

### Invoices

List invoices:

```bash
nota invoices
nota invoices list --status overdue
nota invoices list --client "Oxide GmbH"
nota invoices list --status sent
```

Show an invoice by ID or invoice number:

```bash
nota invoices show INV-0007
nota invoices show 4c9af3a9-6a88-4f2d-baa9-87c8d4e6f89a
```

Create an invoice interactively:

```bash
nota invoices create
```

Create an invoice non-interactively with natural line items:

```bash
nota invoices create \
  --client "Oxide GmbH" \
  --item "Development, 40hrs at 120" \
  --item "Discovery | 1 | 800" \
  --tax-rate 21
```

Invoice actions:

```bash
nota invoices send INV-0007
nota invoices paid INV-0007
nota invoices duplicate INV-0007
nota invoices pdf INV-0007
nota invoices pdf INV-0007 --output ./oxide-invoice.pdf
```

## Publish

Before publishing:

```bash
bun run --cwd apps/cli build
bun run --cwd apps/cli check
bun run --cwd apps/cli test
cd apps/cli
npm pack
```

Inspect the tarball and run it from an empty directory with both `npx --package=<tarball> nota
--help` and `bunx --package=<tarball> nota --help`. Publish with `npm publish --access public`
only after production authentication passes and npm authentication is configured.

The published binary name is `nota`. Bun is used to build the Node ESM executable, bundling
the workspace SDK; prompt, color, command parsing, and locking dependencies remain regular
npm dependencies.
