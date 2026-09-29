# Preserve the deployed scoped roles, journal and runtime dependencies.
FROM sha256:91808a44b73c4f69a40e5f1552953c14539faa8da255c23bf0fff7d4772a7af3
COPY --chown=node:node scripts/agent-reusable-engines.ts /app/scripts/agent-reusable-engines.ts
