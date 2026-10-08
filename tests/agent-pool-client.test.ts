import {test} from 'node:test';import assert from 'node:assert/strict';
import {createPublicClient,custom,decodeFunctionData,encodeFunctionResult,hashTypedData,keccak256,multicall3Abi,recoverTypedDataAddress,toHex,zeroHash,type Address,type Hex,type PublicClient} from 'viem';
import {abi as familyAbi} from '../shared/abi-independent-ArcadeFamily';
import {monadTestnet} from 'viem/chains';
import {familyGrantTypes} from '../shared/independent';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {preparePoolChallenge,preparePoolRegistration,poolChallengeTypes,poolRegistrationTypes} from '../shared/agent-pool-client';
import {agentChallengesAbi} from '../shared/abi-AgentChallenges';import {agentCatalogAbi} from '../shared/abi-AgentCatalog';
import type {AgentPoolManifest} from '../shared/agent-pool';
const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const m:AgentPoolManifest={version:2,chainId:10143,engineChainId:4242,rulesVersion:10,hub:addr(1),pool:addr(2),catalog:addr(3),tournaments:addr(4),ratings:addr(5),challenges:addr(6),qualifications:addr(11),family:addr(7),
 arenas:[8,9,10].map(n=>({app:addr(n),node:`https://arena-${n}.example`,runtimeHash:`0x${'a'.repeat(64)}`})),enabled:false,tournamentsEnabled:false,verifiedCapacity:0,qualificationEvidence:null,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
const grantHash=(grant:any)=>hashTypedData({domain:{name:'PONGIT Arcade Family',version:'1',chainId:10143,verifyingContract:m.family},types:familyGrantTypes,primaryType:'ArcadeFamilyGrant',message:grant});
function canonicalFixture(client:PublicClient){
 (client as any).multicall=async(c:any)=>{
  assert.equal(c.allowFailure,false);assert.equal(c.requireCanonical,true);
  return Promise.all(c.contracts.map((call:any)=>client.readContract({...call,blockHash:c.blockHash,requireCanonical:c.requireCanonical})));
 };
}

test('paced browser challenge uses three encoded canonical rounds and fails closed on a rejected batch member',async()=>{
 const key=privateKeyToAccount(generatePrivateKey()),family={player:addr(99),key:key.address,issuedAt:50n,expires:250n,revision:0n};
 const grant=grantHash(family),hash=`0x${'bc'.repeat(32)}` as Hex;let failed=false,signed=0,pending=0n;
 const rounds:string[][]=[];
 const client=createPublicClient({chain:monadTestnet,transport:custom({request:async request=>{
  if(request.method==='eth_chainId')return '0x279f';
  if(request.method==='eth_getBlockByNumber')return{number:'0x2c',timestamp:'0x64',hash,transactions:[]};
  assert.equal(request.method,'eth_call');
  const [call,pin]=request.params as any;assert.deepEqual(pin,{blockHash:hash,requireCanonical:true});
  const isBatch=call.to.toLowerCase()==='0xca11bde05977b3631167028862be2a173976ca11';
  const batch=isBatch?decodeFunctionData({abi:multicall3Abi,data:call.data}):undefined;
  if(batch&&batch.functionName!=='aggregate3')throw Error('Unexpected multicall');
  const calls=batch?.args[0]??[{target:call.to,callData:call.data}];
  const names:string[]=[];rounds.push(names);
  const results=calls.map(c=>{
   const abi=c.target.toLowerCase()===m.family.toLowerCase()?familyAbi:agentChallengesAbi;
   const input=decodeFunctionData({abi,data:c.callData});names.push(input.functionName);
   if(failed&&input.functionName==='nonces')return{success:false,returnData:'0x' as Hex};
   let result:any;
   if(input.functionName==='grantOf')result=family;
   else if(input.functionName==='count')result=49n;
   else if(input.functionName==='grantDigest')result=grant;
   else if(input.functionName==='nonces')result=3n;
   else if(input.functionName==='pending')result=pending;
   else{
    assert.equal(input.functionName,'digest');
    const [g,action,agent,mode,id,nonce,deadline]=input.args as any;
    result=hashTypedData({domain:{name:'PONGIT Agent Challenges',version:'1',chainId:10143,verifyingContract:m.challenges},types:poolChallengeTypes,primaryType:'AgentChallenge',message:{grant:g,action,agent,mode,id,nonce,deadline}});
   }
   return{success:true,returnData:encodeFunctionResult({abi,functionName:input.functionName,result} as any)};
  });
  return isBatch?encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result:results}):results[0].returnData;
 }},{retryCount:0})});
 const five={...m,version:5,rulesVersion:15,maxMatches:5,houseInstances:'official-v1',countdownClock:'engine-ticks-v1',arenaAdmissions:'verified-epoch-v1',
  lanes:{tournament:1,challenge:4},challengeAdmission:'atomic-v1',arenas:[...m.arenas,...[12,13].map(n=>({app:addr(n),node:`https://arena-${n}.example`,runtimeHash:`0x${'a'.repeat(64)}`}))]} as AgentPoolManifest;
 const signer={...key,signTypedData:async(args:any)=>{signed++;return key.signTypedData(args);}};
 await preparePoolChallenge(client,five,signer,family.player,{agent:addr(20),mode:1});
 assert.deepEqual(rounds,[['grantOf','count'],['grantDigest','nonces'],['digest']]);assert.equal(signed,1);
 failed=true;rounds.length=0;
 await assert.rejects(preparePoolChallenge(client,five,signer,family.player,{agent:addr(20),mode:1}));
 assert.equal(signed,1,'A failed member must not create another signed intent');
 assert.equal(rounds.length,2,'No fallback to latest or a partial authorization');
 failed=false;rounds.length=0;
 const saved={agent:addr(20),mode:1 as const,expectedFamily:family,checkPending:true};
 await preparePoolChallenge(client,five,signer,family.player,saved);
 assert.deepEqual(rounds,[['grantOf','count','pending','grantDigest','nonces'],['digest']]);assert.equal(signed,2);
 pending=77n;rounds.length=0;
 await assert.rejects(preparePoolChallenge(client,five,signer,family.player,saved),(e:any)=>e.code==='POOL_CHALLENGE_PENDING'&&e.id===77n);
 assert.equal(rounds.length,1);assert.equal(signed,2,'An existing request is resumed without a new signature');
 pending=0n;failed=true;rounds.length=0;
 await assert.rejects(preparePoolChallenge(client,five,signer,family.player,saved));
 assert.equal(rounds.length,1);assert.equal(signed,2,'A failed saved-grant batch cannot authorize the digest round');
});
test('registration signs the exact creator, strategy, metadata, catalogue and Monad chain',async()=>{
 const owner=privateKeyToAccount(generatePrivateKey());let signed=0;
 const client={getBlock:async()=>({number:44n,timestamp:100n}),getChainId:async()=>10143,getCode:async(c:any)=>{assert.equal(c.blockNumber,44n);return '0x60006000f3';},readContract:async(c:any)=>{
  assert.equal(c.blockNumber,44n);if(c.functionName==='creator')return owner.address;if(c.functionName==='nonces')return 7n;
  return hashTypedData({domain:{name:'PONGIT Agent Catalog',version:'1',chainId:10143,verifyingContract:m.catalog},types:poolRegistrationTypes,primaryType:'StrategyRegistration',message:c.args[0]});
 }} as unknown as PublicClient;
 const prepared=await preparePoolRegistration(client,m,{...owner,signTypedData:async args=>{signed++;return owner.signTypedData(args);}}, {strategy:addr(20),name:'Tracker',avatar:2,modes:3});
 const call=decodeFunctionData({abi:agentCatalogAbi,data:prepared.data});assert.equal(call.functionName,'register');if(call.functionName!=='register')throw Error();
 const [registration,signature]=call.args;assert.equal(registration.strategy,addr(20));assert.equal(registration.nonce,7n);assert.equal(registration.deadline,400n);assert.equal(signed,1);
 assert.equal(await recoverTypedDataAddress({domain:{name:'PONGIT Agent Catalog',version:'1',chainId:10143,verifyingContract:m.catalog},types:poolRegistrationTypes,primaryType:'StrategyRegistration',message:registration,signature}),owner.address);
});
test('registration refuses incompatible runtime and a different creator before requesting a signature',async()=>{
 const owner=privateKeyToAccount(generatePrivateKey());let code='0x00a2',claimed=owner.address,signed=0;
 const client={getBlock:async()=>({number:44n,timestamp:100n}),getChainId:async()=>10143,getCode:async()=>code,readContract:async()=>claimed} as unknown as PublicClient;
 const signer={...owner,signTypedData:async(args:any)=>{signed++;return owner.signTypedData(args);}};
 const options={strategy:addr(20),name:'Tracker',avatar:2,modes:3 as const};
 await assert.rejects(preparePoolRegistration(client,m,signer,options),/metadata is also checked/);
 code='0x60006000f3';claimed=addr(90);await assert.rejects(preparePoolRegistration(client,m,signer,options),/creator differs/);
 assert.equal(signed,0);
});
test('challenge is signed only by the granted arcade key and never exceeds the grant expiry',async()=>{
 const key=privateKeyToAccount(generatePrivateKey()),family={player:addr(99),key:key.address,issuedAt:50n,expires:150n,revision:0n},grant=grantHash(family);let expired=false,wrongDomain=false;
 const client={getBlock:async()=>({number:44n,timestamp:100n,hash:zeroHash}),getChainId:async()=>10143,readContract:async(c:any)=>{
  assert.equal(c.blockHash,zeroHash);assert.equal(c.requireCanonical,true);assert.equal(c.blockNumber,undefined);
  if(c.functionName==='grantOf')return {...family,expires:expired?99n:150n};if(c.functionName==='grantDigest')return grant;if(c.functionName==='nonces')return 3n;
  const [g,action,agent,mode,id,nonce,deadline]=c.args;
  return hashTypedData({domain:{name:'PONGIT Agent Challenges',version:'1',chainId:wrongDomain?4242:10143,verifyingContract:m.challenges},types:poolChallengeTypes,primaryType:'AgentChallenge',message:{grant:g,action,agent,mode,id,nonce,deadline}});
 }} as unknown as PublicClient;
 canonicalFixture(client);
 const p=await preparePoolChallenge(client,m,key,addr(99),{agent:addr(20),mode:1});assert.equal(p.deadline,150n);
 const call=decodeFunctionData({abi:agentChallengesAbi,data:p.data});assert.equal(call.functionName,'command');if(call.functionName!=='command')throw Error();
 const [player,action,agent,mode,id,nonce,deadline,signature]=call.args;assert.equal(player,addr(99));assert.equal(action,1);assert.equal(id,0n);
 assert.equal(await recoverTypedDataAddress({domain:{name:'PONGIT Agent Challenges',version:'1',chainId:10143,verifyingContract:m.challenges},types:poolChallengeTypes,primaryType:'AgentChallenge',message:{grant,action,agent,mode,id,nonce,deadline},signature}),key.address);
 expired=true;await assert.rejects(preparePoolChallenge(client,m,key,addr(99),{agent:addr(20),mode:1}),/Renew/);
 expired=false;wrongDomain=true;await assert.rejects(preparePoolChallenge(client,m,key,addr(99),{agent:addr(20),mode:1}),/domain/);
});

