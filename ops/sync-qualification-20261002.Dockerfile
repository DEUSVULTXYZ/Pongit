# Private qualification runtime. The exact dependency lock and complete source
# replace the previous runtime; no environment, journal or private grant enters
# this image. Compiler artifacts are separately verified and mounted read-only.
FROM sha256:7b529b37c620af52a81f906d477076a54eee5b915699939056569faed02ed113
USER root
COPY package.json package-lock.json /app/
RUN cd /app && npm ci --include=dev --ignore-scripts --no-audit --no-fund \
    && node --import tsx -e "if (process.versions.node.split('.')[0] < 24) process.exit(1)"
RUN rm -rf /app/shared /app/relayer /app/scripts /app/web/lib /app/agent-sdk
COPY --chown=node:node shared /app/shared
COPY --chown=node:node relayer /app/relayer
COPY --chown=node:node scripts /app/scripts
COPY --chown=node:node web/lib /app/web/lib
COPY --chown=node:node agent-sdk /app/agent-sdk
COPY --chown=node:node tsconfig.json /app/tsconfig.json
USER node
WORKDIR /app
