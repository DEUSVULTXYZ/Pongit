FROM sha256:91808a44b73c4f69a40e5f1552953c14539faa8da255c23bf0fff7d4772a7af3
COPY --chown=1000:1000 relayer/src/agents/pool-read.ts /app/relayer/src/agents/pool-read.ts
COPY --chown=1000:1000 shared/agent-house-instances.ts /app/shared/agent-house-instances.ts
COPY --chown=1000:1000 shared/agent-availability.ts /app/shared/agent-availability.ts
RUN node --import tsx -e "import('./relayer/src/agents/pool-read.ts').then(m=>{if(typeof m.AgentPoolReader!=='function')process.exit(1)})"
