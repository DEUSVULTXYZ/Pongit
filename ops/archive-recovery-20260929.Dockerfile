# Published e4bd537 runtime, pinned by digest. Keep every other role unchanged.
FROM sha256:91808a44b73c4f69a40e5f1552953c14539faa8da255c23bf0fff7d4772a7af3
COPY scripts/agent-reusable-step.ts /app/scripts/agent-reusable-step.ts
COPY shared/agent-continuation.ts /app/shared/agent-continuation.ts
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
