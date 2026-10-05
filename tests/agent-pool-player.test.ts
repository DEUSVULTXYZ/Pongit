import {test} from 'node:test';import assert from 'node:assert/strict';
import {decodeFunctionData,encodeAbiParameters,encodeFunctionResult,encodeErrorResult,hashTypedData,keccak256,parseTransaction,toHex,zeroAddress,zeroHash,type Address,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createPoolPlayer,POOL_PLAYER_GAS,type PoolPlayerTiming} from '../shared/agent-pool-player';
import {pooledAgentArenaAbi as abi} from '../shared/abi-PooledAgentArena';
import {synchronizedAgentArenaAbi} from '../shared/abi-SynchronizedAgentArena';
import {reusableAgentArenaAbi} from '../shared/abi-ReusableAgentArena';
import {roomsLifecycleHubAbi as hubAbi} from '../shared/abi-rooms-lifecycle';
import type {AgentPoolManifest,PoolMatchView} from '../shared/agent-pool';
import type {PoolFamilySession} from '../shared/agent-pool-family';
import {poolRenewTypes,poolRevokeTypes} from '../shared/agent-pool-active';
import {NO_LEASE_HUB} from '../shared/hub-lease';
const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
test('rules16 heartbeats require fresh perception, preserve pending nonces and select resume explicitly',async()=>{
 const f=fixture(16);
 await f.player.heartbeat();
 assert.equal(decodeFunctionData({abi:synchronizedAgentArenaAbi,data:parseTransaction(f.sent[0]).data!}).functionName,'heartbeat');
 f.advance(600);await assert.rejects(f.player.heartbeat(),/fresh arena observation/);assert.equal(f.sent.length,1);
 f.fresh();f.state.sync.pause.status=2;
 await f.player.heartbeat(true);
 assert.equal(decodeFunctionData({abi:synchronizedAgentArenaAbi,data:parseTransaction(f.sent[1]).data!}).functionName,'resumeReady');
 f.advance(200);f.lost(true);await assert.rejects(f.player.heartbeat(),/Lost response/);
 const pending=f.player.journal.pending(f.session.grant.key)!;assert.equal(pending.action,'heartbeat');
 f.lost(false);f.visible(true);await f.player.heartbeat();
 assert.equal(f.player.journal.pending(f.session.grant.key),undefined);
 assert.deepEqual(f.sent.map(raw=>parseTransaction(raw).nonce),[0,1,2,3]);
 f.player.close();
});

test('friendly pause methods cannot be used on a legacy arena',async()=>{
 const f=fixture(15);await assert.rejects(f.player.heartbeat(true),/does not support/);assert.equal(f.sent.length,0);f.player.close();
});

test('receipt latency consumes heartbeat credit rather than postponing the next renewal',async()=>{
 const f=fixture(16),request=f.node.request;
 f.node.request=async(r:any)=>{const result=await request(r);if(r.method==='interlude_sendTransaction'){f.advance(200);f.fresh();}return result;};
 try{
  await f.player.move(1);f.advance(100);
  await f.player.heartbeat();
  assert.equal(f.sent.length,2,'The input was sent 300ms ago even though its acknowledgement is only 100ms old');
  assert.equal(decodeFunctionData({abi:synchronizedAgentArenaAbi,data:parseTransaction(f.sent[1]).data!}).functionName,'heartbeat');
 }finally{f.player.close();}
});

test('an immediately confirmed input still coalesces a redundant heartbeat',async()=>{
 const f=fixture(16);
 try{await f.player.move(1);await f.player.heartbeat();assert.equal(f.sent.length,1);f.advance(151);await f.player.heartbeat();assert.equal(f.sent.length,2);}
 finally{f.player.close();}
});
test('optional player timing cannot change receipt ownership or break controls',async()=>{
 const samples:PoolPlayerTiming[]=[];
 const f=fixture(16,s=>{samples.push(s);throw Error('Diagnostic reporter unavailable');});
 await f.player.move(1);await f.player.read();
 assert.equal(f.sent.length,1);assert.equal(f.player.journal.pending(f.session.grant.key),undefined);
 for(const stage of ['queue','fence','snapshot','send','receipt','observation'])assert(samples.some(s=>s.stage===stage));
 assert(samples.every(s=>s.ms>=0&&Number.isFinite(s.ms)&&Object.keys(s).every(k=>['ms','stage','startedAt','command'].includes(k))&&(!s.command||['input','heartbeat','resumeReady','confirmReady','concede','prepare'].includes(s.command))));
 f.advance(200);f.lost(true);await assert.rejects(f.player.move(-1),/Lost response/);
 assert.equal(f.player.journal.pending(f.session.grant.key)?.action,'input');
 f.player.close();
});

test('an expired fence overlaps independent identity and canonical hub observations',async()=>{
 const f=fixture(16);await f.player.move(1);f.advance(10001);f.fresh();
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 let hubStarted=false,identityStarted=false;
 const block=f.base.getBlock,request=f.node.request;
 f.base.getBlock=async(...args:any[])=>{hubStarted=true;await gate;return block(...args);};
 f.node.request=async(r:any)=>{if(r.method==='interlude_session'){identityStarted=true;await gate;}return request(r);};
 const moving=f.player.move(-1);
 try{
  await new Promise(r=>setImmediate(r));
  assert(hubStarted&&identityStarted,'Independent observations must start before either completes');
  assert.equal(f.sent.length,1,'No command before both observations pass');
 }finally{release();await moving;f.player.close();}
 assert.equal(f.sent.length,2);assert.equal(parseTransaction(f.sent[1]).nonce,1);
});

