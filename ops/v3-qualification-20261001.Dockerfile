# Dependencies are unchanged from the validated sponsor/qualification runtime.
# Replace all executable source with the audited checkout. No runtime secrets,
# metadata, database files or compiler artifacts are included in the image.
FROM sha256:7b529b37c620af52a81f906d477076a54eee5b915699939056569faed02ed113
USER root
RUN rm -rf /app/shared /app/relayer /app/scripts /app/web/lib /app/agent-sdk
COPY --chown=node:node shared /app/shared
COPY --chown=node:node relayer /app/relayer
COPY --chown=node:node scripts /app/scripts
COPY --chown=node:node web/lib /app/web/lib
COPY --chown=node:node agent-sdk /app/agent-sdk
COPY --chown=node:node tsconfig.json /app/tsconfig.json
USER node
WORKDIR /app