test('one canonical family observation preserves renewal, exact saved grant and network-failure semantics',async()=>{
 const key=privateKeyToAccount(generatePrivateKey()),family={player:addr(99),key:key.address,issuedAt:50n,expires:7300n,revision:2n};
 let signed=0,reads=0,networkFailure=false;
 const client={getBlock:async()=>({number:44n,timestamp:100n,hash:zeroHash}),getChainId:async()=>10143,readContract:async(c:any)=>{
  assert.equal(c.blockHash,zeroHash);assert.equal(c.requireCanonical,true);
  if(c.functionName==='grantOf'){reads++;if(networkFailure)throw Error('Unavailable RPC');return family;}
  if(c.functionName==='grantDigest')return grantHash(family);if(c.functionName==='nonces')return 3n;
  const [grant,action,agent,mode,id,nonce,deadline]=c.args;
  return hashTypedData({domain:{name:'PONGIT Agent Challenges',version:'1',chainId:10143,verifyingContract:m.challenges},types:poolChallengeTypes,primaryType:'AgentChallenge',message:{grant,action,agent,mode,id,nonce,deadline}});
 }} as unknown as PublicClient;canonicalFixture(client);
 const signer={...key,signTypedData:async(args:any)=>{signed++;return key.signTypedData(args);}};
 const options={agent:addr(20),mode:1 as const,expectedFamily:{...family},renewWithin:1200n};
 await preparePoolChallenge(client,m,signer,family.player,options);assert.equal(reads,1);assert.equal(signed,1);
 for(const field of ['issuedAt','expires','revision'] as const){
  await assert.rejects(preparePoolChallenge(client,m,signer,family.player,{...options,expectedFamily:{...family,[field]:family[field]+1n}}),
   (error:any)=>error.code==='POOL_FAMILY_RENEW'&&!error.active);
 }
 family.expires=1100n;
 await assert.rejects(preparePoolChallenge(client,m,signer,family.player,{...options,expectedFamily:{...family}}),
  (error:any)=>error.code==='POOL_FAMILY_RENEW'&&error.active);
 networkFailure=true;
 await assert.rejects(preparePoolChallenge(client,m,signer,family.player,options),(error:any)=>error.code!=='POOL_FAMILY_RENEW');
 assert.equal(signed,1,'Neither network recovery nor renewal signs another challenge');
});