test('concurrent identity refreshes share one observation without accepting the wrong epoch',async()=>{
 const f=fixture(16);await f.player.move(1);
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let identities=0;
 const request=f.node.request;
 f.node.request=async(r:any)=>{if(r.method==='interlude_session'){identities++;await gate;}return request(r);};
 f.epoch(2);
 const a=f.player.read(true),b=f.player.read(true);
 try{await new Promise(r=>setImmediate(r));assert.equal(identities,1);}
 finally{release();const outcomes=await Promise.allSettled([a,b]);assert(outcomes.every(x=>x.status==='rejected'));f.player.close();}
 assert.equal(f.sent.length,1);assert.equal(f.player.journal.pending(f.session.grant.key),undefined);
});

test('periodic fence refreshes identity before the ten-second stream validity expires',async()=>{
 const f=fixture(16);let identities=0;const request=f.node.request;
 f.node.request=async(r:any)=>{if(r.method==='interlude_session')identities++;return request(r);};
 await f.player.move(1);assert.equal(identities,1);
 f.advance(8500);f.fresh();await f.player.move(-1);
 assert.equal(identities,2,'Do not wait for visible event delivery to become unauthorized');
 f.advance(3001);f.failBase(true);await assert.rejects(f.player.move(0),/timeout/);
 assert.equal(f.sent.length,2,'Early identity refresh must not extend the three-second hub fence');
 f.player.close();
});

