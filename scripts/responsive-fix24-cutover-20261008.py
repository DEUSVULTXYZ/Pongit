"""One idle-only RPC/web release. No contract, database or engine changes."""
import ast,datetime,hashlib,json,pathlib,subprocess,time,urllib.request,yaml
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
canonical=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json');mirror=root/'live/agent-compose.json'
rpcroot=pathlib.Path('/opt/pongit/current');override=rpcroot/'compose.override.yaml'
output=root/'live/evidence/fix-cutover-24.json';assert not output.exists()
commit='ce7968fead3fa1f62816d24b2b1a1e10a40c554d'
build={k:json.loads((root/file).read_text()) for k,file in [('web','build-admission-web-24-resume2.json'),('rpc','build-gateway-24.json')]}
assert all(v['passed'] and v['source']==commit for v in build.values())
backup=root/'backup-fix-24';proof=json.loads((backup/'off-vps.json').read_text())
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
assert canonical.read_bytes()==mirror.read_bytes();config=json.loads(canonical.read_text())
previous={'web':'sha256:36d757c8a8a3806740c68250f16f6fdc839f8c84b64185fca719eac79e5f0b80','rpc':'sha256:dbbf50f57dfa80ebd90a4c9ca23ba168d4aef0255e6411dc1db7d75ff6d285d7'}
names={'web':'pongit-arcade-five-arcade-web-1','rpc':'pongit-rpc-1'}
inspect=lambda n:json.loads(subprocess.check_output(['docker','inspect',n]))[0]
for k,n in names.items():assert inspect(n)['Image']==previous[k]
assert config['services']['arcade-web']['image']==previous['web']
before=override.read_text();parsed=yaml.safe_load(before);assert parsed['services']['rpc']['image']==previous['rpc'] and before.count(previous['rpc'])==1
after=before.replace(previous['rpc'],build['rpc']['image']);expected=json.loads(json.dumps(parsed));expected['services']['rpc']['image']=build['rpc']['image'];assert yaml.safe_load(after)==expected
tree=ast.parse((root/'responsive-chain-cutover-20261008.py').read_text())
script=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='script' for t in n.targets))
pending="""import {Pool} from 'pg';const db=new Pool({connectionString:process.env.DATABASE_URL});console.log(JSON.stringify({pending:Number((await db.query("SELECT count(*) FROM independent_operations WHERE status IN ('queued','pending')")).rows[0].count)}));await db.end();"""
def call(container,source):
 r=subprocess.run(['docker','exec','-i',container,'node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=45)
 assert r.returncode==0,'Read-only release guard failed';return json.loads(r.stdout.strip().splitlines()[-1])
report=dict(startedAt=now(),deadline=time.time()+720,passed=False,stage='idle',previous=previous,images={k:v['image'] for k,v in build.items()},backupManifest=proof['manifestSha256'])
def save():output.write_text(json.dumps(report,indent=2))
save()
try:
 while time.time()<report['deadline']:
  idle=call('pongit-arcade-five-reader-1',script);report['lastCheck']=idle;save()
  if idle['idle'] and call('pongit-arcade-five-sponsor-1',pending)['pending']==0:break
  time.sleep(5)
 else:raise RuntimeError('Original idle deadline expired')
 for name,path in [('fix24-agent.previous.private.json',canonical),('fix24-rpc.previous.private.yaml',override)]:
  target=root/'live'/name;assert not target.exists();target.write_bytes(path.read_bytes());target.chmod(0o600)
 report.update(stage='deploy',idle=idle);save()
 override.write_text(after)
 subprocess.run(['docker','compose','-p','pongit','-f',str(rpcroot/'compose.yaml'),'-f',str(override),'up','-d','--no-deps','--no-build','rpc'],cwd=rpcroot,check=True,timeout=120,capture_output=True)
 assert inspect(names['rpc'])['Image']==build['rpc']['image']
 config['services']['arcade-web']['image']=build['web']['image']
 for path in [canonical,mirror]:path.write_text(json.dumps(config,indent=2)+'\n');path.chmod(0o600)
 subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','--no-build','arcade-web'],check=True,timeout=120,capture_output=True)
 for k,n in names.items():assert inspect(n)['Image']==build[k]['image'] and inspect(n)['State']['Running']
 for _ in range(20):
  try:
   with urllib.request.urlopen('https://pongit.xyz/agents',timeout=10) as response:
    if response.status==200:break
  except (TimeoutError,OSError):pass
  time.sleep(1)
 else:raise RuntimeError('Public catalogue readiness failed')
 report.update(passed=True,stage='complete',started={k:inspect(n)['State']['StartedAt'] for k,n in names.items()})
finally:
 report['finishedAt']=now();save();print(json.dumps(report))
