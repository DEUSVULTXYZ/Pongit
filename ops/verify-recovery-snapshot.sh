#!/usr/bin/env bash
set -euo pipefail
umask 077
stamp=${1:?Snapshot timestamp required}
[[ "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]
source=/opt/pongit/shared/backups/$stamp
work=/opt/pongit/tests/human-recovery-20260919/restore-$stamp
mkdir -p "$work"
name=pongit-recovery-restore-$stamp
if docker inspect "$name" >/dev/null 2>&1; then echo 'Existing restore container; inspect before retry'; exit 1; fi
docker run --name "$name" --network none --memory 512m --cpus .75 -e POSTGRES_USER=pong -e POSTGRES_HOST_AUTH_METHOD=trust -v "$source:/backup:ro" -d postgres:17-alpine >/dev/null
trap 'docker rm -f "$name" >/dev/null' EXIT
for i in $(seq 1 30); do if docker exec "$name" pg_isready -U pong >/dev/null 2>&1; then break; fi; sleep 1; done
for dump in "$source"/*.dump; do
  db=$(basename "$dump" .dump)
  docker exec "$name" createdb -U pong "$db"
  docker exec "$name" pg_restore -U pong -d "$db" --exit-on-error --no-owner --no-privileges "/backup/$db.dump" > "$work/$db.log" 2>&1
  docker exec "$name" pg_restore --data-only --file=- "/backup/$db.dump" > "$work/$db.before.sql"
  docker exec "$name" pg_dump -U pong -d "$db" --data-only --no-owner --no-privileges > "$work/$db.after.sql"
  printf 'RESTORED=%s\n' "$db"
done
