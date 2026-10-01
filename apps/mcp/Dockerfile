FROM oven/bun:1.3.6 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/mcp/package.json apps/mcp/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN bun install --frozen-lockfile --filter @nota-app/mcp --filter @nota-app/sdk
COPY packages/sdk/src packages/sdk/src
COPY packages/sdk/tsconfig.json packages/sdk/tsconfig.json
COPY apps/mcp/src apps/mcp/src
COPY apps/mcp/scripts apps/mcp/scripts
COPY apps/mcp/tsconfig.json apps/mcp/tsconfig.json
RUN bun run build:mcp

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3100 NOTA_MCP_HOST=0.0.0.0 NOTA_OAUTH_STORE=/data/oauth.enc
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/apps/mcp /app/apps/mcp
COPY --from=build --chown=node:node /app/packages/sdk /app/packages/sdk
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3100
CMD ["node", "apps/mcp/dist/http.js"]
