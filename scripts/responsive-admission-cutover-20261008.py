"""Idle-only web and RPC priority release. No contract or gameplay writer change."""
import ast,datetime,hashlib,json,pathlib,subprocess,time,urllib.request,yaml
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
canonical=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json');mirror=root/'live/agent-compose.json'
rpcroot=pathlib.Path('/opt/pongit/current');override=rpcroot/'compose.override.yaml'
output=root/'live/evidence/admission-cutover-16.json';assert not output.exists()
load=lambda p:json.loads(p.read_text())
runtime=load(root/'build-admission-rpc-16.json');web=load(root/'build-admission-web-16.json')
assert runtime['passed'] and runtime['source'].startswith('d62f362')
assert web['passed'] and web['source']=='228c5b1955d75359cc3a6a034d3abb65c18b8f63'
backup=root/'backup-admission-16';proof=load(backup/'off-vps.json')
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
assert canonical.read_bytes()==mirror.read_bytes();config=load(canonical)
previous={'rpc':'sha256:51111873f07c5230375c1fe7adf06ca398953eaed9d06bd881de0ee8758f30c4','arcade-web':'sha256:7008dd05d9485bcf04fb1f91569131e4872cd90d32a1af4dd3e41dbcd28d970a'}
names={k:'pongit-rpc-1' if k=='rpc' else 'pongit-arcade-five-'+k+'-1' for k in previous}
inspect=lambda n:json.loads(subprocess.check_output(['docker','inspect',n]))[0]
for k,n in names.items():assert inspect(n)['Image']==previous[k]
assert config['services']['arcade-web']['image']==previous['arcade-web']
before=override.read_text();parsed=yaml.safe_load(before)
assert parsed['services']['rpc']['image']==previous['rpc'] and before.count(previous['rpc'])==1
after=before.replace(previous['rpc'],runtime['image']);expected=json.loads(json.dumps(parsed));expected['services']['rpc']['image']=runtime['image'];assert yaml.safe_load(after)==expected
tree=ast.parse((root/'responsive-chain-cutover-20261008.py').read_text())
script=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='script' for t in n.targets))
pending="""
import {Pool} from 'pg';const db=new Pool({connectionString:process.env.DATABASE_URL});
console.log(JSON.stringify({pending:Number((await db.query("SELECT count(*) FROM independent_operations WHERE status IN ('queued','pending')")).rows[0].count)}));await db.end();
"""
report={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'deadline':time.time()+720,'passed':False,'stage':'waiting-idle','previous':previous,'runtime':runtime['image'],'web':web['image'],'backupManifest':proof['manifestSha256']}
def save():output.write_text(json.dumps(report,indent=2))
save()
try:
 while time.time()<report['deadline']:
  check=subprocess.run(['docker','exec','-i','pongit-arcade-five-reader-1','node','--import','tsx','--input-type=module'],input=script,text=True,capture_output=True,timeout=45)
  if check.returncode==0:
   idle=json.loads(check.stdout.strip().splitlines()[-1]);report['lastCheck']=idle;save()
   if idle['idle']:
    p=subprocess.run(['docker','exec','-i','pongit-arcade-five-sponsor-1','node','--import','tsx','--input-type=module'],input=pending,text=True,capture_output=True,check=True,timeout=20)
    if json.loads(p.stdout.strip().splitlines()[-1])['pending']==0:break
  time.sleep(5)
 else:raise RuntimeError('Original idle deadline expired without deployment')
 report['idle']=idle
 for name,path in [('admission-agent-16.previous.private.json',canonical),('admission-rpc-16.previous.private.yaml',override)]:
  target=root/'live'/name;assert not target.exists();target.write_bytes(path.read_bytes());target.chmod(0o600)
 report['stage']='rpc';save();override.write_text(after)
 subprocess.run(['docker','compose','-p','pongit','-f',str(rpcroot/'compose.yaml'),'-f',str(override),'up','-d','--no-deps','--no-build','rpc'],cwd=rpcroot,check=True,timeout=120,capture_output=True)
 assert inspect(names['rpc'])['Image']==runtime['image'] and inspect(names['rpc'])['State']['Running']
 report['stage']='web';save();config['services']['arcade-web']['image']=web['image']
 for path in [canonical,mirror]:path.write_text(json.dumps(config,indent=2)+'\n');path.chmod(0o600)
 subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','--no-build','arcade-web'],check=True,timeout=120,capture_output=True)
 assert inspect(names['arcade-web'])['Image']==web['image'] and inspect(names['arcade-web'])['State']['Running']
 for _ in range(20):
  try:
   with urllib.request.urlopen('https://pongit.xyz/agents',timeout=10) as response:
    if response.status==200:break
  except (TimeoutError,OSError):pass
  time.sleep(1)
 else:raise RuntimeError('Public catalogue readiness failed')
 request=urllib.request.Request('https://pongit.xyz/api/agents/chain-read',data=b'{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}',headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(request,timeout=15) as response:assert json.load(response)['result']=='0x279f'
 report.update(passed=True,stage='complete',started={k:inspect(n)['State']['StartedAt'] for k,n in names.items()})
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps(report))
