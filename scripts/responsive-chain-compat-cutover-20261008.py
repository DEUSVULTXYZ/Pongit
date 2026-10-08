"""Repair parameterless JSON-RPC reads, with the same idle check and original backup."""
import ast,datetime,hashlib,json,pathlib,subprocess,time,urllib.request
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
canonical=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json');mirror=root/'live/agent-compose.json'
output=root/'live/evidence/chain-compat-cutover-13.json';assert not output.exists()
build=json.loads((root/'build-chain-compat-13.json').read_text());assert build['passed'] and build['source']=='ca3977331b043dd774c5b19dbf35792fd8e4f80b'
backup=root/'backup-chain-12';proof=json.loads((backup/'off-vps.json').read_text())
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
assert canonical.read_bytes()==mirror.read_bytes();config=json.loads(canonical.read_text());previous=config['services']['reader']['image']
assert previous=='sha256:7c128465991558adbe8678bfce5f7a3fbc99b8edcccaebcf07c52f99eb2331d7'
inspect=lambda:json.loads(subprocess.check_output(['docker','inspect','pongit-arcade-five-reader-1']))[0]
assert inspect()['Image']==previous
tree=ast.parse((root/'responsive-chain-cutover-20261008.py').read_text())
script=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='script' for t in n.targets))
report={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'deadline':time.time()+720,'passed':False,'previousImage':previous,'image':build['image'],'stage':'idle','backupManifest':proof['manifestSha256']}
def save():output.write_text(json.dumps(report,indent=2))
save()
try:
 while time.time()<report['deadline']:
  check=subprocess.run(['docker','exec','-i','pongit-arcade-five-reader-1','node','--import','tsx','--input-type=module'],input=script,text=True,capture_output=True,timeout=45)
  if check.returncode==0:
   idle=json.loads(check.stdout.strip().splitlines()[-1]);report['lastCheck']=idle;save()
   if idle['idle']:break
  time.sleep(5)
 else:raise RuntimeError('Original idle bound expired')
 report['stage']='deploy';report['idle']=idle;save()
 rollback=root/'live/chain-compat-13.previous.private.json';assert not rollback.exists();rollback.write_bytes(canonical.read_bytes());rollback.chmod(0o600)
 config['services']['reader']['image']=build['image']
 for p in [canonical,mirror]:p.write_text(json.dumps(config,indent=2)+'\n');p.chmod(0o600)
 subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','--no-build','reader'],check=True,timeout=120,capture_output=True)
 assert inspect()['Image']==build['image'] and inspect()['State']['Running']
 for _ in range(20):
  try:
   req=urllib.request.Request('https://pongit.xyz/api/agents/chain-read',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'eth_chainId'}).encode(),headers={'Content-Type':'application/json'})
   with urllib.request.urlopen(req,timeout=10) as response:result=json.load(response)
   if result.get('result')=='0x279f':break
  except (OSError,TimeoutError):pass
  time.sleep(1)
 else:raise RuntimeError('Parameterless public read not restored')
 report.update(passed=True,stage='complete',parameterlessReadPassed=True,started=inspect()['State']['StartedAt'])
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps(report))
