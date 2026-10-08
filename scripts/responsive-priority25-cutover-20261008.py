"""Bounded quiescent RPC/human update. No chain writes, closures or DB restore."""
import ast,datetime,hashlib,json,pathlib,subprocess,time,urllib.request,yaml
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2');commit='f56b4c41895c4584517f6379eeb25afb204d3818'
rpcroot=pathlib.Path('/opt/pongit/current');override=rpcroot/'compose.override.yaml'
human=pathlib.Path('/opt/pongit/releases/human-v3-20261005/human-runtime.json');mirror=root/'live/human-runtime.json'
agent=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json')
output=root/'live/evidence/priority-cutover-25.json';assert not output.exists()
build={k:json.loads((root/('build-priority25-'+k+'.json')).read_text()) for k in ['rpc','human']}
assert all(v['passed'] and v['source']==commit for v in build.values())
backup=root/'backup-priority-25';proof=json.loads((backup/'off-vps.json').read_text())
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
inspect=lambda n:json.loads(subprocess.check_output(['docker','inspect',n]))[0]
previous={'rpc':'sha256:db15d5d83a6a5ce73c8a32ec3a3c03badfbe9cbc430e3121279b253651bb6e80','human':'sha256:9b4929eda2faa243b8c4d1fe3f2bd56a9500501c3b029647af10db76ac85d88d'}
names={'rpc':'pongit-rpc-1','human':'pongit-relayer-1'}
for k,n in names.items():assert inspect(n)['Image']==previous[k]
assert human.read_bytes()==mirror.read_bytes();config=json.loads(human.read_text());assert config['services']['relayer']['image']==previous['human']
before=override.read_text();parsed=yaml.safe_load(before);assert parsed['services']['rpc']['image']==previous['rpc'] and before.count(previous['rpc'])==1
after=before.replace(previous['rpc'],build['rpc']['image']);expected=json.loads(json.dumps(parsed));expected['services']['rpc']['image']=build['rpc']['image'];assert yaml.safe_load(after)==expected
# Existing identities/nonce databases are read privately, never printed.
env=dict(v.split('=',1) for v in inspect(names['human'])['Config']['Env']);humanDb=env['PONG_INDEPENDENT_DATABASE_URL']
readguard=ast.parse((root/'responsive-chain-cutover-20261008.py').read_text())
idleScript=next(ast.literal_eval(n.value) for n in readguard.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='script' for t in n.targets))
def call(container,source):
 p=subprocess.run(['docker','exec','-i',container,'node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=45)
 assert p.returncode==0,'Read-only cutover guard failed';return json.loads(p.stdout.strip().splitlines()[-1])
humanScript="import {Pool} from 'pg';const db=new Pool({connectionString:"+json.dumps(humanDb)+"});console.log(JSON.stringify({pending:Number((await db.query(\"SELECT count(*) FROM independent_operations WHERE status IN ('queued','pending')\")).rows[0].count)}));await db.end();"
sponsorScript="import {Pool} from 'pg';const db=new Pool({connectionString:process.env.DATABASE_URL});console.log(JSON.stringify({pending:Number((await db.query(\"SELECT count(*) FROM independent_operations WHERE status IN ('queued','pending')\")).rows[0].count)}));await db.end();"
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
report=dict(startedAt=now(),deadline=time.time()+720,passed=False,stage='idle',previous=previous,images={k:v['image'] for k,v in build.items()},backupManifest=proof['manifestSha256']);stopped=[]
def save():output.write_text(json.dumps(report,indent=2))
def compose(args,kind):
 files=['-f',str(human)] if kind=='human' else ['-f',str(rpcroot/'compose.yaml'),'-f',str(override)]
 subprocess.run(['docker','compose','-p','pongit',*files,*args],cwd=human.parent if kind=='human' else rpcroot,check=True,capture_output=True,timeout=120)
save()
try:
 while time.time()<report['deadline']:
  idle=call('pongit-arcade-five-reader-1',idleScript);report['lastCheck']=idle;save()
  if idle['idle'] and call('pongit-arcade-five-reader-1',humanScript)['pending']==0 and call('pongit-arcade-five-sponsor-1',sponsorScript)['pending']==0:break
  time.sleep(5)
 else:raise RuntimeError('Original idle deadline expired')
 # Stop admissions first, not physics. Recheck canonically before replacing
 # anything; a racing admission aborts and resumes all unchanged services.
 for name in ['pongit-arcade-five-admission-1','pongit-arcade-five-sponsor-1']:
  stopped.append(name);subprocess.run(['docker','stop','--time','20',name],capture_output=True,check=True,timeout=40)
 stopped.append(names['human']);subprocess.run(['docker','stop','--time','20',names['human']],capture_output=True,check=True,timeout=40)
 idle=call('pongit-arcade-five-reader-1',idleScript);assert idle['idle'],'Racing match: resume old services and preserve it'
 assert call('pongit-arcade-five-reader-1',humanScript)['pending']==0,'New intake: restore old service before deployment'
 report.update(stage='deploy',idle=idle);save()
 for label,path in [('priority25-human.previous.private.json',human),('priority25-rpc.previous.private.yaml',override)]:
  p=root/'live'/label;assert not p.exists();p.write_bytes(path.read_bytes());p.chmod(0o600)
 override.write_text(after);compose(['up','-d','--no-deps','--no-build','rpc'],'rpc')
 config['services']['relayer']['image']=build['human']['image']
 for p in [human,mirror]:p.write_text(json.dumps(config,indent=2)+'\n');p.chmod(0o600)
 compose(['up','-d','--no-deps','--no-build','relayer'],'human')
 for k,n in names.items():assert inspect(n)['Image']==build[k]['image'] and inspect(n)['State']['Running']
 for _ in range(45):
  try:
   with urllib.request.urlopen('https://pongit.xyz/api/independent/config',timeout=8) as response:d=json.load(response)
   if d.get('admission') and all(a.get('online') for a in d['arenas']):break
  except (OSError,TimeoutError):pass
  time.sleep(1)
 else:raise RuntimeError('Human API/arena readiness did not return within bound')
 report.update(passed=True,stage='complete',started={k:inspect(n)['State']['StartedAt'] for k,n in names.items()})
finally:
 for name in stopped:
  if not inspect(name)['State']['Running']:subprocess.run(['docker','start',name],capture_output=True,check=True,timeout=60)
 report['finishedAt']=now();save();print(json.dumps(report))
