"""Replace only the web image after an off-VPS backup and an idle-lane check."""
import datetime, hashlib, json, pathlib, subprocess

root = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
canonical = pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json')
mirror = root / 'live/agent-compose.json'
report = root / 'live/evidence/feedback-web-cutover-9.json'
assert not report.exists()
load = lambda path: json.loads(path.read_text())
build = load(root / 'build-feedback-web-9.json')
assert build['passed'] and build['source'] == '05d7711499feddda0d914128a0d2190ae8d3c35a'
backup = root / 'backup-touch-final-8'
proof = load(backup / 'off-vps.json')
assert proof['verified'] and proof['manifestSha256'] == hashlib.sha256((backup / 'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds() < 1800
assert canonical.read_bytes() == mirror.read_bytes()
config = load(canonical)
previous = config['services']['arcade-web']['image']
assert previous == 'sha256:a54733a76f1062dc0544c659c037a49d32bb5a97cc3471abf27c4dab77fa9b55'
inspection = json.loads(subprocess.check_output(['docker','inspect','pongit-arcade-five-arcade-web-1']))[0]
assert inspection['Image'] == previous
script = '''
import assert from 'node:assert/strict';
import {createPublicClient,http} from 'viem';
import {reusableAgentPoolAbi as abi} from './shared/abi-ReusableAgentPool.ts';
const client=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
const block=await client.getBlock();
const lanes=await Promise.all([0,1,2,3,4].map(lane=>client.readContract({address:'0xe01c31f482113367c510a04816ff371676477fa3',abi,functionName:'laneRecord',args:[lane],blockNumber:block.number})));
assert(lanes.every(l=>l.ref.id===0n||l.captured),'Live match: postpone web cutover');
assert.equal((await client.getBlock({blockNumber:block.number})).hash,block.hash);
console.log(JSON.stringify({block:String(block.number),hash:block.hash,empty:lanes.length}));
'''
check = subprocess.run(['docker','exec','-i','pongit-arcade-five-reader-1','node','--import','tsx','--input-type=module'],
                       input=script,text=True,capture_output=True,timeout=90)
assert check.returncode == 0, 'Idle check failed; no web change'
idle = json.loads(check.stdout.strip().splitlines()[-1])
rollback = root / 'live/feedback-web-9.previous.private.json'
assert not rollback.exists()
rollback.write_bytes(canonical.read_bytes()); rollback.chmod(0o600)
result = dict(startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), previousImage=previous,
              image=build['image'], idle=idle, backupManifest=proof['manifestSha256'], passed=False)
report.write_text(json.dumps(result,indent=2))
try:
    config['services']['arcade-web']['image'] = build['image']
    for path in [canonical, mirror]:
        path.write_text(json.dumps(config,indent=2)+'\n'); path.chmod(0o600)
    subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','arcade-web'],check=True,timeout=120)
    current = json.loads(subprocess.check_output(['docker','inspect','pongit-arcade-five-arcade-web-1']))[0]
    assert current['Image'] == build['image'] and current['State']['Running']
    result.update(passed=True,started=current['State']['StartedAt'])
finally:
    result['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    report.write_text(json.dumps(result,indent=2)); print(json.dumps(result))
