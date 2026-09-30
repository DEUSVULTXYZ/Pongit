FROM sha256:932c135c5e9cb4c4aa7524eb79d8f3ffc52b2d0931cd47d3d9ddcbdc4c5f9da0
COPY --chown=1000:1000 shared/rooms-hub.ts /app/shared/rooms-hub.ts
COPY --chown=1000:1000 shared/agent-house-instances.ts /app/shared/agent-house-instances.ts
COPY --chown=1000:1000 scripts/agent-reusable-step.ts /app/scripts/agent-reusable-step.ts
COPY --chown=1000:1000 scripts/independent-chain-tools.ts /app/scripts/independent-chain-tools.ts
COPY --chown=1000:1000 relayer/src/sponsor-prepare.ts /app/relayer/src/sponsor-prepare.ts
COPY --chown=1000:1000 relayer/src/agents/pool-maintenance.ts /app/relayer/src/agents/pool-maintenance.ts
RUN node --import tsx -e "Promise.all([import('./scripts/independent-chain-tools.ts'),import('./relayer/src/agents/pool-maintenance.ts')])"