test('launch observation refreshes state without serializing an already verified identity',async()=>{
 const f=fixture(16);await f.player.recover();let identities=0,freshReads=0;
 const request=f.node.request,read=f.feed.read;
 f.node.request=async(r:any)=>{if(r.method==='interlude_session')identities++;return request(r);};
 f.feed.read=async(id:bigint,force:boolean)=>{assert.equal(id,4n);assert.equal(force,true);freshReads++;return read();};
 try{
  await f.player.observeLaunch();assert.equal(freshReads,1);assert.equal(identities,0);
  f.advance(10001);f.epoch(2);
  await assert.rejects(f.player.observeLaunch(),/epoch|published result/);
  assert.equal(identities,1);assert.equal(freshReads,1,'Expired identity must pass before a new snapshot');
 }finally{f.player.close();}
});
function fixture(rules:10|11|15|16=10,onTiming?:(s:PoolPlayerTiming)=>void){
 const fixtureAbi=rules===16?synchronizedAgentArenaAbi:rules>=15?reusableAgentArenaAbi:abi;
 const key=generatePrivateKey(),account=privateKeyToAccount(key),owner=privateKeyToAccount(generatePrivateKey()),at=Math.floor(Date.now()/1000);
 const session:PoolFamilySession={key,signature:`0x${'11'.repeat(65)}`,grant:{player:owner.address,key:account.address,issuedAt:BigInt(at),expires:BigInt(at+7200),revision:0n}};
 const m:AgentPoolManifest={version:2,chainId:10143,engineChainId:4242,rulesVersion:10,hub:addr(1),pool:addr(2),catalog:addr(3),tournaments:addr(4),ratings:addr(5),challenges:addr(6),qualifications:addr(7),family:addr(8),arenas:[9,10,11].map(n=>({app:addr(n),node:`https://arena-${n}.example`,runtimeHash:keccak256('0x6000')})),enabled:false,tournamentsEnabled:false,verifiedCapacity:0,qualificationEvidence:null,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
 if(rules===11){m.version=3;m.rulesVersion=11;}
 if(rules===15){m.version=4;m.rulesVersion=15;}
 if(rules===16){m.version=5;m.rulesVersion=16;m.maxMatches=5;m.friendlyPause='heartbeat-v1';m.lanes={tournament:1,challenge:4};m.arenaAdmissions='verified-epoch-v1';m.houseInstances='official-v1';m.countdownClock='engine-ticks-v1';m.arenas.push(...[12,13].map(n=>({app:addr(n),node:"https://arena-"+n+'.example',runtimeHash:keccak256('0x6000')})));}
 const match:PoolMatchView={ref:{chainId:10143,app:addr(9),epoch:'1',id:'4'},a:owner.address,b:addr(21),mode:0,ranked:false,tournament:'0',lane:1,node:m.arenas[0].node,currentBinding:true,regulationSeconds:300,overtimeSeconds:0,result:null};
 const memory=new Map<string,string>(),storage={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{memory.set(k,v);},removeItem:(k:string)=>{memory.delete(k);}};
 const fields=hubAbi.find(x=>x.name==='delegationOf')!.outputs[0].components;
 const hub:any=Object.fromEntries(fields.map(f=>[f.name,f.type==='address'?zeroAddress:f.type==='bytes32'?zeroHash:['uint8','uint16','uint32'].includes(f.type)?0:0n]));
 Object.assign(hub,{epoch:1n,status:1,expiresAt:BigInt(at+3600),resolveThreshold:2});
 const state:any={id:4n,phase:2,a:match.a,b:match.b,nonceA:0n,nonceB:0n,head:10n,state:{leftDir:0,rightDir:0}};
 let nodeEpoch=1,nonce=0,readyMask=2,lost=false,receiptVisible=false,hold:(()=>Promise<void>)|undefined,nodeCalls=0,reorg=false,failBase=false;
 if(rules===16)Object.assign(state,{sync:{pause:{status:1,human:1,limitUs:500000n,deadlineBlock:60n,cancelBlock:0n,resumeBlock:0n},brainA:0n,brainB:0n,decision:0n,pendingControls:0n,controllers:256n}});
 let clock=Date.now(),bindings=0,nonceReads=0,rejectName:'InvalidMatch'|'StaleInput'|undefined,rejectPhase=2;
 let overrideKey:Address=zeroAddress,overrideMeta=0n,overrideRevision=0n;const sent:Hex[]=[],receipts=new Map<Hex,any>();
 const binding={id:4n,epoch:1n,a:match.a,b:match.b,controlA:{key:account.address,expires:session.grant.expires,codeHash:zeroHash},controlB:{key:addr(21),expires:session.grant.expires,codeHash:zeroHash}};
 const base:any={getChainId:async()=>10143,getBlock:async(opts?:any)=>{if(failBase)throw Error('RPC timeout');if(hold)await hold();return{number:100n,timestamp:BigInt(at),hash:opts&&reorg?toHex(1n,{size:32}):zeroHash};},
  getCode:async(opts:any)=>{if(opts.blockHash){assert.equal(opts.blockHash,zeroHash);assert.equal(opts.requireCanonical,true);if(reorg)throw Error('Canonical block changed');}return'0x6000';},
  request:async(request:any)=>{if(failBase)throw Error('RPC timeout');if(typeof request.params[1]==='object'){assert.deepEqual(request.params[1],{blockHash:zeroHash,requireCanonical:true});if(reorg)throw Error('Canonical block changed');}return encodeFunctionResult({abi:hubAbi,functionName:'delegationOf',result:hub});}};
 let player!:ReturnType<typeof createPoolPlayer>;
 const node:any={getBlockNumber:async()=>10n,getStorageAt:async(r:any)=>{
  assert.equal(r.blockNumber,10n);for(let i=0;i<3;i++){
   const key=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'},{type:'uint256'},{type:'uint256'}],[addr(9),0n,rules>=15?1n:4n,BigInt(54+i)]));
   const slot=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'}],[key,0n]));
   if(r.slot===slot)return toHex([BigInt(overrideKey),overrideMeta,overrideRevision][i],{size:32});
  }throw Error('Unexpected permission slot');
 },getBlock:async()=>({number:10n,timestamp:BigInt(at),hash:zeroHash}),readContract:async(r:any)=>{
  if(r.functionName==='RULES_VERSION')return BigInt(rules);if(r.functionName==='boundMatch'){bindings++;return binding;}
  if(r.functionName==='authorizationRevision')return overrideRevision;
  if(r.functionName==='readiness')return[readyMask,BigInt(at+30)];
  const domain={name:rules>=15?'PONGIT Reusable Arena':'PONGIT Pooled Arena',version:'1',chainId:10143,verifyingContract:addr(9)};
  if(r.functionName==='renewalDigest')return hashTypedData({domain,types:poolRenewTypes,primaryType:'RenewArena',message:r.args[0]});
  if(r.functionName==='revocationDigest')return hashTypedData({domain,types:poolRevokeTypes,primaryType:'RevokeArena',message:{player:r.args[0],epoch:1n,matchId:4n,revision:overrideRevision,deadline:r.args[1]}});
  throw Error(r.functionName);
 },
 getTransactionCount:async()=>{nonceReads++;return nonce;},getTransactionReceipt:async(r:any)=>{if(receiptVisible&&receipts.has(r.hash))return receipts.get(r.hash);throw Error('Receipt unavailable');},
 request:async(r:any)=>{
  nodeCalls++;if(r.method==='interlude_session')return{app:addr(9),epoch:nodeEpoch,chainId:4242};
  assert.equal(r.method,'interlude_sendTransaction');const raw=r.params[0] as Hex;await player.journal.beforeSend(raw);sent.push(raw);
  const tx=parseTransaction(raw),hash=keccak256(raw);if(!receipts.has(hash)){
   assert.equal(tx.nonce,nonce++);assert.equal(tx.gas,POOL_PLAYER_GAS);
   const call:any=decodeFunctionData({abi:fixtureAbi,data:tx.data!});if(rejectName){state.phase=rejectPhase;}
   else if(call.functionName==='input'){state.nonceA=call.args[rules>=15?3:2];state.state.leftDir=call.args[rules>=15?2:1];}else if(call.functionName==='concede')state.phase=3;
   else if(call.functionName==='confirmReady')readyMask|=1;
   else if(call.functionName==='renewActive'){assert.equal(call.args[0].revision,overrideRevision);overrideKey=call.args[0].key;overrideMeta=call.args[0].expires;overrideRevision++;}
   else if(call.functionName==='revokeActive'){overrideMeta|=1n<<64n;overrideRevision++;}
   receipts.set(hash,{transactionHash:hash,status:rejectName?'0x0':'0x1',logs:[],...(rejectName?{output:encodeErrorResult({abi,errorName:rejectName})}:{})});rejectName=undefined;
  }
  if(lost)throw Error('Lost response');const result=receipts.get(hash);player.journal.received(r.method,result);return result;
 }};
 const feed:any={read:async()=>state,forCommand:async()=>state,receipt:async()=>state,invalidate(){},watch:()=>()=>{}};
 state.observedAt=clock;
 const create=()=>player=createPoolPlayer(m,match,session,{base,storage,now:()=>clock,onTiming,socket:()=>{throw Error('No fixture WebSocket');}},{node,feed});create();
 return{m,match,session,owner,player,create,hub,state,sent,storage,binding,base,node,feed,
  lost:(v:boolean)=>lost=v,visible:(v:boolean)=>receiptVisible=v,epoch:(v:number)=>nodeEpoch=v,calls:()=>nodeCalls,hold:(v?:()=>Promise<void>)=>hold=v,
  advance:(ms:number)=>{clock+=ms;},fresh:()=>{state.observedAt=clock;},bindings:()=>bindings,nonceReads:()=>nonceReads,
  reject:(name:'InvalidMatch'|'StaleInput',phase:number)=>{rejectName=name;rejectPhase=phase;},
  reorg:(v:boolean)=>reorg=v,failBase:(v:boolean)=>failBase=v,override:(key:Address,meta:bigint,revision=1n)=>{overrideKey=key;overrideMeta=meta;overrideRevision=revision;}};
}

test('a burst during recovery keeps only the latest movement and signs compact sequential controls',async()=>{
 const f=fixture();let release!:()=>void;const gate=new Promise<void>(r=>release=r);f.hold(()=>gate);
 const first=f.player.move(1);await Promise.resolve();const second=f.player.move(-1),stop=f.player.move(0),last=f.player.move(-1);release();
 await Promise.all([first,second,stop,last]);assert.equal(f.sent.length,1);assert.equal(f.state.state.leftDir,-1);
 await f.player.move(0);assert.equal(f.sent.length,2);assert.equal(parseTransaction(f.sent[1]).nonce,1);f.player.close();
});
test('a no-lease engine keeps the three-second fence and human authorization',async()=>{
 const f=fixture(15);f.player.close();f.m.hub=NO_LEASE_HUB;f.hub.expiresAt=0n;const player=f.create();
 await player.move(1);assert.equal(f.sent.length,1);
 f.advance(3001);f.failBase(true);await assert.rejects(player.move(-1),/timeout/);assert.equal(f.sent.length,1);
 f.failBase(false);await player.move(-1);assert.equal(f.sent.length,2);
 await player.revoke(f.owner);await assert.rejects(player.move(0),/revoked/);player.close();
});
test('delayed Monad publication does not serialize live controls or release their epoch',async()=>{
 const f=fixture(16);f.player.close();f.m.hub=NO_LEASE_HUB;f.hub.expiresAt=0n;f.hub.batchIndex=7n;
 const player=f.create();
 try{
  // Keep the same published batch for thirty seconds while live receipts advance.
  for(let i=0;i<60;i++){f.advance(500);f.fresh();await player.move(i%2?-1:1);}
  assert.equal(f.hub.batchIndex,7n);assert.equal(f.sent.length,60);
  assert.equal(f.state.nonceA,60n);assert.equal(player.journal.pending(f.session.grant.key),undefined);
  f.hub.batchIndex=8n;f.advance(500);f.fresh();await player.move(0);
  assert.equal(f.sent.length,61);assert.equal(f.hub.epoch,1n);assert.equal(f.hub.status,1);
 }finally{player.close();}
});
test('zero lease on an unknown hub and an expired human grant still fail closed',async()=>{
 const f=fixture(15);f.hub.expiresAt=0n;await assert.rejects(f.player.move(1),/recovering/);assert.equal(f.sent.length,0);f.player.close();
 f.m.hub=NO_LEASE_HUB;f.session.grant.expires=1n;f.binding.controlA.expires=1n;
 const player=f.create();await assert.rejects(player.move(1),/Renew the active arena authorization/);assert.equal(f.sent.length,0);player.close();
});

test('rules16 no-lease refresh uses one atomic canonical delegation without changing recovery or nonce ownership',async()=>{
 const f=fixture(16);f.player.close();f.m.hub=NO_LEASE_HUB;f.hub.expiresAt=0n;const player=f.create();
 let headers=0;const block=f.base.getBlock,request=f.base.request,calls:any[]=[];
 f.base.getBlock=async(...a:any[])=>{headers++;return block(...a);};
 f.base.request=async(r:any)=>{calls.push(r);return request(r);};
 try{
  await player.move(1);assert.equal(headers,1);assert.equal(calls[0].params[1].requireCanonical,true);
  f.advance(3100);f.fresh();await player.move(-1);
  assert.equal(headers,1,'A no-lease refresh does not need a separate timestamp');
  assert.equal(calls.length,2);assert.equal(calls[1].params[1],'latest');
  assert.equal(f.bindings(),1);assert.deepEqual(f.sent.map(r=>parseTransaction(r).nonce),[0,1]);
  f.advance(3100);f.failBase(true);await assert.rejects(player.move(0),/timeout/);
  assert.equal(f.sent.length,2,'A failed atomic read cannot extend the fence');
  f.failBase(false);f.hub.status=2;await assert.rejects(player.move(0),/recovering/);
  assert.equal(f.sent.length,2);
 }finally{player.close();}
});

test('atomic no-lease observation rejects another epoch, unexpected expiry and late results',async()=>{
 for(const failure of ['epoch','lease','slow','identity']){
  const f=fixture(16);f.player.close();f.m.hub=NO_LEASE_HUB;f.hub.expiresAt=0n;const player=f.create();
  try{
   await player.move(1);f.advance(8500);f.fresh();
   if(failure==='epoch')f.hub.epoch=2n;
   if(failure==='lease')f.hub.expiresAt=100n;
   if(failure==='identity')f.epoch(2);
   if(failure==='slow'){const request=f.base.request;f.base.request=async(r:any)=>{const answer=await request(r);f.advance(3100);return answer;};}
   await assert.rejects(player.move(-1));assert.equal(f.sent.length,1,failure);
   assert.equal(player.journal.pending(f.session.grant.key),undefined);
  }finally{player.close();}
 }
});

test('no-lease atomic refresh never replaces canonical recovery of an uncertain command',async()=>{
 const f=fixture(16);f.player.close();f.m.hub=NO_LEASE_HUB;f.hub.expiresAt=0n;const player=f.create();
 try{
  await player.move(1);f.advance(3100);f.fresh();f.lost(true);await assert.rejects(player.move(-1),/Lost response/);
  const pending=player.journal.pending(f.session.grant.key)!;assert(pending);
  f.reorg(true);await assert.rejects(player.recover(),/Canonical block changed/);
  assert.equal(player.journal.pending(f.session.grant.key)?.hash,pending.hash);assert.equal(f.sent.length,2);
  f.reorg(false);f.lost(false);f.visible(true);await player.recover();
  assert.equal(player.journal.pending(f.session.grant.key),undefined);
 }finally{player.close();}
});

test('the latest intent replaces a movement waiting behind the second authorization fence',async()=>{
 const f=fixture(15);await f.player.move(1);
 let entered!:()=>void,release!:()=>void;
 const waiting=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 // The first fence is still valid, but expires during the command state read.
 f.advance(2900);f.hold(async()=>{entered();await gate;});
 f.feed.forCommand=async()=>{f.advance(200);return f.state;};
 const moving=f.player.move(-1);await waiting;
 const stopped=f.player.move(0);release();await Promise.all([moving,stopped]);
 assert.equal(f.sent.length,2,'The obsolete reversal must never reach the node');
 assert.equal(f.state.state.leftDir,0);assert.equal(parseTransaction(f.sent[1]).nonce,1);
 f.player.close();
});

test('nonce lookup coalesces unsent movement and a stopped client sends nothing',async()=>{
 for(const close of [false,true]){
  const f=fixture(15);let entered!:()=>void,release!:()=>void;
  const waiting=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
  const nonce=f.node.getTransactionCount;f.node.getTransactionCount=async()=>{entered();await gate;return nonce();};
  const moving=f.player.move(1);await waiting;
  if(close){f.player.close();release();await assert.rejects(moving,/stopped/);assert.equal(f.sent.length,0);}
  else{const latest=f.player.move(-1);release();await Promise.all([moving,latest]);assert.equal(f.sent.length,1);assert.equal(f.state.state.leftDir,-1);f.player.close();}
 }
});

test('a fence expiring during the first nonce read refreshes before sending only the latest intent',async()=>{
 const f=fixture(15);let entered!:()=>void,release!:()=>void;
 const waiting=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 const original=f.node.getTransactionCount;
 f.node.getTransactionCount=async()=>{entered();await gate;f.advance(3100);return original();};
 const first=f.player.move(1);await waiting;
 const last=f.player.move(-1);release();await Promise.all([first,last]);
 assert.equal(f.sent.length,1);assert.equal(f.state.state.leftDir,-1);
 assert.equal(parseTransaction(f.sent[0]).nonce,0);assert.equal(f.nonceReads(),1);
 assert.equal(f.bindings(),1,'A local pre-send expiry must not reset the signer');
 await f.player.move(0);assert.equal(parseTransaction(f.sent[1]).nonce,1);f.player.close();
});

test('a pre-send fence retry never sends after canonical closure or a failed fresh read',async()=>{
 for(const failure of ['closed','timeout']){
  const f=fixture(15);const original=f.node.getTransactionCount;
  f.node.getTransactionCount=async()=>{f.advance(3100);if(failure==='closed')f.hub.status=2;else f.failBase(true);return original();};
  await assert.rejects(f.player.move(1),failure==='closed'?/recovering/:/timeout/);
  assert.equal(f.sent.length,0);assert.equal(f.player.journal.pending(f.session.grant.key),undefined);f.player.close();
 }
});

test('reusable controls bind epoch and logical ID, recover after F5 and keep the fixed permission slot',async()=>{
 const f=fixture(15);f.state.phase=1;await f.player.ready();await f.player.ready();
 assert.equal(f.sent.length,1);const ready=decodeFunctionData({abi:reusableAgentArenaAbi,data:parseTransaction(f.sent[0]).data!});
 assert.equal(ready.functionName,'confirmReady');assert.deepEqual(ready.args,[1n,4n]);
 f.state.phase=2;f.lost(true);await assert.rejects(f.player.move(1),/Lost response/);
 assert.equal(f.player.journal.pending(f.session.grant.key)?.match,'4');f.player.close();f.visible(true);f.lost(false);
 const next=f.create();await next.move(-1);assert.deepEqual(f.sent.map(raw=>parseTransaction(raw).nonce),[0,1,2]);
 const input=decodeFunctionData({abi:reusableAgentArenaAbi,data:parseTransaction(f.sent[2]).data!});assert.equal(input.functionName,'input');assert.deepEqual(input.args?.slice(0,3),[1n,4n,-1]);
 await next.renew(f.owner);await next.revoke(f.owner);
 const revoked=decodeFunctionData({abi:reusableAgentArenaAbi,data:parseTransaction(f.sent[4]).data!});
 assert.equal(revoked.functionName,'revokeActive');assert.deepEqual(revoked.args?.slice(0,3),[1n,4n,f.owner.address]);
 await assert.rejects(next.move(0),/revoked/);next.close();
});

test('a confirmed input racing the last point preserves its consumed nonce and exposes the terminal state',async()=>{
 const f=fixture(11);f.reject('InvalidMatch',3);await f.player.move(1);
 assert.equal(f.sent.length,1);assert.equal(f.player.journal.pending(f.session.grant.key),undefined);
 assert.equal((await f.player.read()).phase,3);await f.player.move(-1);assert.equal(f.sent.length,1);f.player.close();
});
test('an invalid live match or unrelated terminal revert still fails',async()=>{
 for(const [name,phase] of [['InvalidMatch',2],['StaleInput',3]] as const){
  const f=fixture(11);f.reject(name,phase);await assert.rejects(f.player.move(1),new RegExp(name));
  assert.equal(f.sent.length,1);f.player.close();
 }
});
test('series human controls preserve their exact uncertain command across F5 and reject a mismatched rules manifest',async()=>{
 const f=fixture(11);f.lost(true);await assert.rejects(f.player.move(1),/Lost response/);const raw=f.sent[0];f.player.close();
 f.lost(false);f.visible(true);const resumed=f.create();await resumed.move(-1);
 assert.equal(f.sent.length,2);assert.equal(parseTransaction(f.sent[1]).nonce,1);assert.notEqual(raw,f.sent[1]);resumed.close();
 f.m.version=2;f.m.rulesVersion=10;const wrong=f.create();await assert.rejects(wrong.move(1),/Unexpected arena rules/);assert.equal(f.sent.length,2);wrong.close();
});
test('F5 reconciles the exact lost command receipt before sending a new intent, without a root key',async()=>{
 const f=fixture();f.lost(true);await assert.rejects(f.player.move(1),/Lost response/);const raw=f.sent[0];
 assert.equal(f.player.journal.pending(f.session.grant.key)?.raw,raw);f.player.close();f.lost(false);f.visible(true);
 const resumed=f.create();await resumed.move(-1);assert.equal(f.sent.length,2);assert.equal(parseTransaction(f.sent[1]).nonce,1);
 assert.equal(resumed.journal.pending(f.session.grant.key),undefined);assert.equal(f.state.state.leftDir,-1);resumed.close();
});
test('missing receipt only permits identical resend and repeated loss never signs a replacement',async()=>{
 const f=fixture();f.lost(true);await assert.rejects(f.player.move(1));await assert.rejects(f.player.move(-1));
 assert.equal(f.sent.length,2);assert.equal(f.sent[0],f.sent[1]);f.lost(false);await f.player.move(0);
 assert.equal(f.sent[2],f.sent[0]);assert.equal(parseTransaction(f.sent[3]).nonce,1);f.player.close();
});
test('expiry and Exiting preserve uncertainty and observation; verified closure retires it without contacting the old node',async()=>{
 for(const closure of ['new-epoch','none']){
  const f=fixture();f.lost(true);await assert.rejects(f.player.move(1));f.hub.status=2;
  await assert.rejects(f.player.recover(),/reconciled/);assert(f.player.journal.pending(f.session.grant.key));assert.equal(f.sent.length,1);
  assert.equal((await f.player.read()).id,4n);const before=f.calls();
  if(closure==='new-epoch'){f.hub.epoch=2n;f.epoch(2);}else f.hub.status=0;
  await assert.rejects(f.player.recover(),/closed/);assert.equal(f.calls(),before);assert.equal(f.player.journal.pending(f.session.grant.key),undefined);f.player.close();
 }
});
test('RPC failure or reorganized hub read cannot erase an uncertain command',async()=>{
 const f=fixture();f.lost(true);await assert.rejects(f.player.move(1));f.hub.epoch=2n;f.failBase(true);
 await assert.rejects(f.player.recover(),/timeout/);assert(f.player.journal.pending(f.session.grant.key));f.failBase(false);f.reorg(true);
 await assert.rejects(f.player.recover(),/changed/);assert(f.player.journal.pending(f.session.grant.key));f.player.close();
});
test('read permissions include active revocation and owner renewal instead of only the admission binding',async()=>{
 const revoked=fixture();revoked.override(zeroAddress,1n<<64n);await assert.rejects(revoked.player.move(1),/revoked/);assert.equal(revoked.sent.length,0);revoked.player.close();
 const renewed=fixture();renewed.binding.controlA.key=addr(90);renewed.binding.controlA.expires=1n;
 renewed.override(renewed.session.grant.key,renewed.session.grant.expires);await renewed.player.move(1);assert.equal(renewed.sent.length,1);renewed.player.close();
 const changed=fixture();changed.override(addr(90),changed.session.grant.expires);await assert.rejects(changed.player.move(1),/own confirmed/);assert.equal(changed.sent.length,0);changed.player.close();
});
test('different reference, participant, runtime bytecode or stopped client cannot issue commands',async()=>{
 const f=fixture();assert.throws(()=>createPoolPlayer(f.m,{...f.match,a:addr(99)},f.session,{base:f.base,storage:f.storage,socket:()=>null}));
 f.base.getCode=async()=>'0x6001';await assert.rejects(f.player.move(1),/bytecode/);assert.equal(f.sent.length,0);f.player.close();await assert.rejects(f.player.move(0),/stopped/);
});
test('owner renewal and revocation use exact journaled calls, survive loss and reject another owner',async()=>{
 const f=fixture();f.binding.controlA.key=addr(90);f.binding.controlA.expires=1n;
 await assert.rejects(f.player.renew(privateKeyToAccount(generatePrivateKey())),/participant/);
 f.lost(true);await assert.rejects(f.player.renew(f.owner),/Lost/);const raw=f.sent[0];assert.equal(f.player.journal.pending(f.session.grant.key)?.action,'renewActive');
 f.player.close();f.visible(true);f.lost(false);const restored=f.create();await restored.recover();await restored.move(1);
 assert.equal(f.sent.length,3);assert.equal(parseTransaction(f.sent[1]).nonce,1);assert.notEqual(raw,f.sent[1]);
 assert.equal(parseTransaction(f.sent[2]).nonce,2,'Neutral recovery is followed by the requested direction');
 await restored.revoke(f.owner);assert.equal(parseTransaction(f.sent[3]).nonce,3);await assert.rejects(restored.move(-1),/revoked/);assert.equal(f.sent.length,4);restored.close();
});
test('an unresolved permission blocks a different root action until the original is reconciled',async()=>{
 const f=fixture();f.lost(true);await assert.rejects(f.player.renew(f.owner));f.lost(false);f.visible(true);
 await assert.rejects(f.player.revoke(f.owner),/previous permission/);assert.equal(f.sent.length,1);
 await f.player.revoke(f.owner);assert.equal(f.sent.length,2);f.player.close();
});

test('closing the client during slow authorization prevents the queued input from being signed',async()=>{
 const f=fixture();let release!:()=>void;const gate=new Promise<void>(r=>release=r);f.hold(()=>gate);
 const moving=f.player.move(1);await Promise.resolve();f.player.close();release();
 await assert.rejects(moving,/stopped/);assert.equal(f.sent.length,0);
});

test('periodic hub fences preserve the verified binding and sequential sender, but a closing epoch blocks writes',async()=>{
 const f=fixture();await f.player.move(1);
 const bindings=f.bindings(),nonceReads=f.nonceReads();
 for(let i=0;i<4;i++){f.advance(3100);await f.player.move(i%2===0?-1:1);}
 assert.equal(f.bindings(),bindings);assert.equal(f.nonceReads(),nonceReads);
 assert.deepEqual(f.sent.map(raw=>parseTransaction(raw).nonce),[0,1,2,3,4]);
 f.advance(3100);f.hub.status=2;await assert.rejects(f.player.move(-1),/recovering/);
 assert.equal(f.sent.length,5);f.player.close();
});

test('a failed or reorganized light fence never sends the waiting movement',async()=>{
 for(const problem of ['failure','reorg']){
  const f=fixture();await f.player.move(1);f.advance(3100);
  if(problem==='failure')f.failBase(true);else f.reorg(true);
  await assert.rejects(f.player.move(-1));assert.equal(f.sent.length,1);
  f.failBase(false);f.reorg(false);await f.player.move(-1);
  assert.equal(f.bindings(),1,'A failed read-only fence preserves the verified signer');assert.equal(parseTransaction(f.sent[1]).nonce,1);f.player.close();
 }
});

test('periodic UI synchronization preserves signer nonce while checking mutable revocation',async()=>{
 const f=fixture(11);await f.player.move(1);
 const bindings=f.bindings(),nonces=f.nonceReads();
 for(let i=0;i<3;i++){f.advance(10000);await f.player.synchronize();await f.player.move(i%2===0?-1:1);}
 assert.equal(f.bindings(),bindings);assert.equal(f.nonceReads(),nonces);
 assert.deepEqual(f.sent.map(raw=>parseTransaction(raw).nonce),[0,1,2,3]);
 f.override(zeroAddress,1n<<64n);await assert.rejects(f.player.synchronize(),/revoked/);
 await assert.rejects(f.player.move(0),/revoked/);assert.equal(f.sent.length,4);f.player.close();
});

test('periodic UI synchronization reconciles a lost receipt before a new nonce',async()=>{
 const f=fixture(11);f.lost(true);await assert.rejects(f.player.move(1));
 const raw=f.sent[0];f.visible(true);f.lost(false);await f.player.synchronize();await f.player.move(-1);
 assert.equal(f.player.journal.pending(f.session.grant.key),undefined);
 assert.equal(f.sent.length,2);assert.equal(f.sent[0],raw);assert.equal(parseTransaction(f.sent[1]).nonce,1);f.player.close();
});

test('periodic observation joins an in-flight command without treating its journal as a lost response',async()=>{
 const f=fixture(16);await f.player.move(1);
 const bindings=f.bindings(),nonces=f.nonceReads(),request=f.node.request;
 let release!:()=>void,started!:()=>void;
 const gate=new Promise<void>(r=>release=r),sent=new Promise<void>(r=>started=r);
 f.node.request=async(r:any)=>{
  if(r.method==='interlude_sendTransaction'){
   await f.player.journal.beforeSend(r.params[0]);started();await gate;
  }
  return request(r);
 };
 try{
  const moving=f.player.move(-1);await sent;
  assert(f.player.journal.pending(f.session.grant.key));
  const observation=f.player.synchronize();release();await Promise.all([moving,observation]);
  assert.equal(f.bindings(),bindings,'an expected pending receipt must not rebuild the arena connection');
  await f.player.move(0);assert.equal(f.nonceReads(),nonces,'the confirmed sender nonce stays usable');
  assert.deepEqual(f.sent.map(raw=>parseTransaction(raw).nonce),[0,1,2]);
 }finally{release();f.player.close();}
});

test('a movement queued during a slow receipt takes priority over a redundant heartbeat',async()=>{
 const f=fixture(16);await f.player.move(1);f.advance(200);f.fresh();
 const request=f.node.request;let release!:()=>void,started!:()=>void;
 const gate=new Promise<void>(r=>release=r),sent=new Promise<void>(r=>started=r);
 f.node.request=async(r:any)=>{if(r.method==='interlude_sendTransaction'){started();await gate;f.advance(200);f.fresh();}return request(r);};
 try{
  const first=f.player.move(-1);await sent;
  const pulse=f.player.heartbeat(),latest=f.player.move(0);release();await Promise.all([first,pulse,latest]);
  const names=f.sent.map(raw=>decodeFunctionData({abi:synchronizedAgentArenaAbi,data:parseTransaction(raw).data!}).functionName);
  assert.deepEqual(names,['input','input','input']);assert.equal(f.state.state.leftDir,0);
 }finally{release();f.player.close();}
});

test('recovery waits for the current intent and exposes its second failure instead of falsely enabling controls',async()=>{
 const f=fixture(11);f.lost(true);await assert.rejects(f.player.move(1),/Lost response/);
 f.visible(true);f.lost(false);
 // The response-less input was executed. A release is still the user's latest
 // intention, but its first submission is refused by a temporary transport limit.
 const original=f.node.request;let rejectInput=true;
 f.node.request=async(r:any)=>{if(rejectInput&&r.method==='interlude_sendTransaction')throw Object.assign(Error('Busy'),{status:429});return original(r);};
 await assert.rejects(f.player.move(0),/Busy/);
 await assert.rejects(f.player.recover(),/Busy/,'Background intent failures must reach the recovery caller');
 rejectInput=false;await f.player.recover();assert.equal(f.state.state.leftDir,0);
 assert.deepEqual(f.sent.map(raw=>parseTransaction(raw).nonce),[0,1]);
 assert.equal(f.player.journal.pending(f.session.grant.key),undefined);f.player.close();
});


test('slow prefetch never blocks a valid movement and a new observation recovers an expired cached fence',async()=>{
 const f=fixture(15);await f.player.move(1);f.advance(1600);
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);f.hold(()=>gate);
 await f.player.move(-1);assert.equal(f.sent.length,2,'Cached valid fence avoids the slow Monad read');
 f.advance(4000);let finished=false;const next=f.player.move(1).then(()=>{finished=true;});
 await new Promise(r=>setImmediate(r));assert.equal(f.sent.length,2);assert.equal(finished,false);
 release();await next;assert.equal(f.sent.length,3);
 assert.equal(parseTransaction(f.sent[2]).nonce,2);assert.equal(f.bindings(),1);f.player.close();
});

