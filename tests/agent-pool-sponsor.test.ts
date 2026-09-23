import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,hashTypedData,zeroAddress,zeroHash,type Address,type PublicClient} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {agentChallengesAbi} from '../shared/abi-AgentChallenges';
import {agentCatalogAbi} from '../shared/abi-AgentCatalog';
import {abi as familyAbi} from '../shared/abi-independent-ArcadeFamily';
import {familyGrantTypes,type ChainOperation} from '../shared/independent';
import type {AgentPoolManifest} from '../shared/agent-pool';
import {createPoolSponsor,PoolSponsorPending,poolOperationId,validatePoolSignedCall,type PoolSessionStorage,type PoolSignedCall} from '../shared/agent-pool-sponsor';
import {preparePoolFamily,loadPoolFamily,observePoolFamily,familyExpiresSoon,SESSION_RENEW_MARGIN} from '../shared/agent-pool-family';
import {poolSponsorRoutes} from '../relayer/src/agents/pool-sponsor';

const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const m:AgentPoolManifest={version:2,chainId:10143,engineChainId:4242,rulesVersion:10,hub:addr(1),pool:addr(2),catalog:addr(3),tournaments:addr(4),ratings:addr(5),challenges:addr(6),qualifications:addr(11),family:addr(7),
 arenas:[8,9,10].map(n=>({app:addr(n),node:`https://arena-${n}.example`,runtimeHash:`0x${'a'.repeat(64)}`})),enabled:false,tournamentsEnabled:false,verifiedCapacity:0,qualificationEvidence:null,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
const sig=`0x${'ab'.repeat(65)}` as const;
const request:PoolSignedCall={to:m.challenges,data:encodeFunctionData({abi:agentChallengesAbi,functionName:'command',args:[addr(20),1,addr(21),1,0n,0n,200n,sig]})};
const cancel:PoolSignedCall={to:m.challenges,data:encodeFunctionData({abi:agentChallengesAbi,functionName:'command',args:[addr(20),2,addr(21),1,1n,1n,200n,sig]})};
function memory(){const values=new Map<string,string>();return{values,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}} satisfies PoolSessionStorage&{values:Map<string,string>};}
const missing=()=>Object.assign(Error('unknown operation'),{status:404});

