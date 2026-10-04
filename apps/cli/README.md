# @nota-app/cli

Command-line interface for Nota.

## Install

```bash
bun add -g @nota-app/cli
```

Or run it from the repo:

```bash
bun run --cwd apps/cli dev -- --help
```

## Setup

Create an API key in Nota under `Settings -> API keys`, then sign in:

```bash
nota login
```

The command verifies the key before saving it. You can still configure the URL and key directly
with `nota config set-url` and `nota config set-key`.

The CLI stores configuration in `~/.nota/config.json`.

Environment variables override file config:

```bash
export NOTA_URL=https://nota.example.com
export NOTA_API_KEY=nota_xxxxxxxxxxxxxxxxxxxxxxxxx
```

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
```

The published binary name is `nota`.
