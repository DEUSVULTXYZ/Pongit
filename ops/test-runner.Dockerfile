FROM ghcr.io/foundry-rs/foundry:stable AS foundry
FROM node:24-bookworm
WORKDIR /runtime
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && npx playwright install --with-deps chromium
ENV NODE_PATH=/runtime/node_modules
WORKDIR /app
CMD ["node", "--version"]

COPY --from=foundry /usr/local/bin/anvil /usr/local/bin/anvil
COPY --from=foundry /usr/local/bin/forge /usr/local/bin/forge
