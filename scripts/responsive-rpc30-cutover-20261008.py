"""Replace only the RPC scheduler after an idle, backed-up production boundary."""
import ast,datetime,hashlib,json,pathlib,subprocess,time,urllib.request,yaml
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
output=root/'live/evidence/rpc-cutover-30.json';assert not output.exists()
build=json.loads((root/'build-rpc30.json').read_text())
assert build['passed'] and build['source']=='d91efed1d4d0e0734f485b38baad6854fb6fd59f'
previous='sha256:893cac77dc6f08921eab5aef6583bb1b31c7c12d21ad63b21767c1919d1c2c3e'
backup=root/'backup-rpc-30';proof=json.loads((backup/'off-vps.json').read_text())
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
inspect=lambda n:json.loads(subprocess.check_output(['docker','inspect',n]))[0]
assert inspect('pongit-rpc-1')['Image']==previous
directory=pathlib.Path('/opt/pongit/current');override=directory/'compose.override.yaml'
before=override.read_text();parsed=yaml.safe_load(before)
assert parsed['services']['rpc']['image']==previous and before.count(previous)==1
after=before.replace(previous,build['image']);expected=json.loads(json.dumps(parsed));expected['services']['rpc']['image']=build['image'];assert yaml.safe_load(after)==expected
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
 subprocess.run(['docker','compose','-p','pongit','-f',str(directory/'compose.yaml'),'-f',str(override),'up','-d','--no-deps','--no-build','rpc'],cwd=directory,capture_output=True,check=True,timeout=120)
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
report=dict(startedAt=now(),deadline=time.time()+720,passed=False,stage='idle',previous=previous,image=build['image'],backupManifest=proof['manifestSha256']);stopped=[];changed=False
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
 p=root/'live/rpc30-rpc.previous.private.yaml';assert not p.exists();p.write_bytes(override.read_bytes());p.chmod(0o600)
 override.write_text(after);changed=True;deploy()
 assert inspect('pongit-rpc-1')['Image']==build['image'] and inspect('pongit-rpc-1')['State']['Running']
 healthy=call('pongit-rpc-1',"const until=Date.now()+30000;let ok=false;while(Date.now()<until){try{const r=await fetch('http://127.0.0.1:8545',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[]})});const v=await r.json();ok=typeof v.result==='string'&&!v.error;if(ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}console.log(JSON.stringify({ok}));")
 assert healthy['ok'];report.update(passed=True,stage='complete',started=inspect('pongit-rpc-1')['State']['StartedAt'])
except Exception as error:
 report['error']=str(error)
 if changed:
  override.write_text(before);deploy();report['rolledBack']=inspect('pongit-rpc-1')['Image']==previous
 raise
finally:
 for name in stopped:
  if not inspect(name)['State']['Running']:subprocess.run(['docker','start',name],capture_output=True,check=True,timeout=60)
 report['finishedAt']=now();save();print(json.dumps(report))