test('new atomic challenge sizes its bounded scan at the same block without changing its signature',async()=>{
 const key=privateKeyToAccount(generatePrivateKey()),family={player:addr(99),key:key.address,issuedAt:50n,expires:250n,revision:0n},grant=grantHash(family);const reads:string[]=[];
 const five={...m,version:5,rulesVersion:15,maxMatches:5,houseInstances:'official-v1',countdownClock:'engine-ticks-v1',arenaAdmissions:'verified-epoch-v1',
  lanes:{tournament:1,challenge:4},challengeAdmission:'atomic-v1',arenas:[...m.arenas,...[12,13].map(n=>({app:addr(n),node:`https://arena-${n}.example`,runtimeHash:`0x${'a'.repeat(64)}`}))]} as AgentPoolManifest;
 const client={getBlock:async()=>({number:44n,timestamp:100n,hash:zeroHash}),getChainId:async()=>10143,readContract:async(c:any)=>{
  assert.equal(c.blockHash,zeroHash);assert.equal(c.requireCanonical,true);reads.push(c.functionName);
  if(c.functionName==='count')return 49n;if(c.functionName==='grantOf')return family;
  if(c.functionName==='grantDigest')return grant;if(c.functionName==='nonces')return 3n;
  const [g,action,agent,mode,id,nonce,deadline]=c.args;
  return hashTypedData({domain:{name:'PONGIT Agent Challenges',version:'1',chainId:10143,verifyingContract:m.challenges},types:poolChallengeTypes,primaryType:'AgentChallenge',message:{grant:g,action,agent,mode,id,nonce,deadline}});
 }} as unknown as PublicClient;
 canonicalFixture(client);
 const prepared=await preparePoolChallenge(client,five,key,addr(99),{agent:addr(20),mode:1});
 const batch=decodeFunctionData({abi:multicall3Abi,data:prepared.data});assert.equal(batch.functionName,'aggregate3');if(batch.functionName!=='aggregate3')throw Error();
 assert.equal(batch.args[0].length,3);assert.equal(reads.filter(n=>n==='count').length,1);
 const command=decodeFunctionData({abi:agentChallengesAbi,data:batch.args[0][0].callData});if(command.functionName!=='command')throw Error();
 const [,action,agent,mode,id,nonce,deadline,signature]=command.args;
 assert.equal(await recoverTypedDataAddress({domain:{name:'PONGIT Agent Challenges',version:'1',chainId:10143,verifyingContract:m.challenges},types:poolChallengeTypes,primaryType:'AgentChallenge',message:{grant,action,agent,mode,id,nonce,deadline},signature}),key.address);
 reads.length=0;const cancel=await preparePoolChallenge(client,five,key,addr(99),{agent:addr(20),mode:1,cancel:50n});
 assert.equal(cancel.to,m.challenges);assert(!reads.includes('count'),'Cancellation must not scan or admit other players');
 reads.length=0;
 const responsive={...five,rulesVersion:17 as const,friendlyPause:'heartbeat-v1' as const};
 const current=await preparePoolChallenge(client,responsive,key,addr(99),{agent:addr(20),mode:1});
 const currentBatch=decodeFunctionData({abi:multicall3Abi,data:current.data});
 assert.equal(currentBatch.functionName,'aggregate3');if(currentBatch.functionName!=='aggregate3')throw Error();
 assert.equal(currentBatch.args[0].length,2,'one request plus one waiting-ring pass, regardless of completed history');
 assert.equal(currentBatch.args[0][0].callData,batch.args[0][0].callData,'same player signature, nonce, mode and identity');
 assert.equal(currentBatch.args[0][1].allowFailure,true,'a filled lane retains the signed queued request');
 assert(!reads.includes('count'),'history does not consume another canonical read or three empty admission calls');
});

