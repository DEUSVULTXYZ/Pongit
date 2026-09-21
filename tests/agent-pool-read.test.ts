import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zeroHash,zeroAddress,type Address,type PublicClient} from 'viem';
import {AgentPoolReader} from '../relayer/src/agents/pool-read';
import {PoolReadCache,poolRoutes} from '../relayer/src/agents/pool-api';
import type {AgentPoolManifest} from '../shared/agent-pool';
const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const evidence=`0x${'b'.repeat(64)}` as const;
const manifest:AgentPoolManifest={version:2,chainId:10143,engineChainId:4242,rulesVersion:10,hub:addr(1),pool:addr(2),catalog:addr(3),tournaments:addr(4),ratings:addr(5),challenges:addr(6),qualifications:addr(11),family:addr(7),
 arenas:[8,9,10].map(n=>({app:addr(n),node:`https://arena-${n}.example`,runtimeHash:`0x${'a'.repeat(64)}`})),enabled:true,tournamentsEnabled:true,verifiedCapacity:2,qualificationEvidence:evidence,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
test('published view pins all reads and rejects a mid-read reorganization',async()=>{
 let reads=0,reorg=false,second=false;
 const client={getBlock:async()=>({number:50n,hash:reorg&&second?'0xb':'0xa'}),readContract:async(r:any)=>{
  assert.equal(r.blockNumber,50n);reads++;second=true;
  if(r.functionName==='arenaPage')return manifest.arenas.map(a=>a.app);
  if(r.functionName==='capacityEvidence')return evidence;
  return true;
 }} as unknown as PublicClient;
 const reader=new AgentPoolReader(client,manifest);assert.equal((await reader.config()).value.enabled,true);assert.equal(reads,5);
 reorg=true;second=false;await assert.rejects(reader.config(),/changed during synchronization/);
});
test('a local enabled flag cannot bypass a missing or different on-chain qualification',async()=>{
 let proof:string=zeroHash,gate=false;
 const client={getBlock:async()=>({number:50n,hash:'0xa'}),readContract:async(r:any)=>{
  if(r.functionName==='arenaPage')return manifest.arenas.map(a=>a.app);
  if(r.functionName==='capacityEvidence')return proof;
  if(r.functionName==='publicAdmissions')return gate;
  return true;
 }} as unknown as PublicClient;
 const reader=new AgentPoolReader(client,manifest);assert.equal((await reader.config()).value.enabled,false);
 proof=evidence;assert.equal((await reader.config()).value.enabled,false);
 gate=true;assert.equal((await reader.config()).value.enabled,true);
 const disabled=new AgentPoolReader(client,{...manifest,enabled:false,tournamentsEnabled:false});assert.equal((await disabled.config()).value.enabled,false);
});
test('a public preview stays explicitly unqualified and requires matching on-chain review plus admissions',async()=>{
 const m:AgentPoolManifest={...manifest,version:4,rulesVersion:15,releaseStage:'testnet-preview',previewEvidence:evidence,verifiedCapacity:0,qualificationEvidence:null};
 let proof:string=zeroHash,gate=false;
 const client={getBlock:async()=>({number:50n,hash:'0xa'}),readContract:async(r:any)=>{
  if(r.functionName==='arenaPage')return m.arenas.map(a=>a.app);
  if(r.functionName==='capacityEvidence')return proof;
  if(r.functionName==='publicAdmissions')return gate;
  return true;
 }} as unknown as PublicClient;
 const reader=new AgentPoolReader(client,m);assert.equal((await reader.config()).value.enabled,false);
 proof=evidence;assert.equal((await reader.config()).value.enabled,false);gate=true;
 const view=(await reader.config()).value;assert.equal(view.enabled,true);assert.equal(view.tournamentsEnabled,true);assert.equal(view.qualified,false);assert.equal(view.validation,'testnet-preview');
});
test('restored challenge binds its owner, agent and assigned arena at one block',async()=>{
 const {encodeAbiParameters,keccak256}=await import('viem');
 const owner=addr(90),agent=addr(91),arena=manifest.arenas[1].app;
 const playing=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'uint256'},{type:'uint256'}],[10143n,arena,2n,10n]));
 let pending=4n,status=1,other=false;
 const client={getBlock:async()=>({number:50n,hash:'0xa'}),readContract:async(r:any)=>{
  assert.equal(r.blockNumber,50n);
  if(r.functionName==='pending')return pending;if(r.functionName==='requests')return[other?addr(92):owner,agent,1,status,1000n,zeroHash];
  if(r.functionName==='playing')return playing;if(r.functionName==='challengeOf')return 4n;
  if(r.functionName==='boundMatch')return r.address===arena?{id:10n,epoch:2n,a:owner,b:agent}:{id:0n,epoch:0n,a:zeroAddress,b:zeroAddress};
  throw Error(r.functionName);
 }} as unknown as PublicClient;
 const reader=new AgentPoolReader(client,manifest);assert.equal((await reader.challenge(owner)).value.request?.ref,null);
 status=2;assert.deepEqual((await reader.challenge(owner)).value.request?.ref,{chainId:10143,app:arena,epoch:'2',id:'10'});
 other=true;await assert.rejects(reader.challenge(owner),/participation changed/);pending=0n;assert.equal((await reader.challenge(owner)).value.request,null);
});
test('read cache coalesces concurrent spectators, retries failures and expires independently of traffic',async()=>{
 let now=0,calls=0;const cache=new PoolReadCache(()=>now,10,2);
 const load=async()=>++calls;
 assert.deepEqual(await Promise.all([cache.get('x',load),cache.get('x',load)]),[1,1]);
 now=9;await cache.get('x',load);now=11;assert.equal(await cache.get('x',load),2);
 await assert.rejects(cache.get('error',async()=>{throw Error('RPC unavailable');}),/unavailable/);
 assert.equal(await cache.get('error',load),3);
 await cache.get('y',load);assert.equal(await cache.get('x',load),5,'bounded eviction');
});
test('routes reject unbounded page requests without sending RPC',async()=>{
 let calls=0;const reader={tournament:async(id:bigint)=>{calls++;return id;},rankings:async(...args:any[])=>{calls++;return args;}} as unknown as AgentPoolReader;
 const route=poolRoutes(reader);for(const path of ['/catalog?limit=33','/catalog?offset=-1','/catalog?offset=999999999999999999999','/rankings?mode=2','/catalog?limit=0'])
  await assert.rejects(route(new URL(`http://localhost${path}`)));
 assert.equal(calls,0);assert.equal(await route(new URL('http://localhost/agents/tournaments/14')),14n);
 assert.deepEqual(await route(new URL('http://localhost/rankings?mode=1&block=50&offset=32&limit=8')),[1,32n,8,50n]);
});
test('slow reads stay single-flight beyond the TTL and cannot evict another pending read',async()=>{
 let now=0,resolve!:(n:number)=>void;const cache=new PoolReadCache(()=>now,10,1);
 const first=cache.get('x',()=>new Promise<number>(r=>{resolve=r;}));now=100;
 const second=cache.get('x',async()=>{throw Error('duplicate network call');});assert.equal(first,second);
 assert.throws(()=>cache.get('y',async()=>2),/busy/);resolve(1);assert.equal(await second,1);
 assert.equal(await cache.get('y',async()=>2),2);
});
test('series readers preserve prior results and never watch a future reserved fixture',async()=>{
 const m={...manifest,version:3 as const,rulesVersion:11 as const};
 const arena=m.arenas[0].app,owner=addr(90),agent=addr(91);
 let wanted=1n;
 const client={getBlock:async()=>({number:50n,hash:zeroHash,timestamp:1000n}),readContract:async(r:any)=>{
  assert.equal(r.blockNumber,50n);
  if(r.functionName==='record'){assert.equal(r.args[0],wanted);return{ref:{chainId:10143n,arena,epoch:1n,id:wanted},a:owner,b:agent,tournament:0n,ranked:false,captured:wanted===1n};}
  if(r.functionName==='boundMatch')return{id:2n,epoch:1n,mode:1};
  if(r.functionName==='bindingFor'){assert.equal(r.args[0],wanted);return{id:wanted,epoch:1n,mode:0};}
  if(r.functionName==='result')return{hash:zeroHash,winner:owner,status:3,scoreA:7,scoreB:2,mode:0,elapsedUs:1n,finality:false};
  throw Error(r.functionName);
 }} as unknown as PublicClient;
 const reader=new AgentPoolReader(client,m);
 const old=(await reader.match({chainId:10143,app:arena,epoch:'1',id:'1'})).value;
 assert.equal(old.node,null);assert.equal(old.result?.scoreA,7);assert.equal(old.currentBinding,false);assert.equal(old.mode,0);
 wanted=3n;const future=(await reader.match({chainId:10143,app:arena,epoch:'1',id:'3'})).value;
 assert.equal(future.node,null);assert.equal(future.result,null);assert.equal(future.mode,0);assert.equal(future.currentBinding,false);
 await assert.rejects(reader.match({chainId:10143,app:arena,epoch:'2',id:'3'}),/not found/);
});
test('series live discovery excludes captured results while the engine advances its next fixture',async()=>{
 const m={...manifest,version:3 as const,rulesVersion:11 as const};let captured=false;
 const app=m.arenas[0].app;
 const client={getBlock:async()=>({number:50n,hash:zeroHash,timestamp:1000n}),readContract:async(r:any)=>{
  if(r.functionName==='activeSeries')return app;if(r.functionName==='qualificationSeries')return zeroAddress;
  if(r.functionName==='boundMatch')return r.address===app?{id:1n,epoch:1n,a:addr(90),b:addr(91),mode:0,ranked:false,tournament:1n}:{id:0n};
  if(r.functionName==='record')return{captured};throw Error(r.functionName);
 }} as unknown as PublicClient;
 const reader=new AgentPoolReader(client,m);const live=(await reader.live()).value.items;
 assert.equal(live.length,1);assert.equal(live[0].lane,'tournament');assert.equal(live[0].liveConfirmed,false);
 captured=true;assert.equal((await reader.live()).value.items.length,0);
});

