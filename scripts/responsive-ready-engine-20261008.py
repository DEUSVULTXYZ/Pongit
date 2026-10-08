"""Build and deploy only the reviewed readiness cadence, with idle and journal fences."""
import datetime, hashlib, json, os, pathlib, subprocess, sys, tarfile

root = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit = 'd55833436dbaff7743bc80c3aa817ba4e0dadf57'
base = 'sha256:9414d534bc5930795a8b64e707d3e30e25d7fd330a33f285ac9e2dfeb2ae21fa'
load = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
action = sys.argv[1]
assert action in ['build', 'cutover']

if action == 'build':
    archive = root / 'ready-source-d558334.tar.gz'
    package = load(root / 'ready-package.json')
    assert package['commit'] == commit and sha(archive) == package['sha256']
    path = root / 'build-ready-engine-1.json'
    assert not path.exists()
    disk = os.statvfs('/')
    used = 100*(disk.f_blocks-disk.f_bfree)/(disk.f_blocks-disk.f_bfree+disk.f_bavail)
    assert used < 80, ('Scoped cleanup required', used)
    source = root / 'ready-build-d558334'
    assert not source.exists()
    source.mkdir()
    with tarfile.open(archive, 'r:gz') as tar:
        tar.extractall(source, filter='data')
    lock = '2b7fdc137a66d595279202d9bcb6526b38bc3644a1666594cc2135ec6f51d8ce'
    assert sha(source/'package-lock.json') == lock
    (source/'Dockerfile.ready').write_text(f'''FROM {base}
USER root
RUN cd /app && echo "{lock}  package-lock.json" | sha256sum -c - && node -e "if(process.versions.node!=='24.21.0')process.exit(1)"
RUN rm -rf /app/shared /app/relayer /app/scripts /app/web /app/agent-sdk /app/contracts /app/deployments /app/tests /app/docs
COPY --chown=node:node . /app
LABEL org.opencontainers.image.revision="{commit}"
USER node
WORKDIR /app
''')
    result = dict(startedAt=now(), source=commit, archiveSha256=sha(archive), base=base, diskBefore=used, passed=False)
    path.write_text(json.dumps(result, indent=2))
    log = root/'build-ready-engine-1.log'
    try:
        with log.open('x') as f:
            run = subprocess.run(['docker','build','--memory','512m','--cpu-quota','100000','-f','Dockerfile.ready','-t','pongit:ready-d558334','.'],cwd=source,stdout=f,stderr=subprocess.STDOUT,timeout=600)
        assert run.returncode == 0, 'Build failed; preserve evidence'
        result.update(image=json.loads(subprocess.check_output(['docker','image','inspect','pongit:ready-d558334']))[0]['Id'],passed=True)
    finally:
        result.update(finishedAt=now(),logSha256=sha(log))
        path.write_text(json.dumps(result, indent=2)); print(json.dumps(result))
else:
    path = root/'live/evidence/ready-engine-cutover-1.json'
    assert not path.exists()
    build = load(root/'build-ready-engine-1.json')
    assert build['passed'] and build['source'] == commit
    backup = root/'backup-replay-5'
    proof = load(backup/'off-vps.json')
    assert proof['verified'] and proof['manifestSha256'] == sha(backup/'manifest.json')
    assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds() < 1800
    canonical = pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json')
    mirror = root/'live/agent-compose.json'
    assert canonical.read_bytes() == mirror.read_bytes()
    config = load(canonical)
    assert config['services']['engines']['image'] == base
    current = json.loads(subprocess.check_output(['docker','inspect','pongit-arcade-five-engines-1']))[0]
    assert current['Image'] == base and current['State']['Running']
    script = '''
import assert from 'node:assert/strict';
import {createPublicClient,http} from 'viem';
import {Pool} from 'pg';
import {reusableAgentPoolAbi as abi} from './shared/abi-ReusableAgentPool.ts';
const client=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
const block=await client.getBlock();
const lanes=await Promise.all([0,1,2,3,4].map(lane=>client.readContract({address:'0xe01c31f482113367c510a04816ff371676477fa3',abi,functionName:'laneRecord',args:[lane],blockNumber:block.number})));
assert(lanes.every(l=>l.ref.id===0n||l.captured),'Active match: postpone engine cutover');
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL});
try {
 const jobs=await db.query("SELECT count(*)::int AS n FROM agent_pool.engine_jobs WHERE status='pending'");
 assert.equal(jobs.rows[0].n,0,'Uncertain engine command: postpone cutover');
 assert.equal((await client.getBlock({blockNumber:block.number})).hash,block.hash);
 console.log(JSON.stringify({block:String(block.number),hash:block.hash,idleLanes:lanes.length,pending:0}));
} finally {await db.end();}
'''
    check = subprocess.run(['docker','exec','-i','pongit-arcade-five-engines-1','node','--import','tsx','--input-type=module'],input=script,text=True,capture_output=True,timeout=90)
    assert check.returncode == 0, 'Idle/journal check failed; no change'
    idle = json.loads(check.stdout.strip().splitlines()[-1])
    rollback = root/'live/ready-engine-1.previous.private.json'
    assert not rollback.exists()
    rollback.write_bytes(canonical.read_bytes()); rollback.chmod(0o600)
    result = dict(startedAt=now(),source=commit,previousImage=base,image=build['image'],idle=idle,backupManifest=proof['manifestSha256'],passed=False)
    path.write_text(json.dumps(result,indent=2))
    try:
        config['services']['engines']['image'] = build['image']
        for p in [canonical,mirror]:
            p.write_text(json.dumps(config,indent=2)+'\n');p.chmod(0o600)
        subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','engines'],check=True,timeout=120)
        current = json.loads(subprocess.check_output(['docker','inspect','pongit-arcade-five-engines-1']))[0]
        assert current['Image'] == build['image'] and current['State']['Running']
        result.update(passed=True,started=current['State']['StartedAt'])
    finally:
        result['finishedAt'] = now();path.write_text(json.dumps(result,indent=2));print(json.dumps(result))
