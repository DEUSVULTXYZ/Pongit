"""Add the verified responsive index to public history without rewriting rows."""
import datetime, hashlib, json, pathlib, subprocess

root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
report=root/'live/evidence/history-view-1.json'
rollback=root/'live/evidence/history-view-1.rollback.sql'
assert not report.exists() and not rollback.exists()
backup=root/'backup-events-4'
proof=json.loads((backup/'off-vps.json').read_text())
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
def sql(query):
    r=subprocess.run(['docker','exec','-i','pongit-reusable-agents2-db','psql','-U','pongit_agents','-d','reusable_shared_indexer14','-v','ON_ERROR_STOP=1','-At'],input=query,text=True,capture_output=True,timeout=60)
    assert r.returncode==0,'History SQL failed; no success claimed'
    return r.stdout.strip()
prior=sql("SELECT pg_get_viewdef('pongit_history.matches_raw'::regclass);")
schemas=['indexer','arcade_five_20260929','agents_live_20260929','agents_sync_20261003','human_v3_20261005','public_reship_20261007','public_reship_repeat_20261007']
assert all(f'FROM {s}."Match"' in prior for s in schemas)
assert 'public_responsive_20261008' not in prior
columns='id,deployment,"rawId",mode,ranked,"rulesVersion","playerA","playerB","tournamentId",status,winner,played,"scoreA","scoreB","endedAt","replayAvailability",block'
schemas.append('public_responsive_20261008')
union=' UNION ALL '.join(f'SELECT {columns},{i} AS source_priority FROM {s}."Match"' for i,s in enumerate(schemas,1))
statement=f'CREATE OR REPLACE VIEW pongit_history.matches_raw AS SELECT DISTINCT ON(id) {columns} FROM ({union}) all_matches ORDER BY id,block DESC,source_priority DESC;'
rollback.write_text('CREATE OR REPLACE VIEW pongit_history.matches_raw AS '+prior+'\n')
result=dict(startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),passed=False,backupManifest=proof['manifestSha256'],previousViewSha256=hashlib.sha256(prior.encode()).hexdigest())
report.write_text(json.dumps(result,indent=2))
try:
    output=sql('''BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE prior_history ON COMMIT DROP AS SELECT * FROM pongit_history.matches_raw;
DO $$ BEGIN
IF (SELECT count(*) FROM public_responsive_20261008."Match")<8 THEN RAISE EXCEPTION 'Responsive index is incomplete'; END IF;
IF EXISTS(SELECT 1 FROM public_responsive_20261008."Match" WHERE "rulesVersion"<>17) THEN RAISE EXCEPTION 'Unexpected index rules'; END IF;
END $$;
'''+statement+'''
DO $$ BEGIN
IF EXISTS(SELECT * FROM prior_history EXCEPT SELECT * FROM pongit_history.matches_raw) THEN RAISE EXCEPTION 'Historical data changed'; END IF;
IF EXISTS(SELECT id FROM public_responsive_20261008."Match" EXCEPT SELECT id FROM pongit_history.matches_raw) THEN RAISE EXCEPTION 'New results missing'; END IF;
END $$;
SELECT json_build_object('before',(SELECT count(*) FROM prior_history),'after',(SELECT count(*) FROM pongit_history.matches_raw),'new',(SELECT count(*) FROM public_responsive_20261008."Match"));
COMMIT;''')
    counts=json.loads(next(s for s in output.splitlines() if s.startswith('{')))
    result.update(passed=True,counts=counts,viewSha256=hashlib.sha256(statement.encode()).hexdigest())
finally:
    result['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    report.write_text(json.dumps(result,indent=2));print(json.dumps(result))