test('sponsor rejects foreign targets, administrative actions, tails, ether and unsigned data',()=>{
 assert.equal(validatePoolSignedCall(m,request).admission,true);assert.equal(validatePoolSignedCall(m,cancel).admission,false);
 for(const call of [{...request,to:m.arenas[0].app},{...request,to:addr(999)},{...request,value:'1'},
  {...request,data:request.data+'00'}, {to:m.catalog,data:encodeFunctionData({abi:agentCatalogAbi,functionName:'setAvailable',args:[addr(20),true]})},
  {to:m.challenges,data:encodeFunctionData({abi:agentChallengesAbi,functionName:'setAdmissions',args:[true]})},
  {to:m.challenges,data:encodeFunctionData({abi:agentChallengesAbi,functionName:'command',args:[addr(20),1,addr(21),1,0n,0n,200n,'0x']})}])
  assert.throws(()=>validatePoolSignedCall(m,call));
});
test('paused admission reconciles prior operations and still permits cancellation and revocation',async()=>{
 const rows=new Map<string,ChainOperation>();let simulated=0;
 const writer={get:async(id:string)=>rows.get(id)??null,status:()=>({available:true}),enqueue:async(to:Address,data:PoolSignedCall['data'])=>{
  simulated++;const op:ChainOperation={id:poolOperationId({to,data}),status:'queued'};rows.set(op.id,op);return op;
 }};
 const route=poolSponsorRoutes(m,writer,async()=>false);
 await assert.rejects(route('POST','/agents/transactions',request),(e:any)=>e.accepted===false&&e.code==='AGENT_ADMISSIONS_CLOSED');assert.equal(simulated,0);
 const pending:ChainOperation={id:poolOperationId(request),status:'pending'};rows.set(pending.id,pending);
 assert.deepEqual((await route('POST','/agents/transactions',request))?.value,pending);assert.equal(simulated,0);
 assert.equal((await route('POST','/agents/transactions',cancel))?.status,202);assert.equal(simulated,1);
 const revoke={to:m.family,data:encodeFunctionData({abi:familyAbi,functionName:'revoke',args:[addr(20),0n,200n,sig]})};
 assert.equal((await route('POST','/agents/transactions',revoke))?.status,202);
 assert.equal((await route('GET',`/agents/operations/${zeroHash}`))?.status,404);
});
test('sponsor simulation errors never claim non-acceptance from a network outage',async()=>{
 const writer={get:async()=>null,status:()=>({available:true}),enqueue:async()=>{throw Error('429');}};
 const route=poolSponsorRoutes(m,writer,async()=>true);
 await assert.rejects(route('POST','/agents/transactions',request),(e:any)=>e.accepted===undefined);
});
test('lost response after acceptance survives F5 without another POST or a new nonce',async()=>{
 const store=memory(),id=poolOperationId(request);let operation:ChainOperation|null=null,posts=0;
 const transport=async(path:string,body?:PoolSignedCall)=>{
  if(path.startsWith('operations/')){if(!operation)throw missing();return operation;}
  assert.equal(store.values.size,1,'intent exists before POST');assert.deepEqual(body,request);posts++;
  operation={id,status:'pending',hash:zeroHash};throw Error('response lost');
 };
 let client=createPoolSponsor(m,addr(20),store,transport);
 const prepared={...request,digest:zeroHash,nonce:0n,deadline:200n};
 await assert.rejects(client.send(prepared),/response lost/);assert.equal(client.pending()?.id,id);
 client=createPoolSponsor(m,addr(20),store,transport);assert.equal((await client.resume())?.status,'pending');assert.equal(posts,1);
 await assert.rejects(client.send(cancel),PoolSponsorPending);assert.equal(posts,1);
 operation={id,status:'confirmed',hash:zeroHash};assert.equal((await client.resume())?.status,'confirmed');assert.equal(client.pending(),null);
});
test('429, corrupt responses and account switching preserve the original signed intent',async()=>{
 const store=memory(),id=poolOperationId(request);let failure:any=Object.assign(Error('429'),{status:429});
 const transport=async(path:string)=>{if(path.startsWith('operations/'))throw missing();if(failure instanceof Error)throw failure;return failure;};
 const client=createPoolSponsor(m,addr(20),store,transport);
 await assert.rejects(client.send(request),/429/);assert.equal(client.pending()?.id,id);
 failure={id:zeroHash,status:'confirmed'};await assert.rejects(client.resume(),/Invalid sponsor/);assert.equal(client.pending()?.id,id);
 const other=createPoolSponsor(m,addr(22),store,transport);assert.equal(other.pending(),null);assert.equal(client.pending()?.id,id);
 failure=Object.assign(Error('rejected before persistence'),{accepted:false,code:'CONTRACT_REJECTED'});
 await assert.rejects(client.resume(),/rejected/);assert.equal(client.pending(),null);
});
test('two clicks do not send parallel calls; server receipt of a revert clears only that intent',async()=>{
 const store=memory(),id=poolOperationId(request);let release!:(v:unknown)=>void;
 const client=createPoolSponsor(m,addr(20),store,async()=>new Promise(r=>{release=r;}));
 const first=client.send(request);await assert.rejects(client.send(request),PoolSponsorPending);
 release({id,status:'failed',hash:zeroHash,error:'RAW TRANSACTION AND SIGNATURE'});
 const result=await first;assert.equal(result?.status,'failed');assert(!result?.error?.includes('RAW'));assert.equal(client.pending(),null);
});
function familyFixture(){
 const owner=privateKeyToAccount(generatePrivateKey()),storage=memory();let signatures=0,chain=10143,now=100n,revision=0n,error=false;
 let grant:any={player:zeroAddress,key:zeroAddress,issuedAt:0n,expires:0n,revision:0n};
 const client={getChainId:async()=>chain,getBlock:async()=>{if(error)throw Error('RPC unavailable');return{number:44n,hash:zeroHash,timestamp:now};},readContract:async(c:any)=>{
  assert.equal(c.blockNumber,44n);
  if(c.functionName==='revisions')return revision;if(c.functionName==='grantOf')return grant;
  if(c.functionName==='grantDigest')return hashTypedData({domain:{name:'PONGIT Arcade Family',version:'1',chainId:10143,verifyingContract:m.family},types:familyGrantTypes,primaryType:'ArcadeFamilyGrant',message:c.args[0]});
  throw Error(c.functionName);
 }} as unknown as PublicClient;
 return{owner:{...owner,signTypedData:async(arg:any)=>{signatures++;return owner.signTypedData(arg);}},storage,client,
  state:()=>({signatures}),grant:(g:any)=>{grant=g;},fail:(e:boolean)=>{error=e;},time:(t:bigint)=>{now=t;},chain:(n:number)=>{chain=n;},revision:(r:bigint)=>{revision=r;}};
}
test('two-hour root grant persists before sponsoring and reuses exactly across F5 and arena changes',async()=>{
 const f=familyFixture();const first=await preparePoolFamily(f.client,m,f.owner,f.storage);assert(first.call);assert.equal(first.session.grant.expires,7300n);
 const again=await preparePoolFamily(f.client,m,f.owner,f.storage);assert.deepEqual(again,first);assert.equal(f.state().signatures,1);
 f.grant(first.session.grant);const active=await preparePoolFamily(f.client,{...m,arenas:[...m.arenas].reverse()},f.owner,f.storage);
 assert.equal(active.call,null);assert.equal(active.session.key,first.session.key);assert.equal(f.state().signatures,1);
 assert.equal((await observePoolFamily(f.client,m,active.session)).active,true);
 assert.equal(loadPoolFamily(m,addr(999),f.storage),null);
});
test('temporary failure never renews a passkey; only confirmed expiration or revocation requires consent',async()=>{
 const f=familyFixture(),first=await preparePoolFamily(f.client,m,f.owner,f.storage);f.grant(first.session.grant);f.fail(true);
 await assert.rejects(preparePoolFamily(f.client,m,f.owner,f.storage),/unavailable/);assert.equal(f.state().signatures,1);
 assert.equal(loadPoolFamily(m,f.owner.address,f.storage)?.key,first.session.key);
 f.fail(false);f.revision(1n);f.grant({player:zeroAddress,key:zeroAddress,issuedAt:0n,expires:0n,revision:0n});
 const renewed=await preparePoolFamily(f.client,m,f.owner,f.storage);assert.equal(f.state().signatures,2);assert.equal(renewed.session.grant.revision,1n);
 assert.notEqual(renewed.session.key,first.session.key);
 f.time(7400n);const expired=await preparePoolFamily(f.client,m,f.owner,f.storage);assert.equal(expired.session.grant.issuedAt,7400n);assert.equal(f.state().signatures,3);
 f.chain(1);await assert.rejects(preparePoolFamily(f.client,m,f.owner,f.storage),/Monad Testnet/);assert.equal(f.state().signatures,3);
});
test('newer authorization on another device is not retried forever as a stale grant',async()=>{
 const f=familyFixture(),first=await preparePoolFamily(f.client,m,f.owner,f.storage);f.time(110n);
 f.grant({...first.session.grant,key:addr(100),issuedAt:105n});
 const renewed=await preparePoolFamily(f.client,m,f.owner,f.storage);assert.equal(f.state().signatures,2);assert.notEqual(renewed.session.key,first.session.key);
 const corrupt=memory();for(const [key,value] of f.storage.values)corrupt.setItem(key,value.replace(renewed.session.key,'invalid'));
 await assert.rejects(preparePoolFamily(f.client,m,f.owner,corrupt),/Saved arcade authorization is invalid/);assert.equal(f.state().signatures,2);
});

