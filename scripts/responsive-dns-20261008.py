"""Scoped resolver correction before any responsive public admission.

The VPS resolver returned NXDOMAIN for fresh Fly IPv4 records already served by
Cloudflare. HTTPS with those resolved addresses verified the expected live app.
No host-wide DNS change, repeated creation, or delegation mutation is performed.
"""
import datetime, hashlib, json, os, pathlib, shutil, subprocess

os.umask(0o077)
root = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
live = root / 'live'
evidence = live / 'evidence/dns-correction.json'
assert not evidence.exists(), 'Inspect the preserved attempt before retrying'
agent_path = pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json')
human_path = pathlib.Path('/opt/pongit/releases/human-v3-20261005/human-runtime.json')
load = lambda p: json.loads(p.read_text())
agents, humans = load(agent_path), load(human_path)
assert agents == load(live/'agent-compose.json')
assert humans == load(live/'human-runtime.json')
manifest = load(live/'metadata/manifest.json')
assert not manifest['enabled'] and not manifest['tournamentsEnabled']
assert manifest['pool'].lower() == '0xe01c31f482113367c510a04816ff371676477fa3'
assert humans['services']['relayer']['environment']['PONG_INDEPENDENT_ADMISSION'] == 'false'
assert any(load(p).get('passed') for p in (root/'agents/evidence').glob('open-arenas-*.json'))
roles = ['reader','sponsor','admission','maintenance','archive','engines']
proof = """
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createPublicClient,http,zeroHash} from 'viem';import {reusableAgentPoolAbi as p} from './shared/abi-ReusableAgentPool.ts';
const m=JSON.parse(await readFile('/metadata/manifest.json','utf8'));
const c=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
const b=await c.getBlock();assert.equal(await c.readContract({address:m.pool,abi:p,functionName:'publicAdmissions',blockNumber:b.number}),false);
for(let i=0;i<5;i++)assert.equal(await c.readContract({address:m.pool,abi:p,functionName:'laneMatch',args:[BigInt(i)],blockNumber:b.number}),zeroHash);
console.log(JSON.stringify({block:String(b.number),pool:m.pool,emptyLanes:5,publicAdmissions:false}));
"""
check = subprocess.run(['docker','exec','-i','pongit-arcade-five-reader-1','node','--import','tsx','--input-type=module'],input=proof,text=True,capture_output=True,timeout=90)
assert check.returncode == 0, 'Read-only empty-lane guard failed'
canonical = json.loads(check.stdout.strip().splitlines()[-1])
backup = root/'dns-config-backup';backup.mkdir(mode=0o700)
for source,name in [(agent_path,'agents.json'),(human_path,'human.json')]:
    shutil.copy2(source,backup/name);(backup/name).chmod(0o600)
report = {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'passed':False,
    'canonical':canonical, 'resolvers':['1.1.1.1','1.0.0.1'], 'roles':roles+['human-relayer'],
    'before':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in backup.iterdir()},
    'delegationClosures':0,'sessionCreations':0}
def write(path,value):
    path.write_text(json.dumps(value,indent=2)+'\n');path.chmod(0o600)
write(evidence,report)
for role in roles: agents['services'][role]['dns'] = report['resolvers']
humans['services']['relayer']['dns'] = report['resolvers']
for path,value in [(agent_path,agents),(live/'agent-compose.json',agents),(human_path,humans),(live/'human-runtime.json',humans)]:write(path,value)
try:
    subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(agent_path),'up','-d','--no-deps',*roles],check=True)
    subprocess.run(['docker','compose','-p','pongit','-f',str(human_path),'up','-d','--no-deps','relayer'],check=True)
    report['passed'] = True
finally:
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();write(evidence,report)
print(json.dumps(report))
