#!/usr/bin/env bash
set -euo pipefail
test "$#" -eq 1 && [[ "$1" =~ ^[a-f0-9]{40}$ ]] || { echo 'Usage: rollback-v4.sh COMMIT'; exit 1; }
target="/opt/pongit/releases/$1"
test -f "$target/deployments/testnet.json"
cd /opt/pongit/current
if [[ -f ops/APP_PROTOCOL_VERSION ]] && ! [[ -f "$target/ops/APP_PROTOCOL_VERSION" && "$(cat "$target/ops/APP_PROTOCOL_VERSION")" == "$(cat ops/APP_PROTOCOL_VERSION)" ]]; then
  echo "Rollback rejected: select a release supporting the current input and replay-retention APIs."; exit 1
fi
if [[ -f deployments/rooms-finance.json ]] && ! cmp -s deployments/rooms-finance.json "$target/deployments/rooms-finance.json"; then
  echo "Rollback rejected: preserve every accepted rooms finance binding. Use ops/rollback-rooms.sh for the V4 homepage fallback."; exit 1
fi
# Refuse a V1 binary or a different set of immutable contracts. Signed V4 jobs
# cannot safely be handed to the V1/V2/V3 relayers.
docker compose exec -T relayer node -e '
 const fs=require("fs"); const active=JSON.parse(fs.readFileSync("/app/deployments/testnet.json"));
 const target=JSON.parse(fs.readFileSync(0,"utf8"));
 if(target.version!==4 || ["chainId","game","market","vault","tournaments","arcade"].some(k=>target[k]!==active[k]) || JSON.stringify(target.legacy)!==JSON.stringify(active.legacy)) process.exit(1);
' < "$target/deployments/testnet.json"
bash ops/backup.sh </dev/null
(cd "$target" && docker compose build web relayer </dev/null)
docker compose stop relayer </dev/null
ln -sfn "$target" /opt/pongit/current
cd /opt/pongit/current
docker compose up -d --no-deps web relayer </dev/null
echo "V4 application restored to $1; contract deployments and persistent journal preserved."
