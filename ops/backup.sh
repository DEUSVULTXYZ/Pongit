#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /opt/pongit/current
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target=/opt/pongit/shared/backups/$stamp
mkdir -p "$target"
databases=$(docker compose exec -T postgres psql -U pong -d postgres -Atc "SELECT datname FROM pg_database WHERE datname='pong_relayer' OR datname ~ '^pong_indexer(_[a-z0-9_]+)?$' OR datname ~ '^pong_human_rules[0-9]+$' ORDER BY datname" </dev/null)
for database in $databases; do
  [[ "$database" =~ ^pong_[a-z0-9_]+$ ]] || exit 1
  if ! docker compose exec -T postgres psql -U pong -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='$database'" </dev/null | grep -qx 1; then continue; fi
  docker compose exec -T postgres pg_dump -U pong -d "$database" -Fc </dev/null > "$target/$database.dump"
  test -s "$target/$database.dump"
done
agent_db=$(docker ps --filter label=com.docker.compose.project=pongit --filter label=com.docker.compose.service=agent-db --format '{{.ID}}')
if test -n "$agent_db"; then
  [[ "$agent_db" =~ ^[a-f0-9]+$ ]] || exit 1
  docker exec "$agent_db" pg_dump -U agents -d agents -Fc </dev/null > "$target/pong_agents.dump"
  test -s "$target/pong_agents.dump"
  agent_service=$(docker ps -a --filter label=com.docker.compose.project=pongit --filter label=com.docker.compose.service=agent-service --format '{{.ID}}')
  [[ "$agent_service" =~ ^[a-f0-9]+$ ]] || { echo 'Agent metadata container missing; backup is incomplete'; exit 1; }
  agent_metadata=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/metadata"}}{{.Source}}{{end}}{{end}}' "$agent_service")
  case "$agent_metadata" in /opt/pongit/secrets/agents*/ops) ;; *) echo 'Unexpected agent metadata path'; exit 1;; esac
  # One unreadable file here aborts the copy after the dumps are written but before
  # the completion marker, so the backup silently never completes. Refuse early and
  # name the file instead. Roles writing as root is what produces these.
  unreadable=$(find "${agent_metadata%/ops}" ! -readable -print -quit)
  test -z "$unreadable" || { echo "Agent secret not readable as $(id -un): $unreadable"; exit 1; }
  cp -a "${agent_metadata%/ops}" "$target/agent-secrets"
  agent_bots=$(docker ps -a --filter label=com.docker.compose.project=pongit --filter label=com.docker.compose.service=agent-bots --format '{{.ID}}')
  [[ "$agent_bots" =~ ^[a-f0-9]+$ ]] || { echo 'Agent command journal container missing; backup is incomplete'; exit 1; }
  docker cp "$agent_bots:/secrets/state" "$target/agent-state"
fi
cp .env "$target/runtime.env"
cp deployments/testnet.json "$target/deployment.json"
for manifest in interlude-rooms.json interlude-rooms-classic.json rooms-finance.json independent.json agents.json; do
  if test -f "deployments/$manifest"; then cp "deployments/$manifest" "$target/$manifest"; fi
done
# Private operational keys must accompany the private database/config backup.
# This directory is outside the checkout and is never included in a release.
if test -d /opt/pongit/secrets/rooms; then
  cp -a /opt/pongit/secrets/rooms "$target/rooms-secrets"
fi
if test -d /opt/pongit/secrets/independent; then
  cp -a /opt/pongit/secrets/independent "$target/independent-secrets"
fi
if test -f /opt/pongit/shared/early-payment-deployment/deployment.json; then
  cp /opt/pongit/shared/early-payment-deployment/deployment.json "$target/early-payment-deployment.json"
fi
cp RELEASE "$target/release.txt"
# Checksums cover every file in the backup and are listed relative to the backup
# directory, so the agent metadata and the bot command journal are verified after
# transfer too, not just the database dumps.
( cd "$target" && find . -type f ! -name SHA256SUMS ! -name SHA256SUMS.part ! -name complete -exec sha256sum {} + \
  | sed 's|^\([a-f0-9]\{64\}\)  \./|\1  |' | LC_ALL=C sort -k2 > SHA256SUMS.part && mv SHA256SUMS.part SHA256SUMS )
touch "$target/complete"
find /opt/pongit/shared/backups -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf -- {} +
printf 'Backup complete: %s\n' "$stamp"
