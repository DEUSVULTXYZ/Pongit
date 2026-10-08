"""Replace only admission after an idle, fresh-backup boundary; preserve journals."""
import ast,datetime,hashlib,json,pathlib,subprocess,time
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
output=root/'live/evidence/keeper-cutover-29.json';assert not output.exists()
build=json.loads((root/'build-keeper29.json').read_text());assert build['passed'] and build['source']=='3aaa5c27f549ec455172ef2c5a1220905bd1a078'
backup=root/'backup-keeper-29';proof=json.loads((backup/'off-vps.json').read_text())
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
canonical=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json');mirror=root/'live/agent-compose.json'
before=canonical.read_bytes();assert before==mirror.read_bytes()
config=json.loads(before);name='pongit-arcade-five-admission-1'
inspect=lambda:json.loads(subprocess.check_output(['docker','inspect',name]))[0]
assert config['services']['admission']['image']==build['parent']==inspect()['Image']
operatorUrl=dict(v.split('=',1) for v in inspect()['Config']['Env'])['DATABASE_URL']
tree=ast.parse((root/'responsive-chain-cutover-20261008.py').read_text())
script=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='script' for t in n.targets))
pending="""import {Pool} from 'pg';const db=new Pool({connectionString:process.env.DATABASE_URL});console.log(JSON.stringify({count:Number((await db.query("SELECT count(*) FROM il_lifecycle_jobs WHERE status='pending' AND id LIKE '%-maintenance-admission:%'")).rows[0].count)}));await db.end();"""
def read(container,code):
 p=subprocess.run(['docker','exec','-i',container,'node','--import','tsx','--input-type=module'],input=code,text=True,capture_output=True,timeout=45)
 assert p.returncode==0,'Read-only boundary guard failed';return json.loads(p.stdout.strip().splitlines()[-1])
def deploy():subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','--no-build','admission'],capture_output=True,check=True,timeout=120)
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
report={'startedAt':now(),'deadline':time.time()+720,'passed':False,'stage':'idle','image':build['image'],'previous':build['parent'],'backupManifest':proof['manifestSha256']}
save=lambda:output.write_text(json.dumps(report,indent=2))
changed=False;stopped=False;save()
try:
 while time.time()<report['deadline']:
  report['lastCheck']=read('pongit-arcade-five-reader-1',script);save()
  if report['lastCheck']['idle'] and read(name,pending)['count']==0:break
  time.sleep(5)
 else:raise RuntimeError('Original idle deadline expired')
 subprocess.run(['docker','stop','--time','30',name],check=True,capture_output=True,timeout=45);stopped=True
 assert inspect()['State']['ExitCode']==0,'Admission did not stop cleanly'
 assert read('pongit-arcade-five-reader-1',pending.replace('process.env.DATABASE_URL',json.dumps(operatorUrl)))['count']==0
 report['idle']=read('pongit-arcade-five-reader-1',script);assert report['idle']['idle'],'Racing game preserved'
 prior=root/'live/keeper29-admission.previous.private.json';assert not prior.exists();prior.write_bytes(before);prior.chmod(0o600)
 config['services']['admission']['image']=build['image'];after=(json.dumps(config,indent=2)+'\n').encode()
 for p in [canonical,mirror]:p.write_bytes(after);p.chmod(0o600)
 changed=True;report['stage']='deploy';save();deploy()
 time.sleep(5);actual=inspect();assert actual['State']['Running'] and actual['Image']==build['image']
 report.update(passed=True,stage='complete',started=actual['State']['StartedAt'])
except Exception as e:
 report['error']=str(e)
 if changed:
  for p in [canonical,mirror]:p.write_bytes(before)
  deploy();report['rolledBack']=inspect()['Image']==build['parent']
 raise
finally:
 if stopped and not inspect()['State']['Running']:subprocess.run(['docker','start',name],capture_output=True,check=True,timeout=60)
 report['finishedAt']=now();save();print(json.dumps(report))
