FROM sha256:932c135c5e9cb4c4aa7524eb79d8f3ffc52b2d0931cd47d3d9ddcbdc4c5f9da0
COPY --chown=1000:1000 shared/rooms-hub.ts /app/shared/rooms-hub.ts
COPY --chown=1000:1000 scripts/agent-reusable-step.ts /app/scripts/agent-reusable-step.ts
