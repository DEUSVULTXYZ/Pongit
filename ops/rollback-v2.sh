#!/usr/bin/env bash
set -euo pipefail
test "$#" -eq 1 && [[ "$1" =~ ^[a-f0-9]{40}$ ]] || { echo 'Usage: rollback-v2.sh COMMIT'; exit 1; }
target="/opt/pongit/releases/$1"
test -f "$target/deployments/testnet.json"
cd /opt/pongit/current
# Refuse a V1 binary or a different set of immutable contracts. Signed V2 jobs
# cannot safely be handed to the original V1 relayer.
docker compose exec -T relayer node -e '
 const fs=require("fs"); const active=JSON.parse(fs.readFileSync("/app/deployments/testnet.json"));
 const target=JSON.parse(fs.readFileSync(0,"utf8"));
 if(target.version!==2 || ["chainId","game","market","vault","tournaments"].some(k=>target[k]!==active[k]) || target.legacy?.game!==active.legacy?.game) process.exit(1);
' < "$target/deployments/testnet.json"
bash ops/backup.sh </dev/null
(cd "$target" && docker compose build web relayer </dev/null)
docker compose stop relayer </dev/null
ln -sfn "$target" /opt/pongit/current
cd /opt/pongit/current
docker compose up -d --no-deps web relayer </dev/null
echo "V2 application restored to $1; contract deployments and persistent journal preserved."
