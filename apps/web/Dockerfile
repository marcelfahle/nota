FROM oven/bun:1.3.6 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/mcp/package.json apps/mcp/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS builder
COPY . .
ENV APP_URL=http://localhost:3000 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    EMAIL_PROVIDER=log \
    SESSION_SECRET=build-only-session-secret-at-least-32-characters \
    STORAGE=local
RUN bun run build:web

FROM dependencies AS migration
COPY apps/web apps/web
WORKDIR /app/apps/web
CMD ["bun", "run", "db:migrate"]

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV HOSTNAME=0.0.0.0 NODE_ENV=production PORT=3000
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public
RUN mkdir -p /data/mail /data/storage && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
