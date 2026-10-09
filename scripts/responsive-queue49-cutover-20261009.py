"""Replace only the RPC scheduler after an idle, backed-up production boundary."""
import ast,datetime,hashlib,json,pathlib,subprocess,time,urllib.request,yaml
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
output=root/'live/evidence/rpc-cutover-49.json';assert not output.exists()
build=json.loads((root/'build-queue49.json').read_text())
assert build['passed'] and build['source']=='edc24df3fd1bcdbfba39a62b09c04caac4bda3e1'
previous='sha256:e0a0c9be4b9b2f32ec5987ae6aca8925978a738abd731d9b00f96b62ec5e2b5a'
backup=root/'backup-queue-49';proof=json.loads((backup/'off-vps.json').read_text())
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
inspect=lambda n:json.loads(subprocess.check_output(['docker','inspect',n]))[0]
assert inspect('pongit-rpc-1')['Image']==previous
directory=pathlib.Path('/opt/pongit/current');override=directory/'compose.override.yaml'
before=override.read_text();parsed=yaml.safe_load(before)
assert parsed['services']['rpc']['image']==previous and before.count(previous)==1
expected=json.loads(json.dumps(parsed));expected['services']['rpc']['image']=build['image']
assert expected['services']['rpc']['environment']['RPC_SPACING_MS']=='75'
assert expected['services']['rpc']['environment']['RPC_SECONDARY_SPACING_MS']=='85'
expected['services']['rpc']['environment']['RPC_SECONDARY_SPACING_MS']='60'
after=yaml.safe_dump(expected,sort_keys=False);assert yaml.safe_load(after)==expected
# Existing Ankr TESTNET policy:300/10s and12000/10min.60ms caps our
# secondary budget at16.67/s with headroom under the stricter20/s average.
# Primary75ms and automatic per-upstream cooldown/backoff remain unchanged.
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
 subprocess.run(['docker','compose','-p','pongit','-f',str(directory/'compose.yaml'),'-f',str(override),'up','-d','--no-deps','--no-build','rpc'],cwd=directory,capture_output=True,check=True,timeout=120)
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
report=dict(startedAt=now(),deadline=time.time()+720,passed=False,stage='idle',previous=previous,image=build['image'],backupManifest=proof['manifestSha256'],primarySpacingMs=75,secondarySpacingMs=60);stopped=[];changed=False
save=lambda:output.write_text(json.dumps(report,indent=2))
save()
try:
 admission='pongit-arcade-five-admission-1';stopped.append(admission)
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
 assert time.time()<report['deadline'],'Original idle deadline expired'
 report.update(stage='deploy',idle=idle);save()
 p=root/'live/queue49-rpc.previous.private.yaml';assert not p.exists();p.write_bytes(override.read_bytes());p.chmod(0o600)
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
