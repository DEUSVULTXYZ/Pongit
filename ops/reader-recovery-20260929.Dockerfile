# Retain the currently deployed API, notifications and recovery presentation.
FROM sha256:71b535e3062d143792c7fa800a1223fd43448088847aa803214327507fa3fd03
COPY relayer/src/agents/pool-read.ts /app/relayer/src/agents/pool-read.ts
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
