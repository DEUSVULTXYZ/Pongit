"""Restore the uploaded off-VPS final backup into isolated, disposable databases."""
import datetime, hashlib, json, pathlib, subprocess, sys, time

root=pathlib.Path('/opt/pongit/releases/reship-all-20261007')
inputs=root/'restore-inputs-final'
manifest=json.loads((inputs/'manifest.json').read_text())
original=root/'backup-final/manifest.json'
assert original.read_bytes()==(inputs/'manifest.json').read_bytes()
assert json.loads((root/'backup-final/off-vps.json').read_text())['verified']
assert len(manifest)==6
for name,item in manifest.items():
    p=inputs/name;assert p.parent==inputs and p.stat().st_size==item['bytes']
    assert hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256']
attempt=int(sys.argv[1]) if len(sys.argv)>1 else 1
assert 1<=attempt<=3
if attempt>1:
    previous='pongit-reship-restore-20261007'+('-'+str(attempt-1) if attempt>2 else '')
    state=json.loads(subprocess.check_output(['docker','inspect','-f','{{json .State}}',previous]))
    assert not state['Running'], 'Never overlap restore attempts'
suffix='-'+str(attempt) if attempt>1 else ''
name='pongit-reship-restore-20261007'+suffix
assert subprocess.run(['docker','inspect',name],capture_output=True).returncode!=0
image=subprocess.check_output(['docker','inspect','-f','{{.Image}}','pongit-postgres-1'],text=True).strip()
report={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':False,'manifestSha256':hashlib.sha256(original.read_bytes()).hexdigest(),'databases':[]}
output=root/('evidence/restore-final'+suffix+'.json');assert not output.exists()
def save(): output.write_text(json.dumps(report,indent=2))
def sql(database,query):
    return subprocess.check_output(['docker','exec',name,'psql','-v','ON_ERROR_STOP=1','-U','pongit_restore','-d',database,'-Atc',query],text=True).strip()
save()
subprocess.run(['docker','run','-d','--name',name,'--network','none','--memory','512m','--cpus','0.5','--tmpfs','/var/lib/postgresql/data:rw,size=1073741824',
    '-e','POSTGRES_USER=pongit_restore','-e','POSTGRES_HOST_AUTH_METHOD=trust',image],check=True,stdout=subprocess.DEVNULL)
try:
    for _ in range(60):
        # The entrypoint's temporary bootstrap server accepts Unix sockets but
        # stops before the real server starts. TCP readiness excludes that race.
        if subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','pongit_restore'],capture_output=True).returncode==0: break
        time.sleep(1)
    else: raise RuntimeError('Isolated restore database did not start')
    for i,label in enumerate(['operator','human','agents','previous-agents','shared-index']):
        database='reship_restore_'+str(i)
        subprocess.run(['docker','exec',name,'createdb','-U','pongit_restore',database],check=True)
        with (inputs/(label+'.dump')).open('rb') as source:
            result=subprocess.run(['docker','exec','-i',name,'pg_restore','-U','pongit_restore','-d',database,'--no-owner','--no-privileges','--exit-on-error'],stdin=source,capture_output=True,timeout=600)
        assert result.returncode==0, 'Restore failed for '+label+'; input retained'
        tables=int(sql(database,"SELECT count(*) FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')"))
        assert tables>0
        row={'label':label,'tables':tables}
        if label=='operator':
            row['reshipJobs']=int(sql(database,"SELECT count(*) FROM il_lifecycle_jobs WHERE id LIKE 'reusable-agents-20261007-1:%' OR id LIKE 'public-human-v3-20261007:%'"));assert row['reshipJobs']>100
        if label=='shared-index':
            row['historicalReferences']=int(sql(database,'SELECT count(*) FROM pongit_history.matches_raw'));assert row['historicalReferences']>=837
        report['databases'].append(row);save()
        # Only this freshly created scratch database is dropped, after verification.
        subprocess.run(['docker','exec',name,'dropdb','-U','pongit_restore',database],check=True)
    report['passed']=True
finally:
    subprocess.run(['docker','stop','-t','30',name],check=True,stdout=subprocess.DEVNULL)
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps(report))
