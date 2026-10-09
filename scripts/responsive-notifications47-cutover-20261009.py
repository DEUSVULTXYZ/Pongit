"""Replace only the canonical configuration reader after an idle, backed-up production boundary."""
import ast,datetime,hashlib,json,pathlib,subprocess,time,urllib.request,yaml
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
output=root/'live/evidence/notifications-cutover-47.json';assert not output.exists()
build=json.loads((root/'build-notifications47b.json').read_text())
assert build['passed'] and build['source']=='cf0b4587829d473ecc6ddcef23f278e563953dd7'
webBuild=json.loads((root/'build-admission-web-47.json').read_text());assert webBuild['passed'] and webBuild['source']==build['source']
previousWeb='sha256:756aa07e66f6efaacbecfe23d25c37fcd658aea5a7bc6b31a3363142c43c04bd'
previous='sha256:1b42d6aacc7b5e08508a39a3bdcd7cca7c8547a83bd8c2f03459ac57f686b09c'
backup=root/'backup-notifications-47';proof=json.loads((backup/'off-vps.json').read_text())
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
inspect=lambda n:json.loads(subprocess.check_output(['docker','inspect',n]))[0]
assert inspect('pongit-arcade-five-reader-1')['Image']==previous
canonical=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json');mirror=root/'live/agent-compose.json'
before=canonical.read_text();assert before==mirror.read_text();parsed=json.loads(before)
assert parsed['services']['reader']['image']==previous
assert parsed['services']['arcade-web']['image']==previousWeb and inspect('pongit-arcade-five-arcade-web-1')['Image']==previousWeb
parsed['services']['reader']['image']=build['image'];parsed['services']['arcade-web']['image']=webBuild['image'];after=json.dumps(parsed,indent=2)+'\n'
def writeConfig(value):
 for p in [canonical,mirror]:p.write_text(value);p.chmod(0o600)

tree=ast.parse((root/'responsive-chain-cutover-20261008.py').read_text())
idleScript=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='script' for t in n.targets))
env=dict(v.split('=',1) for v in inspect('pongit-relayer-1')['Config']['Env'])
humanDb=env['PONG_INDEPENDENT_DATABASE_URL']
def call(container,script):
 p=subprocess.run(['docker','exec','-i',container,'node','--import','tsx','--input-type=module'],input=script,text=True,capture_output=True,timeout=45)
 assert p.returncode==0,'Read-only deployment guard failed';return json.loads(p.stdout.strip().splitlines()[-1])
def pending(container,connection):
 return call(container,"import {Pool} from 'pg';const db=new Pool({connectionString:"+connection+"});console.log(JSON.stringify({count:Number((await db.query(\"SELECT count(*) FROM independent_operations WHERE status IN ('queued','pending')\")).rows[0].count)}));await db.end();")['count']
def deploy():
 subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','--no-build','reader','arcade-web'],capture_output=True,check=True,timeout=120)

now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
report=dict(startedAt=now(),deadline=time.time()+720,passed=False,stage='idle',previous=previous,image=build['image'],webImage=webBuild['image'],previousWeb=previousWeb,backupManifest=proof['manifestSha256']);stopped=[];changed=False
save=lambda:output.write_text(json.dumps(report,indent=2))
save()
try:
 while time.time()<report['deadline']:
  idle=call('pongit-arcade-five-reader-1',idleScript);report['lastCheck']=idle;save()
  if idle['idle'] and pending('pongit-arcade-five-reader-1',json.dumps(humanDb))==0 and pending('pongit-arcade-five-sponsor-1','process.env.DATABASE_URL')==0:break
  time.sleep(5)
 else:raise RuntimeError('Original idle deadline expired')
 for name in ['pongit-arcade-five-admission-1','pongit-arcade-five-sponsor-1','pongit-relayer-1']:
  stopped.append(name);subprocess.run(['docker','stop','--time','20',name],capture_output=True,check=True,timeout=40)
 idle=call('pongit-arcade-five-reader-1',idleScript);assert idle['idle'],'Racing game: preserve it and resume old services'
 assert pending('pongit-arcade-five-reader-1',json.dumps(humanDb))==0
 report.update(stage='deploy',idle=idle);save()
 p=root/'live/notifications47-reader.previous.private.json';assert not p.exists();p.write_bytes(canonical.read_bytes());p.chmod(0o600)
 writeConfig(after);changed=True;deploy()
 assert inspect('pongit-arcade-five-reader-1')['Image']==build['image'] and inspect('pongit-arcade-five-reader-1')['State']['Running']
 healthy=call('pongit-arcade-five-engines-1',"const until=Date.now()+30000;let ok=false;while(Date.now()<until){try{const r=await fetch('http://pongit-arcade-five-reader-1:4101/healthz');const v=await r.json();ok=r.ok&&v.process==='alive';if(ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}console.log(JSON.stringify({ok}));")
 assert healthy['ok']
 assert inspect('pongit-arcade-five-arcade-web-1')['Image']==webBuild['image'] and inspect('pongit-arcade-five-arcade-web-1')['State']['Running']
 for attempt in range(20):
  try:
   with urllib.request.urlopen('https://pongit.xyz/agents',timeout=10) as response:
    if response.status==200:break
  except (TimeoutError,OSError):pass
  time.sleep(1)
 else:raise RuntimeError('Public catalogue readiness failed')
 report['webStarted']=inspect('pongit-arcade-five-arcade-web-1')['State']['StartedAt']
 report.update(passed=True,stage='complete',started=inspect('pongit-arcade-five-reader-1')['State']['StartedAt'])
except Exception as error:
 report['error']=str(error)
 if changed:
  writeConfig(before);deploy();report['rolledBack']=inspect('pongit-arcade-five-reader-1')['Image']==previous and inspect('pongit-arcade-five-arcade-web-1')['Image']==previousWeb
 raise
finally:
 for name in stopped:
  if not inspect(name)['State']['Running']:subprocess.run(['docker','start',name],capture_output=True,check=True,timeout=60)
 report['finishedAt']=now();save();print(json.dumps(report))
