#!/usr/bin/env bash
set -euo pipefail
test "$#" -eq 1 || { echo 'Usage: bash ops/verify-backup.sh BACKUP_DIRECTORY'; exit 1; }
backup=$(realpath "$1")
case "$backup" in /opt/pongit/shared/backups/*) ;; *) echo 'Expected a PONGIT backup directory'; exit 1;; esac
test -f "$backup/complete"
cd /opt/pongit/current
sha256sum -c "$backup/SHA256SUMS"
# For exact count comparison, stop the writers before taking the tested backup.
counts() {
  docker compose exec -T postgres psql -U pong -d "$1" -At <<'SQL'
SELECT format('SELECT %L || count(*) FROM %I.%I;', table_schema || '.' || table_name || ':', table_schema, table_name)
FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name
\gexec
SQL
}
for database in pong_relayer pong_indexer pong_indexer_v2 pong_indexer_v2_47dba35e; do
  test -f "$backup/$database.dump" || continue
  scratch="${database}_restore_verify_$$"
  docker compose exec -T postgres createdb -U pong "$scratch" </dev/null
  docker compose exec -T postgres pg_restore -U pong -d "$scratch" --no-owner --exit-on-error < "$backup/$database.dump"
  expected=$(counts "$database")
  actual=$(counts "$scratch")
  test "$expected" = "$actual" || { echo "Count mismatch in $scratch; preserved for inspection"; exit 1; }
  printf 'PASS: %s restored into %s; all table counts identical.\n%s\n' "$database" "$scratch" "$actual"
  # Only the exact scratch database created above is removed; source databases remain untouched.
  docker compose exec -T postgres dropdb -U pong "$scratch" </dev/null
done
