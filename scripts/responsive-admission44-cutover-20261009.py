"""Idle-only web/archive cutover. Same contracts, journals and continuous epochs."""
import ast,datetime,hashlib,json,pathlib,subprocess,time,urllib.request
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
output=root/'live/evidence/admission-cutover-44.json';assert not output.exists()
build=json.loads((root/'build-admission44b.json').read_text());web=json.loads((root/'build-admission-web-44.json').read_text())
assert all(b['passed'] and b['source']=='dc05ba9fd98d1b98fa3268a81a0137f880f66510' for b in [build,web])
previous={'archive':'sha256:9414d534bc5930795a8b64e707d3e30e25d7fd330a33f285ac9e2dfeb2ae21fa',
 'arcade-web':'sha256:f04cf43665ce2613c1e5d2a4673c516aac4a0e42caab560ee8a44286cf1ee098'}
backup=root/'backup-admission-44';proof=json.loads((backup/'off-vps.json').read_text())
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
inspect=lambda n:json.loads(subprocess.check_output(['docker','inspect',n]))[0]
canonical=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json');mirror=root/'live/agent-compose.json'
before=canonical.read_text();assert before==mirror.read_text();config=json.loads(before)
for role,image in previous.items():
 assert config['services'][role]['image']==image and inspect('pongit-arcade-five-'+role+'-1')['Image']==image
config['services']['archive']['image']=build['image'];config['services']['arcade-web']['image']=web['image']
after=json.dumps(config,indent=2)+'\n'
tree=ast.parse((root/'responsive-chain-cutover-20261008.py').read_text())
idleScript=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='script' for t in n.targets))
env=lambda n:dict(v.split('=',1) for v in inspect(n)['Config']['Env'])
humanDb=env('pongit-relayer-1')['PONG_INDEPENDENT_DATABASE_URL']
archiveEnv=env('pongit-arcade-five-archive-1');journalDb=archiveEnv['DATABASE_URL'];archiveOwner=archiveEnv['PONG_AGENT_ROLE_ADDRESS'].lower()
def call(container,script):
 p=subprocess.run(['docker','exec','-i',container,'node','--import','tsx','--input-type=module'],input=script,text=True,capture_output=True,timeout=45)
 assert p.returncode==0,'Read-only deployment guard failed';return json.loads(p.stdout.strip().splitlines()[-1])
def pending(container,connection):
 return call(container,"import {Pool} from 'pg';const db=new Pool({connectionString:"+connection+"});console.log(JSON.stringify({count:Number((await db.query(\"SELECT count(*) FROM independent_operations WHERE status IN ('queued','pending')\")).rows[0].count)}));await db.end();")['count']
def archivePending():
 return call('pongit-arcade-five-reader-1',"import {Pool} from 'pg';const db=new Pool({connectionString:"+json.dumps(journalDb)+"});console.log(JSON.stringify({count:Number((await db.query(\"SELECT count(*) FROM il_lifecycle_jobs WHERE owner=$1 AND status='pending'\",["+json.dumps(archiveOwner)+"])).rows[0].count)}));await db.end();")['count']
def writeConfig(value):
 for p in [canonical,mirror]:p.write_text(value);p.chmod(0o600)
def deploy():
 subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','--no-build','archive','arcade-web'],capture_output=True,check=True,timeout=120)
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
report=dict(startedAt=now(),deadline=time.time()+720,passed=False,stage='idle',previous=previous,image=build['image'],webImage=web['image'],backupManifest=proof['manifestSha256'])
stopped=[];changed=False
save=lambda:output.write_text(json.dumps(report,indent=2))
save()
try:
 while time.time()<report['deadline']:
  idle=call('pongit-arcade-five-reader-1',idleScript);report['lastCheck']=idle;save()
  if idle['idle'] and pending('pongit-arcade-five-reader-1',json.dumps(humanDb))==0 and pending('pongit-arcade-five-sponsor-1','process.env.DATABASE_URL')==0 and archivePending()==0:break
  time.sleep(5)
 else:raise RuntimeError('Original idle deadline expired')
 for name in ['pongit-arcade-five-admission-1','pongit-arcade-five-sponsor-1','pongit-relayer-1','pongit-arcade-five-archive-1']:
  stopped.append(name);subprocess.run(['docker','stop','--time','20',name],capture_output=True,check=True,timeout=40)
 idle=call('pongit-arcade-five-reader-1',idleScript);assert idle['idle'],'Racing game retained; resume old services'
 assert pending('pongit-arcade-five-reader-1',json.dumps(humanDb))==0 and archivePending()==0
 report.update(stage='deploy',idle=idle);save()
 p=root/'live/admission44.previous.private.json';assert not p.exists();p.write_bytes(canonical.read_bytes());p.chmod(0o600)
 writeConfig(after);changed=True;deploy()
 for role,image in [('archive',build['image']),('arcade-web',web['image'])]:
  c=inspect('pongit-arcade-five-'+role+'-1');assert c['Image']==image and c['State']['Running']
 for attempt in range(20):
  try:
   with urllib.request.urlopen('https://pongit.xyz/agents',timeout=10) as response:
    if response.status==200:break
  except (TimeoutError,OSError):pass
  time.sleep(1)
 else:raise RuntimeError('Public catalogue readiness failed')
 report.update(passed=True,stage='complete',started={role:inspect('pongit-arcade-five-'+role+'-1')['State']['StartedAt'] for role in previous})
except Exception as error:
 report['error']=str(error)
 if changed:
  writeConfig(before);deploy();report['rolledBack']=all(inspect('pongit-arcade-five-'+role+'-1')['Image']==image for role,image in previous.items())
 raise
finally:
 for name in stopped:
  if not inspect(name)['State']['Running']:subprocess.run(['docker','start',name],capture_output=True,check=True,timeout=60)
 report['finishedAt']=now();save();print(json.dumps(report))
