FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY pin-envio-rpc-concurrency.mjs ./
RUN node pin-envio-rpc-concurrency.mjs node_modules/envio 4
COPY config.yaml schema.graphql tsconfig.json ./
COPY src ./src
RUN npm run codegen && npm run typecheck
CMD ["npm","run","start"]
