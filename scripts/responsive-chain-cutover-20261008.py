"""Bounded idle-only read gateway/reader/web cutover; no chain writes or engine change."""
import datetime,hashlib,json,pathlib,subprocess,time,urllib.request,urllib.error,yaml
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
canonical=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json');mirror=root/'live/agent-compose.json'
rpcroot=pathlib.Path('/opt/pongit/current');override=rpcroot/'compose.override.yaml'
output=root/'live/evidence/chain-cutover-12.json';assert not output.exists()
load=lambda p:json.loads(p.read_text())
runtime=load(root/'build-chain-runtime-12.json');web=load(root/'build-chain-web-12.json')
assert all(b['passed'] and b['source']=='132a51b' for b in [runtime,web])
backup=root/'backup-chain-12';proof=load(backup/'off-vps.json')
assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['at'].replace('Z','+00:00'))).total_seconds()<1800
assert canonical.read_bytes()==mirror.read_bytes()
config=load(canonical);previous={'rpc':'sha256:fbe848fe0c376c23b245a1e1aedc68aa04a39ffbbfa0ba8bef827973519b942d',
 'reader':'sha256:9414d534bc5930795a8b64e707d3e30e25d7fd330a33f285ac9e2dfeb2ae21fa',
 'arcade-web':'sha256:313cbe35157ea897b60441dcf8717cb49cfa926afe4f08e01c04083678da02a3'}
names={k:'pongit-rpc-1' if k=='rpc' else 'pongit-arcade-five-'+k+'-1' for k in previous}
inspect=lambda n:json.loads(subprocess.check_output(['docker','inspect',n]))[0]
for k in previous:
 assert inspect(names[k])['Image']==previous[k]
 if k!='rpc':assert config['services'][k]['image']==previous[k]
before=override.read_text();parsed=yaml.safe_load(before);assert parsed['services']['rpc']['image']==previous['rpc']
assert before.count(previous['rpc'])==1
after=before.replace(previous['rpc'],runtime['image']);expected=json.loads(json.dumps(parsed));expected['services']['rpc']['image']=runtime['image']
assert yaml.safe_load(after)==expected
report={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'deadline':time.time()+720,
 'passed':False,'stage':'waiting-idle','previous':previous,'runtime':runtime['image'],'web':web['image'],'backupManifest':proof['manifestSha256']}
def save():output.write_text(json.dumps(report,indent=2))
save()
script='''
import assert from 'node:assert/strict';
import {createPublicClient,http} from 'viem';
import {reusableAgentPoolAbi as abi} from './shared/abi-ReusableAgentPool.ts';
import {independentRules} from './shared/independent-rules.ts';
const client=createPublicClient({batch:{multicall:{wait:10}},transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
const block=await client.getBlock();
const lanes=await Promise.all([0,1,2,3,4].map(lane=>client.readContract({address:'0xe01c31f482113367c510a04816ff371676477fa3',abi,functionName:'laneRecord',args:[lane],blockNumber:block.number})));
const slots=await Promise.all([0n,1n].map(i=>client.readContract({address:'0xdf44e1cae317bc9d8bafcf9b292b08bb90996fb7',abi:independentRules({rulesVersion:18}).lobby,functionName:'slot',args:[i],blockNumber:block.number})));
assert.equal((await client.getBlock({blockNumber:block.number})).hash,block.hash);
console.log(JSON.stringify({block:String(block.number),hash:block.hash,idle:lanes.every(l=>l.ref.id===0n||l.captured)&&slots.every(id=>id===0n),humanSlots:slots.map(String)}));
'''
def readcall(method,params):
 data=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params}).encode()
 request=urllib.request.Request('https://pongit.xyz/api/agents/chain-read',data=data,headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(request,timeout=15) as response:return json.load(response)
try:
 while time.time()<report['deadline']:
  check=subprocess.run(['docker','exec','-i',names['reader'],'node','--import','tsx','--input-type=module'],input=script,text=True,capture_output=True,timeout=45)
  if check.returncode==0:
   idle=json.loads(check.stdout.strip().splitlines()[-1]);report['lastCheck']=idle;save()
   if idle['idle']:break
  time.sleep(5)
 else:raise RuntimeError('Original idle deadline expired without deployment')
 report['idle']=idle
 for name,source in [('chain-agent-12.previous.private.json',canonical),('chain-rpc-12.previous.private.yaml',override)]:
  target=root/'live'/name;assert not target.exists();target.write_bytes(source.read_bytes());target.chmod(0o600)
 report['stage']='rpc';save();override.write_text(after)
 subprocess.run(['docker','compose','-p','pongit','-f',str(rpcroot/'compose.yaml'),'-f',str(override),'up','-d','--no-deps','--no-build','rpc'],cwd=rpcroot,check=True,timeout=120,capture_output=True)
 assert inspect(names['rpc'])['Image']==runtime['image'] and inspect(names['rpc'])['State']['Running']
 report['stage']='reader';save();config['services']['reader']['image']=runtime['image']
 for p in [canonical,mirror]:p.write_text(json.dumps(config,indent=2)+'\n');p.chmod(0o600)
 subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','--no-build','reader'],check=True,timeout=120,capture_output=True)
 assert inspect(names['reader'])['Image']==runtime['image']
 for _ in range(20):
  try:
   result=readcall('eth_chainId',[])
   if result.get('result')=='0x279f':break
  except (urllib.error.URLError,TimeoutError):pass
  time.sleep(1)
 else:raise RuntimeError('New public read route did not become ready')
 block=readcall('eth_getBlockByNumber',['latest',False]);assert block.get('result',{}).get('hash')
 # Invalid writes are rejected before forwarding. This has no signed payload.
 try:readcall('eth_sendRawTransaction',[]);raise RuntimeError('Write method unexpectedly accepted')
 except urllib.error.HTTPError as error:assert error.code==400
 report['routeProof']={'chainId':10143,'block':block['result']['number'],'hash':block['result']['hash'],'writeRejected':True}
 report['stage']='web';save();config['services']['arcade-web']['image']=web['image']
 for p in [canonical,mirror]:p.write_text(json.dumps(config,indent=2)+'\n');p.chmod(0o600)
 subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','--no-build','arcade-web'],check=True,timeout=120,capture_output=True)
 assert inspect(names['arcade-web'])['Image']==web['image'] and inspect(names['arcade-web'])['State']['Running']
 with urllib.request.urlopen('https://pongit.xyz/agents',timeout=20) as response:assert response.status==200
 report.update(passed=True,stage='complete',started={k:inspect(n)['State']['StartedAt'] for k,n in names.items()})
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps(report))
