"""Deploy foreground engine admission reads only, after idle and journal checks."""
import ast, datetime, hashlib, json, pathlib, subprocess, time

root = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
canonical = pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json')
mirror = root/'live/agent-compose.json'
output = root/'live/evidence/admission-cutover-22.json'
assert not output.exists()
build = json.loads((root/'build-admission-22.json').read_text())
assert build['passed'] and build['source'] == 'fd1838e5a80b4045c3729f476af2581b0991fe36'
backup = root/'backup-admission-22'
proof = json.loads((backup/'off-vps.json').read_text())
assert proof['verified'] and proof['manifestSha256'] == hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds() < 1800
assert canonical.read_bytes() == mirror.read_bytes()
config = json.loads(canonical.read_text())
previous = 'sha256:0085e14426dc245e32119646e64deb455f99c714862ed9c55c301fdce57c023d'
name = 'pongit-arcade-five-engines-1'
inspect = lambda: json.loads(subprocess.check_output(['docker','inspect',name]))[0]
assert inspect()['Image'] == previous and config['services']['engines']['image'] == previous
tree = ast.parse((root/'responsive-chain-cutover-20261008.py').read_text())
script = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id == 'script' for t in n.targets))
pending = """
import {Pool} from 'pg';
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL});
console.log(JSON.stringify({pending:Number((await db.query("SELECT count(*) FROM agent_pool.engine_jobs WHERE status='pending'")).rows[0].count)}));await db.end();
"""
ready = """
import {Pool} from 'pg';
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL});
const result=await db.query('SELECT count(*)::int AS n FROM agent_pool.health WHERE updated_at > $1',[process.argv[2]]);
console.log(JSON.stringify({fresh:result.rows[0].n}));await db.end();
"""
def call(container, source, args=()):
    run = subprocess.run(['docker','exec','-i',container,'node','--import','tsx','--input-type=module',*args],input=source,text=True,capture_output=True,timeout=45)
    assert run.returncode == 0, 'Read-only guard failed; inspect retained service evidence'
    return json.loads(run.stdout.strip().splitlines()[-1])
report = dict(startedAt=now(), deadline=time.time()+720, passed=False, stage='idle', previous=previous, image=build['image'], backupManifest=proof['manifestSha256'])
def save(): output.write_text(json.dumps(report,indent=2))
save()
try:
    while time.time() < report['deadline']:
        idle = call('pongit-arcade-five-reader-1',script)
        report['lastCheck'] = idle; save()
        if idle['idle'] and call(name,pending)['pending'] == 0:
            break
        time.sleep(5)
    else:
        raise RuntimeError('Original idle deadline expired')
    report.update(idle=idle,stage='deploy'); save()
    rollback = root/'live/admission-engine-22.previous.private.json'
    assert not rollback.exists()
    rollback.write_bytes(canonical.read_bytes()); rollback.chmod(0o600)
    config['services']['engines']['image'] = build['image']
    for path in [canonical,mirror]:
        path.write_text(json.dumps(config,indent=2)+'\n'); path.chmod(0o600)
    subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','--no-build','engines'],check=True,timeout=120,capture_output=True)
    current = inspect()
    assert current['Image'] == build['image'] and current['State']['Running']
    for _ in range(15):
        health = call(name,ready,('-', current['State']['StartedAt']))
        if health['fresh'] == 8:
            break
        time.sleep(2)
    else:
        raise RuntimeError('Eight fresh engine observations not established')
    report.update(passed=True,stage='complete',started=current['State']['StartedAt'],health=health)
finally:
    report['finishedAt'] = now(); save(); print(json.dumps(report))
