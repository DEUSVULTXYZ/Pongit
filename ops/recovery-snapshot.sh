#!/usr/bin/env bash
# Read-only production export. No pruning, container restart or database mutation.
set -euo pipefail
umask 077
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target=/opt/pongit/shared/backups/$stamp
test ! -e "$target"
mkdir -m 700 "$target"
cd /opt/pongit/current
databases=$(docker exec pongit-postgres-1 psql -X -U pong -d postgres -Atc "SELECT datname FROM pg_database WHERE datname='pong_relayer' OR datname ~ '^pong_indexer(_[a-z0-9_]+)?$' OR datname ~ '^pong_human_rules[0-9]+$' ORDER BY datname")
for database in $databases; do
  [[ "$database" =~ ^pong_[a-z0-9_]+$ ]] || exit 1
  docker exec pongit-postgres-1 pg_dump -U pong -d "$database" -Fc > "$target/$database.dump"
  test -s "$target/$database.dump"
  docker exec -i pongit-postgres-1 pg_restore --list < "$target/$database.dump" > /dev/null
done
cp -L .env "$target/runtime.env"
cp RELEASE "$target/release.txt"
cp compose.yaml "$target/compose.yaml"
if test -f compose.override.yaml; then cp compose.override.yaml "$target/compose.override.yaml"; fi
cp -a deployments "$target/deployments"
cp -a /opt/pongit/secrets/rooms "$target/rooms-secrets"
if test -d /opt/pongit/secrets/independent; then
  cp -a /opt/pongit/secrets/independent "$target/independent-secrets"
fi
if test -d /opt/pongit/shared/early-payment-deployment; then
  cp -a /opt/pongit/shared/early-payment-deployment "$target/early-payment-deployment"
fi
docker inspect --format '{{.Name}} {{.Config.Image}} {{.Image}}' pongit-web-1 pongit-relayer-1 > "$target/images.txt"
cd "$target"
find . -type f ! -name SHA256SUMS ! -name complete -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
sha256sum --check --quiet SHA256SUMS
touch complete
printf 'SNAPSHOT=%s\n' "$target"