test('reusable discovery reads the Monad ticket before engine admission and preserves historical links',async()=>{
 const m={...manifest,version:4 as const,rulesVersion:15 as const},app=m.arenas[0].app,a=addr(90),b=addr(91);
 const ref={chainId:10143n,arena:app,epoch:2n,id:91n};let current=false,captured=false,assigned=true;
 const {encodeAbiParameters,keccak256}=await import('viem');
 const key=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'uint256'},{type:'uint256'}],[10143n,app,2n,91n]));
 const record=()=>({ref,a,b,ranked:false,tournament:0n,lane:1,captured});
 const client={getBlock:async()=>({number:50n,hash:zeroHash,timestamp:1000n}),readContract:async(r:any)=>{
  assert.equal(r.blockNumber,50n);
  assert(r.abi.some((x:any)=>x.type==='function'&&x.name===r.functionName),'Real ABI must support the method');
  if(r.functionName==='laneRecord')return r.args[0]===1?record():{ref:{id:0n}};
  if(r.functionName==='ticketOf')return[{},{id:91n,epoch:2n,a,b,mode:1,controlA:{codeHash:zeroHash}}];
  if(r.functionName==='pending'||r.functionName==='challengeOf')return 4n;
  if(r.functionName==='requests')return[a,b,1,2,1000n,zeroHash];
  if(r.functionName==='playing')return key;
  if(r.functionName==='arenaMatch')return assigned?key:zeroHash;
  if(r.functionName==='record')return record();
  if(r.functionName==='boundMatch')return{id:current?91n:90n,epoch:2n,mode:0};
  if(r.functionName==='result')return{hash:zeroHash,winner:a,status:3,scoreA:7,scoreB:4,mode:1,elapsedUs:100n,finality:false};
  throw Error(r.functionName);
 }} as unknown as PublicClient;
 const reader=new AgentPoolReader(client,m),reference={chainId:10143 as const,app,epoch:'2',id:'91'};
 assert.equal((await reader.live()).value.items[0].ref.id,'91');assert.equal((await reader.live()).value.items[0].liveConfirmed,false);
 assert.deepEqual((await reader.challenge(a)).value.request?.ref,reference);
 let view=(await reader.match(reference)).value;assert.equal(view.node,m.arenas[0].node,'Observe the assigned engine before its binding is republished');assert.equal(view.mode,1);assert.equal(view.result,null);
 assigned=false;view=(await reader.match(reference)).value;assert.equal(view.node,null,'Old assignments cannot observe a replacement');assigned=true;
 current=true;view=(await reader.match(reference)).value;assert.equal(view.node,m.arenas[0].node);
 current=false;captured=true;view=(await reader.match(reference)).value;assert.equal(view.node,null);assert.equal(view.result?.scoreA,7);assert.equal(view.mode,1);
 assert.equal((await reader.live()).value.items.length,0);
 await assert.rejects(reader.match({...reference,epoch:'3'}),/not found/);
});
