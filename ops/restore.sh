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
for database in pong_relayer pong_indexer pong_indexer_v2 pong_indexer_v2_47dba35e; do
  test -f "$backup/$database.dump" || continue
  docker compose exec -T postgres pg_restore -U pong -d "$database" --clean --if-exists --exit-on-error < "$backup/$database.dump"
done
docker compose up -d hasura indexer relayer