test('a grant near its end is renewed at a pause instead of expiring during the next match',async()=>{
 const f=familyFixture();const first=await preparePoolFamily(f.client,m,f.owner,f.storage);f.grant(first.session.grant);
 // Early in its two hours the margin changes nothing: no prompt, same key.
 f.time(1000n);assert.equal(familyExpiresSoon(first.session,1000n),false);
 const kept=await preparePoolFamily(f.client,m,f.owner,f.storage,{renewWithin:SESSION_RENEW_MARGIN});
 assert.equal(kept.call,null);assert.equal(kept.session.key,first.session.key);assert.equal(f.state().signatures,1);
 // Fifteen minutes before its end, a match could outlive it.
 const late=first.session.grant.expires-900n;f.time(late);assert.equal(familyExpiresSoon(first.session,late),true);
 // Without asking to renew, nothing is silently re-keyed.
 const untouched=await preparePoolFamily(f.client,m,f.owner,f.storage);
 assert.equal(untouched.session.key,first.session.key);assert.equal(f.state().signatures,1);
 // Asked at a pause, one consent replaces it with a full two hours.
 const renewed=await preparePoolFamily(f.client,m,f.owner,f.storage,{renewWithin:SESSION_RENEW_MARGIN});
 assert(renewed.call);assert.notEqual(renewed.session.key,first.session.key);
 assert.equal(renewed.session.grant.expires,late+7200n);assert.equal(f.state().signatures,2);
 assert.equal(loadPoolFamily(m,f.owner.address,f.storage)?.key,renewed.session.key);
});