test('challenge refuses a noncanonical observation or wrong family domain before signing',async()=>{
 const key=privateKeyToAccount(generatePrivateKey()),family={player:addr(99),key:key.address,issuedAt:50n,expires:250n,revision:0n};
 let failure=true,signed=0,nonceRead=false;
 const signer={...key,signTypedData:async(args:any)=>{signed++;return key.signTypedData(args);}};
 const client={getChainId:async()=>10143,getBlock:async()=>({number:44n,timestamp:100n,hash:zeroHash}),readContract:async(c:any)=>{
  assert.equal(c.requireCanonical,true);assert.equal(c.blockHash,zeroHash);
  if(c.functionName==='grantOf')return family;
  if(c.functionName==='grantDigest'){if(failure)throw Error('header is not canonical');return zeroHash;}
  if(c.functionName==='nonces'){nonceRead=true;return 3n;}
  throw Error('Must not request a challenge signature');
 }} as unknown as PublicClient;
 canonicalFixture(client);
 await assert.rejects(preparePoolChallenge(client,m,signer,addr(99),{agent:addr(20),mode:0}),/not canonical/);
 assert(nonceRead,'Nonce read can overlap verification, but never authorizes signing');
 failure=false;await assert.rejects(preparePoolChallenge(client,m,signer,addr(99),{agent:addr(20),mode:0}),/domain differs/);
 assert.equal(signed,0);
});


