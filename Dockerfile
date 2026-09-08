FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS web-build
COPY shared ./shared
COPY web ./web
COPY tsconfig.json ./
COPY scripts/docs-build.ts ./scripts/docs-build.ts
COPY deployments/testnet.json ./deployments/testnet.json
COPY deployments/interlude-lab.json ./deployments/interlude-lab.json
COPY deployments/interlude-rooms.json ./deployments/interlude-rooms.json
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_RP_ID
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

FROM dependencies AS relayer
WORKDIR /app
COPY shared ./shared
COPY relayer ./relayer
COPY tsconfig.json ./
ENV NODE_ENV=production
USER node
EXPOSE 4000
CMD ["node","--import","tsx","relayer/src/main.ts"]
