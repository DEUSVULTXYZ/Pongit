#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /opt/pongit/current
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target=/opt/pongit/shared/backups/$stamp
mkdir -p "$target"
databases=$(docker compose exec -T postgres psql -U pong -d postgres -Atc "SELECT datname FROM pg_database WHERE datname='pong_relayer' OR datname ~ '^pong_indexer(_[a-z0-9_]+)?$' ORDER BY datname" </dev/null)
for database in $databases; do
  [[ "$database" =~ ^pong_[a-z0-9_]+$ ]] || exit 1
  if ! docker compose exec -T postgres psql -U pong -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='$database'" </dev/null | grep -qx 1; then continue; fi
  docker compose exec -T postgres pg_dump -U pong -d "$database" -Fc </dev/null > "$target/$database.dump"
  test -s "$target/$database.dump"
done
cp .env "$target/runtime.env"
cp deployments/testnet.json "$target/deployment.json"
cp RELEASE "$target/release.txt"
sha256sum "$target"/*.dump > "$target/SHA256SUMS"
touch "$target/complete"
find /opt/pongit/shared/backups -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf -- {} +
printf 'Backup complete: %s\n' "$stamp"
