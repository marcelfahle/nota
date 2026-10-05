# Self-host Nota

Nota’s self-hosted mode keeps all invoicing capabilities available and disables hosted subscription
quotas. It does not select a payment processor: `PAYMENT_MODE=bank-transfer` sends invoices without a
Stripe secret, while `PAYMENT_MODE=stripe` can be configured separately. AI chat, Helo, SMTP, S3,
Vercel Blob, and MCP are optional external services. Nota is operated by **No Rules Software SL**.

## Start the stack

Prerequisites: Docker Engine with the Compose v2 plugin and OpenSSL.

```sh
cp .env.self-hosted.example .env.self-hosted
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
SESSION_SECRET="$(openssl rand -hex 32)"
CRON_SECRET="$(openssl rand -hex 32)"
sed -i "s/change-me-database-password/$POSTGRES_PASSWORD/" .env.self-hosted
sed -i "s/change-me-at-least-32-random-characters/$SESSION_SECRET/" .env.self-hosted
sed -i "s/change-me-random-cron-secret/$CRON_SECRET/" .env.self-hosted
docker compose --env-file .env.self-hosted up --build -d
docker compose --env-file .env.self-hosted ps
curl --fail http://localhost:3000/api/health
curl --fail http://localhost:3000/api/ready
curl --fail --header "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/doctor
```

`migrate` takes a PostgreSQL advisory lock and must finish successfully before `web` can become
ready. `cron` calls the authenticated job endpoint. Postgres and local files use named volumes.
Public health returns only a status; doctor authentication is required for provider diagnostics.

To enable Helo, set `EMAIL_PROVIDER=helo`, `HELO_API_KEY`, `HELO_CHANNEL_ID`, and `EMAIL_FROM`.
For SMTP, set `EMAIL_PROVIDER=smtp` and `SMTP_URL`. The default `log` provider appends delivery
intent (recipient, subject, and attachment metadata, not message bodies) to
`/data/mail/sends.jsonl` without sending mail.

Local storage is the default. To use S3-compatible storage, set `STORAGE=s3`, `S3_BUCKET`,
`S3_REGION`, and `S3_PUBLIC_URL`; set endpoint, path-style, and credentials when the service needs
them. Stored keys are restricted to `orgs/<tenant UUID>/logo|favicon.<safe extension>`.

Add `ANTHROPIC_API_KEY` to enable chat. Without it, the UI explains that chat is unavailable while
invoicing, PDF export, CLI/API access, and sending continue normally. To run MCP, set
`NOTA_OAUTH_SECRET` and `NOTA_MCP_PUBLIC_URL`, then run:

```sh
docker compose --env-file .env.self-hosted --profile mcp up --build -d
```

## Disposable fixtures

Seeds are intentionally refused unless `SEED_CONFIRM=disposable`, and they abort rather than modify
an existing login. Only run this against a database you can delete:

```sh
docker compose --env-file .env.self-hosted --profile seed run --rm seed
```

This creates `.test` clients, draft/overdue/paid invoices, a bank account, and a disposable CLI key.
Override every `SEED_*` value before sharing the environment.

## Backup and restore

The commands below create a database archive and a local-storage/mail archive. S3 and Vercel Blob
must be backed up with the provider’s own versioning or replication controls.

```sh
mkdir -p backups
docker compose --env-file .env.self-hosted exec -T postgres \
  pg_dump -U nota -d nota --format=custom > backups/nota-postgres.dump
docker run --rm -v nota_nota_data:/data -v "$PWD/backups:/backup" alpine:3.22 \
  tar czf /backup/nota-data.tgz -C /data .
```

Restore into the same Compose project only after checking both archive files:

```sh
docker compose --env-file .env.self-hosted stop web cron
docker compose --env-file .env.self-hosted exec -T postgres dropdb --force -U nota nota
docker compose --env-file .env.self-hosted exec -T postgres createdb -U nota -O nota nota
cat backups/nota-postgres.dump | docker compose --env-file .env.self-hosted exec -T postgres \
  pg_restore -U nota -d nota --no-owner --no-privileges
docker run --rm -v nota_nota_data:/data -v "$PWD/backups:/backup:ro" alpine:3.22 \
  sh -ec 'rm -rf /data/* && tar xzf /backup/nota-data.tgz -C /data'
docker compose --env-file .env.self-hosted run --rm migrate
docker compose --env-file .env.self-hosted up -d web cron
curl --fail http://localhost:3000/api/ready
```

Keep `.env.self-hosted` and backups encrypted and outside version control. Test recovery on a separate
Compose project before relying on it.