test('independent admission preflight overlaps canonical reads but cannot bypass signing or renewal',async()=>{
 const key=privateKeyToAccount(generatePrivateKey()),family={player:addr(99),key:key.address,issuedAt:50n,expires:250n,revision:0n};
 let signed=0,reads=0,expired=false;
 const client={getChainId:async()=>10143,getBlock:async()=>({number:44n,timestamp:100n,hash:zeroHash}),readContract:async(c:any)=>{
  assert.equal(c.blockHash,zeroHash);assert.equal(c.requireCanonical,true);reads++;
  if(c.functionName==='grantOf')return{...family,expires:expired?99n:family.expires};
  if(c.functionName==='grantDigest')return grantHash(family);if(c.functionName==='nonces')return 3n;
  const [grant,action,agent,mode,id,nonce,deadline]=c.args;
  return hashTypedData({domain:{name:'PONGIT Agent Challenges',version:'1',chainId:10143,verifyingContract:m.challenges},types:poolChallengeTypes,primaryType:'AgentChallenge',message:{grant,action,agent,mode,id,nonce,deadline}});
 }} as unknown as PublicClient;canonicalFixture(client);
 const signer={...key,signTypedData:async(args:any)=>{signed++;return key.signTypedData(args);}};
 const options={agent:addr(20),mode:1 as const,expectedFamily:family};
 let allow!:()=>void;
 const pendingCapacity=new Promise<void>(resolve=>{allow=resolve;});
 const prepared=preparePoolChallenge(client,m,signer,family.player,{...options,admissionPreflight:()=>pendingCapacity});
 await new Promise(resolve=>setImmediate(resolve));
 assert(reads>=3,'canonical grant/domain/nonce reads complete while capacity is pending');
 assert.equal(signed,0,'neither a fresh nor an existing session may sign before capacity returns');
 allow();await prepared;assert.equal(signed,1);
 const unavailable=Object.assign(Error('capacity unavailable'),{code:'POOL_CAPACITY_UNAVAILABLE'});
 for(const stale of [false,true]){
  expired=stale;
  await assert.rejects(preparePoolChallenge(client,m,signer,family.player,{...options,admissionPreflight:async()=>{throw unavailable;}}),e=>e===unavailable);
 }
 assert.equal(signed,1,'unavailable capacity cannot sign or request renewal of an expired family');
 expired=true;
 await assert.rejects(preparePoolChallenge(client,m,signer,family.player,{...options,admissionPreflight:async()=>{}}),(e:any)=>e.code==='POOL_FAMILY_RENEW');
 assert.equal(signed,1,'available capacity cannot override canonical expiry');
});
