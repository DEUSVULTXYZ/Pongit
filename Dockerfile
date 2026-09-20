FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS relayer
WORKDIR /app
COPY shared ./shared
COPY relayer ./relayer
COPY tsconfig.json ./
ENV NODE_ENV=production
USER node
EXPOSE 4000
CMD ["node","--import","tsx","relayer/src/main.ts"]

FROM dependencies AS agents
COPY shared ./shared
COPY relayer/src/agents ./relayer/src/agents
COPY web/lib/rooms-command-journal.ts ./web/lib/rooms-command-journal.ts
COPY scripts/agent-house-worker.ts scripts/agent-soak.ts scripts/agent-process.mjs ./scripts/
COPY tsconfig.json ./
RUN mkdir -p /secrets/state /diagnostics/agents && chown -R node:node /secrets /diagnostics
ENV NODE_ENV=production
USER node
EXPOSE 4100
CMD ["node","scripts/agent-process.mjs","service"]

FROM agents AS agent-operations
COPY scripts/agent-lifecycle.ts scripts/agent-archive-step.ts scripts/independent-chain-tools.ts scripts/agent-ops.mjs scripts/agent-operator-step.ts ./scripts/
COPY relayer/src/rooms-hosted-renewal.ts ./relayer/src/rooms-hosted-renewal.ts
CMD ["node","scripts/agent-ops.mjs"]

FROM dependencies AS web-build
COPY shared ./shared
COPY web ./web
COPY tsconfig.json ./
COPY scripts/docs-build.ts ./scripts/docs-build.ts
COPY deployments ./deployments
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_RP_ID
ARG PONG_REQUIRE_AGENT_POOL_MANIFEST=false
ENV PONG_REQUIRE_AGENT_POOL_MANIFEST=$PONG_REQUIRE_AGENT_POOL_MANIFEST
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL NEXT_PUBLIC_RP_ID=$NEXT_PUBLIC_RP_ID NEXT_TELEMETRY_DISABLED=1
RUN npx tsx scripts/docs-build.ts && npx next build web

FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=web-build --chown=node:node /app/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/web/.next/static ./web/.next/static
COPY --from=web-build --chown=node:node /app/web/public ./web/public
USER node
EXPOSE 3000
CMD ["node","web/server.js"]
