# Nota MCP deployment

The server runs on the same Hetzner host as Bold MCP:

- Host: `91.99.49.152`; SSH uses the existing `~/.ssh/id_ed25519_mf2024` key.
- Source: `/opt/nota_mcp`; Compose project: `nota_mcp`; container: `nota-mcp`.
- Endpoint: `https://nota-mcp.91-99-49-152.sslip.io/mcp`.
- Nota API: `https://nota-weld.vercel.app/api/v1`.
- Runtime: non-root Node 22, 256 MB memory limit, one process.
- OAuth state: Docker volume `nota_mcp_nota_oauth`, `/data/oauth.enc`, mode 600.
- Secrets: `/opt/nota_mcp/apps/mcp/deploy/.env`, mode 600. Keep the encryption secret stable; no global Nota API key is needed.

## Redeploy

Run from the repository root. Exclude local environments, credentials, browser artifacts, and build caches from synchronization:

```bash
rsync -az \
  --exclude .git --exclude '.env*' --exclude node_modules --exclude .next \
  --exclude .vercel --exclude dist --exclude .nota --exclude .playwright-mcp \
  --exclude test-results --exclude playwright-report \
  -e 'ssh -i ~/.ssh/id_ed25519_mf2024 -o IdentitiesOnly=yes' \
  ./ root@91.99.49.152:/opt/nota_mcp/

ssh -i ~/.ssh/id_ed25519_mf2024 -o IdentitiesOnly=yes root@91.99.49.152 \
  'cd /opt/nota_mcp/apps/mcp/deploy && docker compose -p nota_mcp up -d --build'
```

The Dockerfile uses the root workspace as its build context and installs only the MCP and SDK workspaces. The runtime uses the existing `deploy_default` network. It exposes port 3100 internally; Caddy owns public ports 80 and 443. No schema migration is needed for this release.

## Shared Caddy edge

The live file is `/opt/bold_mcp/deploy/Caddyfile`; its source is `~/code/BOLD/code/_lab/bold-mcp/deploy/Caddyfile`. The Nota site was added to both. Preserve every existing Bold/importer/control-panel site. The pre-Nota backup is `/opt/bold_mcp/deploy/Caddyfile.before-nota-20260930`.

Validate a candidate inside `bold-mcp-caddy` before applying it. The container binds the individual config file, so update its contents in place to preserve the inode, then use `caddy reload`; replacing the file by rename can leave the mount pointing at the old file. Do not restart the shared proxy to redeploy Nota.

## Verify

```bash
curl -fsS https://nota-mcp.91-99-49-152.sslip.io/health
curl -fsS https://nota-mcp.91-99-49-152.sslip.io/.well-known/oauth-protected-resource/mcp
curl -i -X POST https://nota-mcp.91-99-49-152.sslip.io/mcp
```

Expect health `200`, OAuth discovery `200`, and an unauthenticated MCP request `401` with a `WWW-Authenticate` resource-metadata URL. The Docker health check uses Node's HTTP client with the canonical Host header, preserving the DNS guard. Verify `docker inspect nota-mcp` reports healthy and inspect logs without printing environment variables. Connecting Claude/ChatGPT requires a dedicated Nota key and browser consent; use a test workspace for actual create/send tests.

## Rollback and backup

Before later deployments, tag the current image and retain the protected environment file. Roll back the container to that image using the same persistent volume. Keep encrypted-state backups separate from the encryption-secret backup; losing either requires reconnecting users. Do not remove the volume during container replacement.

To withdraw Nota, stop only the `nota_mcp` Compose project and remove only its Caddy site, validating and reloading the edge. Leave the other services and their networks intact.

The web update is deployed separately on Vercel, using the stable alias `https://nota-weld.vercel.app`. The pre-MCP deployment was `dpl_8n6w2ZHvyPG7uWzUMbwRsZTFqKCe`; the initial MCP/card release was `dpl_cp5T6q9vZLmFCDV2Ah2Eorg9Gffi`. Sonnet 5.5 and client CSV imports use the same deployment topology and require no schema migration. No live invoices were created or customer emails sent for verification.