test('slow successful prefetch keeps its original cadence instead of adding a validity gap',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
 const f=fixture(16);await f.player.move(1);
 let reads=0;const block=f.base.getBlock;
 f.base.getBlock=async(...args:any[])=>{reads++;await new Promise(r=>setTimeout(r,1410));return block(...args);};
 const advance=async(ms:number)=>{f.advance(ms);t.mock.timers.tick(ms);await new Promise(r=>setImmediate(r));};
 try{
  await advance(1500);assert.equal(reads,1);
  await advance(1410);
  await advance(90);
  assert.equal(reads,2,'The next prefetch starts 1500ms after the previous start, without an extra 250ms sleep');
  await advance(1410);await advance(91);f.fresh();
  await f.player.move(-1);
  assert.equal(f.sent.length,2);assert.equal(f.bindings(),1);
  assert.equal(parseTransaction(f.sent[1]).nonce,1,'No recovery or replacement nonce');
 }finally{f.player.close();await advance(2000);}
});

test('repeated slow fence observations fail closed without an unbounded retry or a command',async()=>{
 const f=fixture(15);await f.player.move(1);f.advance(1600);
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let reads=0;
 f.hold(async()=>{reads++;await gate;f.advance(3100);});
 await f.player.move(-1);assert.equal(f.sent.length,2);
 f.advance(3100);const next=f.player.move(1);release();
 await assert.rejects(next,/fresh observation/);assert.equal(f.sent.length,2);assert.equal(reads,2);f.player.close();
});

