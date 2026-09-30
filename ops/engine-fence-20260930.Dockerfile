FROM sha256:9e230c480e5515d355f5da075f25d32bd091234c9f8ce78fc333fddd83ee897f
COPY --chown=1000:1000 shared/hub-observation.ts /app/shared/hub-observation.ts
COPY --chown=1000:1000 relayer/src/agents/pool-engine.ts /app/relayer/src/agents/pool-engine.ts
COPY --chown=1000:1000 scripts/agent-reusable-engines.ts /app/scripts/agent-reusable-engines.ts
