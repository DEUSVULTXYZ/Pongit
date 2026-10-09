"""Replace only the web image after an idle, backed-up production boundary."""
import ast,datetime,hashlib,json,pathlib,subprocess,time,urllib.request,yaml
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
output=root/'live/evidence/entry-cutover-64.json';assert not output.exists()
webBuild=json.loads((root/'build-admission-web-64.json').read_text());assert webBuild['passed'] and webBuild['source']=='45a22e4e5864ee234901b8f6275046a75e68a9b2'
previousWeb='sha256:659082c148ce7dbb8cbcb2425666444f5fc562f6f0f1c00f2d8e98c03280c96b'
previous='sha256:0cb0b8e44f25f83160074ce36507f621df556ce2d9a584795bd2df9f929b1258'
backup=root/'backup-entry-63';proof=json.loads((backup/'off-vps.json').read_text())
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
inspect=lambda n:json.loads(subprocess.check_output(['docker','inspect',n]))[0]
assert inspect('pongit-arcade-five-reader-1')['Image']==previous
canonical=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json');mirror=root/'live/agent-compose.json'
before=canonical.read_text();assert before==mirror.read_text();parsed=json.loads(before)
assert parsed['services']['reader']['image']==previous
assert parsed['services']['arcade-web']['image']==previousWeb and inspect('pongit-arcade-five-arcade-web-1')['Image']==previousWeb
parsed['services']['arcade-web']['image']=webBuild['image'];after=json.dumps(parsed,indent=2)+'\n'
def writeConfig(value):
 for p in [canonical,mirror]:p.write_text(value);p.chmod(0o600)

tree=ast.parse((root/'responsive-chain-cutover-20261008.py').read_text())
idleScript=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='script' for t in n.targets))
env=dict(v.split('=',1) for v in inspect('pongit-relayer-1')['Config']['Env'])
humanDb=env['PONG_INDEPENDENT_DATABASE_URL']
agentDb=dict(v.split('=',1) for v in inspect('pongit-arcade-five-sponsor-1')['Config']['Env'])['DATABASE_URL']
def call(container,script):
 p=subprocess.run(['docker','exec','-i',container,'node','--import','tsx','--input-type=module'],input=script,text=True,capture_output=True,timeout=45)
 assert p.returncode==0,'Read-only deployment guard failed';return json.loads(p.stdout.strip().splitlines()[-1])
def pending(container,connection):
 return call(container,"import {Pool} from 'pg';const db=new Pool({connectionString:"+connection+"});console.log(JSON.stringify({count:Number((await db.query(\"SELECT count(*) FROM independent_operations WHERE status IN ('queued','pending')\")).rows[0].count)}));await db.end();")['count']
def deploy():
 subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','--no-build','arcade-web'],capture_output=True,check=True,timeout=120)

now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
report=dict(startedAt=now(),deadline=time.time()+720,passed=False,stage='idle',previous=previous,image=previous,webImage=webBuild['image'],previousWeb=previousWeb,backupManifest=proof['manifestSha256']);stopped=[];changed=False
save=lambda:output.write_text(json.dumps(report,indent=2))
save()
try:
 # Quiesce NEW agent scheduling before looking for an idle boundary. A graceful
 # admission stop may finish an already signed transaction. Engines and archive
 # remain running so that any such match finishes naturally; never cancel it.
 assert time.time()<report['deadline'],'Original deadline already expired'
 admission='pongit-arcade-five-admission-1'
 stopped.append(admission)
 subprocess.run(['docker','stop','--time','20',admission],capture_output=True,check=True,timeout=40)
 report['admissionStoppedAt']=now();save()
 while time.time()<report['deadline']:
  idle=call('pongit-arcade-five-reader-1',idleScript);report['lastCheck']=idle;save()
  if idle['idle'] and pending('pongit-arcade-five-reader-1',json.dumps(humanDb))==0 and pending('pongit-arcade-five-sponsor-1','process.env.DATABASE_URL')==0:break
  time.sleep(5)
 else:raise RuntimeError('Original idle deadline expired')
 for name in ['pongit-arcade-five-sponsor-1','pongit-relayer-1']:
  stopped.append(name);subprocess.run(['docker','stop','--time','20',name],capture_output=True,check=True,timeout=40)
 idle=call('pongit-arcade-five-reader-1',idleScript);assert idle['idle'],'Racing game: preserve it and resume old services'
 assert pending('pongit-arcade-five-reader-1',json.dumps(humanDb))==0
 assert pending('pongit-arcade-five-reader-1',json.dumps(agentDb))==0
 assert time.time()<report['deadline'],'Original deadline reached before deployment'
 report.update(stage='deploy',idle=idle);save()
 p=root/'live/entry64-web.previous.private.json';assert not p.exists();p.write_bytes(canonical.read_bytes());p.chmod(0o600)
 writeConfig(after);changed=True;deploy()
 assert inspect('pongit-arcade-five-reader-1')['Image']==previous and inspect('pongit-arcade-five-reader-1')['State']['Running']
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