test('a release replaces the accepted queued movement even while processed physics still says stopped',async()=>{
 const f=fixture(15);const receipt=f.feed.receipt;
 f.feed.receipt=async()=>{const s=await receipt();s.state.leftDir=0;return s;};
 await f.player.move(1);assert.equal(f.state.state.leftDir,0);
 await f.player.move(0);
 assert.equal(f.sent.length,2,'Stop must cancel the queued up/down command');
 const call=decodeFunctionData({abi:reusableAgentArenaAbi,data:parseTransaction(f.sent[1]).data!});
 assert.deepEqual(call.args?.slice(0,4),[1n,4n,0,2n]);
 await f.player.move(0);assert.equal(f.sent.length,2,'An already accepted intention stays deduplicated');
 f.player.close();
});

test('F5 sends a neutral intent instead of assuming processed physics has no pending direction',async()=>{
 const f=fixture(15);await f.player.move(1);f.state.state.leftDir=0;f.player.close();
 const resumed=f.create();await resumed.recover();assert.equal(f.sent.length,2);
 assert.equal(parseTransaction(f.sent[1]).nonce,1);resumed.close();
});

test('periodic permission observation cannot hold movement behind a slow read',async()=>{
 const f=fixture(15);await f.player.move(1);
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const read=f.node.getStorageAt;f.node.getStorageAt=async(r:any)=>{await gate;return read(r);};
 const observing=f.player.synchronize();let moved=false;
 const moving=f.player.move(-1).then(()=>{moved=true;});
 await new Promise(r=>setTimeout(r,30));assert(moved,'A healthy command must pass while periodic reads wait');
 assert.equal(f.sent.length,2);release();await observing;await moving;f.player.close();
});

