# Immutable, source-verified 3b263a1 runtime; no mounted source overrides.
# The normal agent-reusable target can also rebuild the full current runtime.
FROM sha256:0f290127b7cb45c63f595bf597c0462d9a8a65246c815af8714306c39c501622
COPY relayer/src/agents/pool-read.ts /app/relayer/src/agents/pool-read.ts
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
