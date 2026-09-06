#!/usr/bin/env bash
set -euo pipefail
test "$#" -eq 1 || { echo 'Usage: bash ops/restore.sh /opt/pongit/shared/backups/TIMESTAMP'; exit 1; }
backup=$(realpath "$1")
case "$backup" in /opt/pongit/shared/backups/*) ;; *) echo 'Expected a PONGIT backup directory'; exit 1;; esac
test -f "$backup/complete"
cd /opt/pongit/current
cmp deployments/testnet.json "$backup/deployment.json" || { echo 'Restore the matching release and signing environment first'; exit 1; }
sha256sum -c "$backup/SHA256SUMS"
docker compose stop relayer indexer hasura
for dump in "$backup"/*.dump; do
  database=$(basename "$dump" .dump)
  [[ "$database" =~ ^pong_(relayer|indexer(_[a-z0-9_]+)?)$ ]] || { echo 'Unexpected database name'; exit 1; }
  docker compose exec -T postgres psql -U pong -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='$database'" </dev/null | grep -qx 1 || { echo "Create the matching database and role before restore: $database"; exit 1; }
  docker compose exec -T postgres pg_restore -U pong -d "$database" --clean --if-exists --exit-on-error < "$backup/$database.dump"
done
docker compose up -d hasura indexer relayer
