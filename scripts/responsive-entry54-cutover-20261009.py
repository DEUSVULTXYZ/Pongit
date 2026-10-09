"""Replace only the sponsor image after natural drain and exact journal guards."""
import ast,datetime,hashlib,json,pathlib,subprocess,time,urllib.request
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
output=root/'live/evidence/entry-cutover-54.json';assert not output.exists()
build=json.loads((root/'build-sponsor-54.json').read_text())
assert build['postgres']['passed'] and build['baseline']['expectedRegressionFailure']
assert build['passed'] and build['source']=='a4f12ec00f3064a4304d2474ccca50d0c7f0ea1d'
previous='sha256:69b669777a277f495b950ee467175f630c434a896e574d376c7b43e16114473b'
web='sha256:b246a10a913c0c9b21f0b02c0395c3f7dd388c60cca113379d6ab7f71f9bfbcb'
backup=root/'backup-entry-54';proof=json.loads((backup/'off-vps.json').read_text())
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
inspect=lambda n:json.loads(subprocess.check_output(['docker','inspect',n]))[0]
canonical=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json');mirror=root/'live/agent-compose.json'
before=canonical.read_text();assert before==mirror.read_text();parsed=json.loads(before)
assert parsed['services']['sponsor']['image']==previous and inspect('pongit-arcade-five-sponsor-1')['Image']==previous
assert parsed['services']['arcade-web']['image']==web and inspect('pongit-arcade-five-arcade-web-1')['Image']==web
parsed['services']['sponsor']['image']=build['image'];after=json.dumps(parsed,indent=2)+'\n'
tree=ast.parse((root/'responsive-chain-cutover-20261008.py').read_text())
idleScript=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='script' for t in n.targets))
humanDb=dict(v.split('=',1) for v in inspect('pongit-relayer-1')['Config']['Env'])['PONG_INDEPENDENT_DATABASE_URL']
agentDb=dict(v.split('=',1) for v in inspect('pongit-arcade-five-sponsor-1')['Config']['Env'])['DATABASE_URL']
apps=['0x264101ca1936cfd1b274f5ceba535e1378597dc4','0x077df08fa9ff9bbfcba2a3c6879bcf3b21efd3df','0x0dcfdd467f7d3d80194897429e85184f46f43e98','0xcc4fbf1df9b4bf61353660c40e8f05c5135c3b23','0x776f35918da25f0b594fea72911dde5efc93e48e','0x4e9fa437576b1b2b386fe1ec24d26839434effb2','0x21a573b3c39265d27ad98f70e8942fd55af54391','0x9e4c76aa3f83db0b854e0ae968df38bce29ab123']
def call(script):
 p=subprocess.run(['docker','exec','-i','pongit-arcade-five-reader-1','node','--import','tsx','--input-type=module'],input=script,text=True,capture_output=True,timeout=45)
 assert p.returncode==0,'Read-only deployment guard failed'
 return json.loads(p.stdout.strip().splitlines()[-1])
def journals():
 script="import {Pool} from 'pg';const values=[];for(const url of "+json.dumps([humanDb,agentDb])+"){const db=new Pool({connectionString:url});values.push(Number((await db.query(\"SELECT count(*) FROM independent_operations WHERE status IN ('queued','pending')\")).rows[0].count));await db.end();}"
 script+="const db=new Pool({connectionString:"+json.dumps(agentDb)+"});values.push(Number((await db.query(\"SELECT count(*) FROM agent_pool.engine_jobs WHERE status='pending' AND lower(app)=ANY($1::text[])\",["+json.dumps(apps)+"])).rows[0].count));await db.end();console.log(JSON.stringify(values));"
 return call(script)
def writeConfig(text):
 for p in [canonical,mirror]:p.write_text(text);p.chmod(0o600)
def deploy():
 subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','--no-build','sponsor'],capture_output=True,check=True,timeout=120)
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
report=dict(startedAt=now(),deadline=time.time()+720,passed=False,previous=previous,image=build['image'],backupManifest=proof['manifestSha256'])
save=lambda:output.write_text(json.dumps(report,indent=2))
stopped=[];changed=False;save()
try:
 admission='pongit-arcade-five-admission-1';stopped.append(admission)
 subprocess.run(['docker','stop','--time','20',admission],capture_output=True,check=True,timeout=40)
 report['admissionStoppedAt']=now();save()
 while time.time()<report['deadline']:
  idle=call(idleScript);pending=journals();report.update(lastCheck=idle,pending=pending);save()
  if idle['idle'] and pending==[0,0,0]:break
  time.sleep(5)
 else:raise RuntimeError('Original idle deadline expired')
 for name in ['pongit-arcade-five-sponsor-1','pongit-relayer-1']:
  stopped.append(name);subprocess.run(['docker','stop','--time','20',name],capture_output=True,check=True,timeout=40)
 idle=call(idleScript);assert idle['idle'],'Racing game: preserve and resume old services'
 assert journals()==[0,0,0] and time.time()<report['deadline']
 name='pongit-arcade-five-sponsor-1'
 assert inspect(name)['State']['ExitCode']==0,'Original sponsor did not stop cleanly; retain journal and inspect'
 assert journals()==[0,0,0]
 rollback=root/'live/entry54-sponsor.previous.private.json';assert not rollback.exists();rollback.write_text(before);rollback.chmod(0o600)
 writeConfig(after);changed=True;deploy()
 assert inspect(name)['Image']==build['image'] and inspect(name)['State']['Running']
 assert inspect('pongit-arcade-five-arcade-web-1')['Image']==web
 with urllib.request.urlopen('https://pongit.xyz/api/agents/config',timeout=15) as response:config=json.load(response)
 assert config['enabled'] and config['rulesVersion']==17 and config['maxMatches']==5
 report.update(passed=True,idle=idle,pending=[0,0,0],started=inspect(name)['State']['StartedAt'])
except Exception as error:
 report['error']=str(error)
 if changed:
  if journals()==[0,0,0]:writeConfig(before);deploy();report['rolledBack']=inspect('pongit-arcade-five-sponsor-1')['Image']==previous
  else:report['rollbackDeferred']='Preserve accepted operations with the new sole nonce owner'
 raise
finally:
 for name in stopped:
  if not inspect(name)['State']['Running']:subprocess.run(['docker','start',name],capture_output=True,check=True,timeout=60)
 report['finishedAt']=now();save();print(json.dumps(report))
