"""Read only, bounded engine metadata for the preserved match 1491 pause."""
import datetime
import json
import pathlib
import subprocess

OUT = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/evidence/pause1491-engine-metadata.json')
assert not OUT.exists(), 'Preserve original evidence'
container = 'pongit-arcade-five-database-1'
description = json.loads(subprocess.check_output(['docker', 'inspect', container]))[0]
settings = dict(item.split('=', 1) for item in description['Config']['Env'] if '=' in item)
user = settings.get('POSTGRES_USER', 'postgres')
sql = """
SELECT coalesce(json_agg(row_to_json(j)), '[]'::json) FROM (
 SELECT app, operation, epoch, nonce, hash, status, created_at, updated_at,
   resolution->>'kind' AS resolution_kind,
   resolution->>'block' AS block,
   round(extract(epoch FROM (updated_at-created_at))*1000,3) AS elapsed_ms
 FROM agent_pool.engine_jobs
 WHERE created_at BETWEEN '2026-10-09 09:37:48+00' AND '2026-10-09 09:38:02+00'
 ORDER BY created_at
 LIMIT 1000
) j;
"""
rows = json.loads(subprocess.check_output(['docker', 'exec', '-i', container, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', 'agent_five'], input=sql.encode()))
report = {'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'readOnly': True, 'rows': rows}
OUT.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'path': str(OUT), 'rows': len(rows), 'readOnly': True}))
