import {test} from 'node:test';import assert from 'node:assert/strict';
import {decodeFunctionData,encodeAbiParameters,encodeFunctionResult,hashTypedData,keccak256,parseTransaction,toHex,zeroAddress,zeroHash,type Address,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createPoolPlayer,POOL_PLAYER_GAS} from '../shared/agent-pool-player';
import {pooledAgentArenaAbi as abi} from '../shared/abi-PooledAgentArena';
import {roomsLifecycleHubAbi as hubAbi} from '../shared/abi-rooms-lifecycle';
import type {AgentPoolManifest,PoolMatchView} from '../shared/agent-pool';
import type {PoolFamilySession} from '../shared/agent-pool-family';
import {poolRenewTypes,poolRevokeTypes} from '../shared/agent-pool-active';
const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
function fixture(rules:10|11=10){
 const key=generatePrivateKey(),account=privateKeyToAccount(key),owner=privateKeyToAccount(generatePrivateKey()),at=Math.floor(Date.now()/1000);
 const session:PoolFamilySession={key,signature:`0x${'11'.repeat(65)}`,grant:{player:owner.address,key:account.address,issuedAt:BigInt(at),expires:BigInt(at+7200),revision:0n}};
 const m:AgentPoolManifest={version:2,chainId:10143,engineChainId:4242,rulesVersion:10,hub:addr(1),pool:addr(2),catalog:addr(3),tournaments:addr(4),ratings:addr(5),challenges:addr(6),qualifications:addr(7),family:addr(8),arenas:[9,10,11].map(n=>({app:addr(n),node:`https://arena-${n}.example`,runtimeHash:keccak256('0x6000')})),enabled:false,tournamentsEnabled:false,verifiedCapacity:0,qualificationEvidence:null,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
 if(rules===11){m.version=3;m.rulesVersion=11;}
 const match:PoolMatchView={ref:{chainId:10143,app:addr(9),epoch:'1',id:'4'},a:owner.address,b:addr(21),mode:0,ranked:false,tournament:'0',lane:1,node:m.arenas[0].node,currentBinding:true,regulationSeconds:300,overtimeSeconds:0,result:null};
 const memory=new Map<string,string>(),storage={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{memory.set(k,v);},removeItem:(k:string)=>{memory.delete(k);}};
 const fields=hubAbi.find(x=>x.name==='delegationOf')!.outputs[0].components;
 const hub:any=Object.fromEntries(fields.map(f=>[f.name,f.type==='address'?zeroAddress:f.type==='bytes32'?zeroHash:['uint8','uint16','uint32'].includes(f.type)?0:0n]));
 Object.assign(hub,{epoch:1n,status:1,expiresAt:BigInt(at+3600),resolveThreshold:2});
 const state:any={id:4n,phase:2,a:match.a,b:match.b,nonceA:0n,nonceB:0n,head:10n,state:{leftDir:0,rightDir:0}};
 let nodeEpoch=1,nonce=0,lost=false,receiptVisible=false,hold:(()=>Promise<void>)|undefined,nodeCalls=0,reorg=false,failBase=false;
 let clock=Date.now(),bindings=0,nonceReads=0;
 let overrideKey:Address=zeroAddress,overrideMeta=0n,overrideRevision=0n;const sent:Hex[]=[],receipts=new Map<Hex,any>();
 const binding={id:4n,epoch:1n,a:match.a,b:match.b,controlA:{key:account.address,expires:session.grant.expires,codeHash:zeroHash},controlB:{key:addr(21),expires:session.grant.expires,codeHash:zeroHash}};
 const base:any={getChainId:async()=>10143,getBlock:async(opts?:any)=>{if(failBase)throw Error('RPC timeout');if(hold)await hold();return{number:100n,timestamp:BigInt(at),hash:opts&&reorg?toHex(1n,{size:32}):zeroHash};},getCode:async()=>'0x6000',request:async()=>encodeFunctionResult({abi:hubAbi,functionName:'delegationOf',result:hub})};
 let player!:ReturnType<typeof createPoolPlayer>;
 const node:any={getBlockNumber:async()=>10n,getStorageAt:async(r:any)=>{
  assert.equal(r.blockNumber,10n);for(let i=0;i<3;i++){
   const key=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'},{type:'uint256'},{type:'uint256'}],[addr(9),0n,4n,BigInt(54+i)]));
   const slot=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'}],[key,0n]));
   if(r.slot===slot)return toHex([BigInt(overrideKey),overrideMeta,overrideRevision][i],{size:32});
  }throw Error('Unexpected permission slot');
 },getBlock:async()=>({number:10n,timestamp:BigInt(at),hash:zeroHash}),readContract:async(r:any)=>{
  if(r.functionName==='RULES_VERSION')return BigInt(rules);if(r.functionName==='boundMatch'){bindings++;return binding;}
  if(r.functionName==='authorizationRevision')return overrideRevision;
  const domain={name:'PONGIT Pooled Arena',version:'1',chainId:10143,verifyingContract:addr(9)};
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
   const call=decodeFunctionData({abi,data:tx.data!});if(call.functionName==='input'){state.nonceA=call.args[2];state.state.leftDir=call.args[1];}else if(call.functionName==='concede')state.phase=3;
   else if(call.functionName==='renewActive'){assert.equal(call.args[0].revision,overrideRevision);overrideKey=call.args[0].key;overrideMeta=call.args[0].expires;overrideRevision++;}
   else if(call.functionName==='revokeActive'){overrideMeta|=1n<<64n;overrideRevision++;}
   receipts.set(hash,{transactionHash:hash,status:'0x1',logs:[]});
  }
  if(lost)throw Error('Lost response');const result=receipts.get(hash);player.journal.received(r.method,result);return result;
 }};
 const feed:any={read:async()=>state,receipt:async()=>state,invalidate(){},watch:()=>()=>{}};
 const create=()=>player=createPoolPlayer(m,match,session,{base,storage,now:()=>clock,socket:()=>{throw Error('No fixture WebSocket');}},{node,feed});create();
 return{m,match,session,owner,player,create,hub,state,sent,storage,binding,base,node,feed,
  lost:(v:boolean)=>lost=v,visible:(v:boolean)=>receiptVisible=v,epoch:(v:number)=>nodeEpoch=v,calls:()=>nodeCalls,hold:(v?:()=>Promise<void>)=>hold=v,
  advance:(ms:number)=>{clock+=ms;},bindings:()=>bindings,nonceReads:()=>nonceReads,
  reorg:(v:boolean)=>reorg=v,failBase:(v:boolean)=>failBase=v,override:(key:Address,meta:bigint,revision=1n)=>{overrideKey=key;overrideMeta=meta;overrideRevision=revision;}};
}

test('a burst during recovery keeps only the latest movement and signs compact sequential controls',async()=>{
 const f=fixture();let release!:()=>void;const gate=new Promise<void>(r=>release=r);f.hold(()=>gate);
 const first=f.player.move(1);await Promise.resolve();const second=f.player.move(-1),stop=f.player.move(0),last=f.player.move(-1);release();
 await Promise.all([first,second,stop,last]);assert.equal(f.sent.length,1);assert.equal(f.state.state.leftDir,-1);
 await f.player.move(0);assert.equal(f.sent.length,2);assert.equal(parseTransaction(f.sent[1]).nonce,1);f.player.close();
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
 assert.equal(f.sent.length,2);assert.equal(parseTransaction(f.sent[1]).nonce,1);assert.notEqual(raw,f.sent[1]);
 await restored.revoke(f.owner);assert.equal(parseTransaction(f.sent[2]).nonce,2);await assert.rejects(restored.move(-1),/revoked/);assert.equal(f.sent.length,3);restored.close();
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
  assert.equal(f.bindings(),2);assert.equal(parseTransaction(f.sent[1]).nonce,1);f.player.close();
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
