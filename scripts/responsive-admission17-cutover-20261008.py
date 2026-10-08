"""Bounded idle-only web cutover. Backends and all chain state remain unchanged."""
import ast,datetime,hashlib,json,pathlib,subprocess,time,urllib.request
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
canonical=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json');mirror=root/'live/agent-compose.json'
output=root/'live/evidence/admission-cutover-17.json';assert not output.exists()
build=json.loads((root/'build-admission-web-17.json').read_text());assert build['passed'] and build['source']=='791bef9c95e0233d25926de0ee653bdf17132dcd'
backup=root/'backup-admission-16';proof=json.loads((backup/'off-vps.json').read_text())
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
assert canonical.read_bytes()==mirror.read_bytes();config=json.loads(canonical.read_text())
previous='sha256:1e21ba11cc15832b7a2513843dae39bc0f623bcaca047dbf3322f55fb6048323';assert config['services']['arcade-web']['image']==previous
inspect=lambda:json.loads(subprocess.check_output(['docker','inspect','pongit-arcade-five-arcade-web-1']))[0]
assert inspect()['Image']==previous
tree=ast.parse((root/'responsive-chain-cutover-20261008.py').read_text())
script=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='script' for t in n.targets))
report={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'deadline':time.time()+720,'passed':False,'stage':'idle','previousImage':previous,'image':build['image'],'backupManifest':proof['manifestSha256']}
def save():output.write_text(json.dumps(report,indent=2))
save()
try:
 while time.time()<report['deadline']:
  check=subprocess.run(['docker','exec','-i','pongit-arcade-five-reader-1','node','--import','tsx','--input-type=module'],input=script,text=True,capture_output=True,timeout=45)
  if check.returncode==0:
   idle=json.loads(check.stdout.strip().splitlines()[-1]);report['lastCheck']=idle;save()
   if idle['idle']:break
  time.sleep(5)
 else:raise RuntimeError('Original idle deadline expired')
 rollback=root/'live/admission-web-17.previous.private.json';assert not rollback.exists();rollback.write_bytes(canonical.read_bytes());rollback.chmod(0o600)
 report.update(stage='deploy',idle=idle);save();config['services']['arcade-web']['image']=build['image']
 for path in [canonical,mirror]:path.write_text(json.dumps(config,indent=2)+'\n');path.chmod(0o600)
 subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','--no-build','arcade-web'],check=True,timeout=120,capture_output=True)
 assert inspect()['Image']==build['image'] and inspect()['State']['Running']
 for _ in range(20):
  try:
   with urllib.request.urlopen('https://pongit.xyz/agents',timeout=10) as response:
    if response.status==200:break
  except (TimeoutError,OSError):pass
  time.sleep(1)
 else:raise RuntimeError('Public catalogue readiness failed')
 report.update(passed=True,stage='complete',started=inspect()['State']['StartedAt'])
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps(report))
