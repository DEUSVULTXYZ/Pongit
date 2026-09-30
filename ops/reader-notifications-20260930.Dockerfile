FROM sha256:23de88b8bd3b0973ab95b4975de4a45f41a377a15e5780672f1f95f35f2c6e0f
COPY --chown=1000:1000 relayer/src/agents/pool-read.ts /app/relayer/src/agents/pool-read.ts
COPY --chown=1000:1000 relayer/src/agents/pool-notifications.ts /app/relayer/src/agents/pool-notifications.ts
