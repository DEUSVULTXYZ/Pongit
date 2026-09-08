#!/usr/bin/env bash
set -euo pipefail
cd /opt/pongit/current
test -f deployments/rooms-finance.json
test -f relayer/src/rooms-lifecycle.ts
bash ops/backup.sh </dev/null
# A rooms financial journal must never be handed to a pre-rooms relayer.
# Keep this compatible binary and all manifests. Return the homepage to V4.
python3 - <<'PY'
from pathlib import Path
p=Path('/opt/pongit/current/.env').resolve()
assert p==Path('/opt/pongit/shared/runtime.env'), 'Unexpected runtime configuration'
text=p.read_text()
for key in ['PONG_ROOMS_HOME','ROOMS_ADMISSION_ENABLED']:
    rows=[line for line in text.splitlines() if not line.startswith(key+'=')]
    text='\n'.join(rows+[key+'=false'])+'\n'
p.write_text(text)
p.chmod(0o600)
PY
docker compose up -d --no-deps web relayer </dev/null
echo 'V4 homepage restored. Existing rooms can finish; rooms payments, renewal and nonce journals remain supported.'