test('entry reads code and lifecycle at one canonical hash without trailing headers',async()=>{
 const f=fixture(15),requests:any[]=[];let headers=0;
 const request=f.base.request,code=f.base.getCode,header=f.base.getBlock;
 f.base.request=async(r:any)=>{requests.push(r.params[1]);return request(r);};
 f.base.getCode=async(r:any)=>{requests.push({blockHash:r.blockHash,requireCanonical:r.requireCanonical});return code(r);};
 f.base.getBlock=async(r:any)=>{headers++;assert.equal(r,undefined);return header(r);};
 await f.player.move(1);assert.equal(headers,1);assert.equal(f.sent.length,1);
 assert.deepEqual(requests,[{blockHash:zeroHash,requireCanonical:true},{blockHash:zeroHash,requireCanonical:true}]);
 f.advance(3100);await f.player.move(-1);assert.equal(headers,2);assert.equal(f.sent.length,2);
 f.player.close();
});

test('an unsupported canonical read never falls back to latest or releases a pending nonce',async()=>{
 const f=fixture(15);f.lost(true);await assert.rejects(f.player.move(1));
 f.hub.epoch=2n;let calls=0;f.base.request=async(r:any)=>{calls++;assert.equal(r.params[1].requireCanonical,true);throw Error('EIP-1898 unsupported');};
 await assert.rejects(f.player.recover(),/unsupported/);assert.equal(calls,1);
 assert(f.player.journal.pending(f.session.grant.key));assert.equal(f.sent.length,1);f.player.close();
});
