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
  "${database_exec[@]}" psql -U "$database_user" -d "$1" -At <<'SQL'
SELECT format('SELECT %L || count(*) FROM %I.%I;', table_schema || '.' || table_name || ':', table_schema, table_name)
FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name
\gexec
SQL
}
for dump in "$backup"/*.dump; do
  database=$(basename "$dump" .dump)
  [[ "$database" =~ ^pong_(agents|relayer|indexer(_[a-z0-9]+)*)$ ]] || { echo "Unexpected database name in backup"; exit 1; }
  database_exec=(docker compose exec -T postgres); database_user=pong; source_database=$database
  if test "$database" = pong_agents; then
    agent_db=$(docker ps --filter label=com.docker.compose.project=pongit --filter label=com.docker.compose.service=agent-db --format '{{.ID}}')
    [[ "$agent_db" =~ ^[a-f0-9]+$ ]] || { echo 'Expected one dedicated agent database'; exit 1; }
    database_exec=(docker exec -i "$agent_db"); database_user=agents; source_database=agents
  fi
  scratch="${database}_restore_verify_$$"
  "${database_exec[@]}" createdb -U "$database_user" "$scratch" </dev/null
  "${database_exec[@]}" pg_restore -U "$database_user" -d "$scratch" --no-owner --exit-on-error < "$backup/$database.dump"
  expected=$(counts "$source_database")
  actual=$(counts "$scratch")
  test "$expected" = "$actual" || { echo "Count mismatch in $scratch; preserved for inspection"; exit 1; }
  printf 'PASS: %s restored into %s; all table counts identical.\n%s\n' "$database" "$scratch" "$actual"
  # Only the exact scratch database created above is removed; source databases remain untouched.
  "${database_exec[@]}" dropdb -U "$database_user" "$scratch" </dev/null
done
