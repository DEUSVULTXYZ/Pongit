"""Idle-only gateway diagnostics and local-signing sponsor release. No contract change."""
import ast,datetime,hashlib,json,pathlib,subprocess,time,yaml
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
canonical=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json');mirror=root/'live/agent-compose.json'
rpcroot=pathlib.Path('/opt/pongit/current');override=rpcroot/'compose.override.yaml'
output=root/'live/evidence/admission-cutover-19.json';assert not output.exists()
build=json.loads((root/'build-admission-19.json').read_text());assert build['passed'] and build['source']=='f85d8a7c9e9c99375320cc1f2f9d33cc68265a00'
backup=root/'backup-admission-19';proof=json.loads((backup/'off-vps.json').read_text())
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
assert canonical.read_bytes()==mirror.read_bytes();config=json.loads(canonical.read_text())
previous={'rpc':'sha256:9980088c91d70b2b9e36861a80074690a277779a2688e689ea23f67a7a5bc62e','sponsor':'sha256:9980088c91d70b2b9e36861a80074690a277779a2688e689ea23f67a7a5bc62e'}
previous['reader']='sha256:70d0db338fbc8e708abab7f0463edef6f5460c23c147e7c6f1f474a8abd1c3c2'
inspect=lambda n:json.loads(subprocess.check_output(['docker','inspect',n]))[0]
names={'rpc':'pongit-rpc-1','sponsor':'pongit-arcade-five-sponsor-1','reader':'pongit-arcade-five-reader-1'}
for k,n in names.items():assert inspect(n)['Image']==previous[k]
assert config['services']['sponsor']['image']==previous['sponsor']
assert config['services']['reader']['image']==previous['reader']
before=override.read_text();parsed=yaml.safe_load(before);assert parsed['services']['rpc']['image']==previous['rpc'] and before.count(previous['rpc'])==1
after=before.replace(previous['rpc'],build['image']);expected=json.loads(json.dumps(parsed));expected['services']['rpc']['image']=build['image'];assert yaml.safe_load(after)==expected
tree=ast.parse((root/'responsive-chain-cutover-20261008.py').read_text())
script=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='script' for t in n.targets))
pending="""
import {Pool} from 'pg';
const db=new Pool({connectionString:process.env.DATABASE_URL});
console.log(JSON.stringify({pending:Number((await db.query("SELECT count(*) FROM independent_operations WHERE status IN ('queued','pending')")).rows[0].count)}));await db.end();
"""
report={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'deadline':time.time()+720,'passed':False,'stage':'idle','previous':previous,'image':build['image'],'backupManifest':proof['manifestSha256']}
def save():output.write_text(json.dumps(report,indent=2))
save()
try:
 while time.time()<report['deadline']:
  check=subprocess.run(['docker','exec','-i','pongit-arcade-five-reader-1','node','--import','tsx','--input-type=module'],input=script,text=True,capture_output=True,timeout=45)
  if check.returncode==0:
   idle=json.loads(check.stdout.strip().splitlines()[-1]);report['lastCheck']=idle;save()
   if idle['idle']:
    p=subprocess.run(['docker','exec','-i',names['sponsor'],'node','--import','tsx','--input-type=module'],input=pending,text=True,capture_output=True,check=True,timeout=20)
    if json.loads(p.stdout.strip().splitlines()[-1])['pending']==0:break
  time.sleep(5)
 else:raise RuntimeError('Original idle deadline expired')
 report['idle']=idle;report['stage']='deploy';save()
 for name,path in [('admission-agent-19.previous.private.json',canonical),('admission-rpc-19.previous.private.yaml',override)]:
  target=root/'live'/name;assert not target.exists();target.write_bytes(path.read_bytes());target.chmod(0o600)
 override.write_text(after)
 subprocess.run(['docker','compose','-p','pongit','-f',str(rpcroot/'compose.yaml'),'-f',str(override),'up','-d','--no-deps','--no-build','rpc'],cwd=rpcroot,check=True,timeout=120,capture_output=True)
 assert inspect(names['rpc'])['Image']==build['image']
 config['services']['sponsor']['image']=build['image']
 config['services']['reader']['image']=build['image']
 for path in [canonical,mirror]:path.write_text(json.dumps(config,indent=2)+'\n');path.chmod(0o600)
 subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','--no-build','sponsor','reader'],check=True,timeout=120,capture_output=True)
 assert inspect(names['sponsor'])['Image']==build['image']
 assert inspect(names['reader'])['Image']==build['image']
 probe="fetch('http://127.0.0.1:4102/healthz').then(r=>r.json()).then(x=>{if(!x.sponsorship.available)throw Error('Sponsor not ready');console.log('ready')})"
 for _ in range(20):
  r=subprocess.run(['docker','exec',names['sponsor'],'node','-e',probe],capture_output=True,text=True,timeout=10)
  if r.returncode==0:break
  time.sleep(1)
 else:raise RuntimeError('Sponsor readiness failed')
 report.update(passed=True,stage='complete',started={k:inspect(n)['State']['StartedAt'] for k,n in names.items()})
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps(report))
