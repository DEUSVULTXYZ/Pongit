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
for manifest in interlude-rooms.json interlude-rooms-classic.json rooms-finance.json; do
  if test -f "deployments/$manifest"; then cp "deployments/$manifest" "$target/$manifest"; fi
done
# Private operational keys must accompany the private database/config backup.
# This directory is outside the checkout and is never included in a release.
if test -d /opt/pongit/secrets/rooms; then
  cp -a /opt/pongit/secrets/rooms "$target/rooms-secrets"
fi
cp RELEASE "$target/release.txt"
sha256sum "$target"/*.dump > "$target/SHA256SUMS"
touch "$target/complete"
find /opt/pongit/shared/backups -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf -- {} +
printf 'Backup complete: %s\n' "$stamp"
