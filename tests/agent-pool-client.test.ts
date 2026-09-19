import {test} from 'node:test';import assert from 'node:assert/strict';
import {decodeFunctionData,hashTypedData,keccak256,recoverTypedDataAddress,toHex,type Address,type PublicClient} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {preparePoolChallenge,preparePoolRegistration,poolChallengeTypes,poolRegistrationTypes} from '../shared/agent-pool-client';
import {agentChallengesAbi} from '../shared/abi-AgentChallenges';import {agentCatalogAbi} from '../shared/abi-AgentCatalog';
import type {AgentPoolManifest} from '../shared/agent-pool';
const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const m:AgentPoolManifest={version:2,chainId:10143,engineChainId:4242,rulesVersion:10,hub:addr(1),pool:addr(2),catalog:addr(3),tournaments:addr(4),ratings:addr(5),challenges:addr(6),qualifications:addr(11),family:addr(7),
 arenas:[8,9,10].map(n=>({app:addr(n),node:`https://arena-${n}.example`,runtimeHash:`0x${'a'.repeat(64)}`})),enabled:false,tournamentsEnabled:false,verifiedCapacity:0,qualificationEvidence:null,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
test('registration signs the exact creator, strategy, metadata, catalogue and Monad chain',async()=>{
 const owner=privateKeyToAccount(generatePrivateKey());let signed=0;
 const client={getBlock:async()=>({number:44n,timestamp:100n}),getChainId:async()=>10143,readContract:async(c:any)=>{
  assert.equal(c.blockNumber,44n);if(c.functionName==='nonces')return 7n;
  return hashTypedData({domain:{name:'PONGIT Agent Catalog',version:'1',chainId:10143,verifyingContract:m.catalog},types:poolRegistrationTypes,primaryType:'StrategyRegistration',message:c.args[0]});
 }} as unknown as PublicClient;
 const prepared=await preparePoolRegistration(client,m,{...owner,signTypedData:async args=>{signed++;return owner.signTypedData(args);}}, {strategy:addr(20),name:'Tracker',avatar:2,modes:3});
 const call=decodeFunctionData({abi:agentCatalogAbi,data:prepared.data});assert.equal(call.functionName,'register');if(call.functionName!=='register')throw Error();
 const [registration,signature]=call.args;assert.equal(registration.strategy,addr(20));assert.equal(registration.nonce,7n);assert.equal(registration.deadline,400n);assert.equal(signed,1);
 assert.equal(await recoverTypedDataAddress({domain:{name:'PONGIT Agent Catalog',version:'1',chainId:10143,verifyingContract:m.catalog},types:poolRegistrationTypes,primaryType:'StrategyRegistration',message:registration,signature}),owner.address);
});
test('challenge is signed only by the granted arcade key and never exceeds the grant expiry',async()=>{
 const key=privateKeyToAccount(generatePrivateKey()),grant=keccak256(toHex('limited fixture grant'));let expired=false,wrongDomain=false;
 const client={getBlock:async()=>({number:44n,timestamp:100n}),getChainId:async()=>10143,readContract:async(c:any)=>{
  if(c.functionName==='grantOf')return{key:key.address,expires:expired?99n:150n};if(c.functionName==='grantDigest')return grant;if(c.functionName==='nonces')return 3n;
  const [g,action,agent,mode,id,nonce,deadline]=c.args;
  return hashTypedData({domain:{name:'PONGIT Agent Challenges',version:'1',chainId:wrongDomain?4242:10143,verifyingContract:m.challenges},types:poolChallengeTypes,primaryType:'AgentChallenge',message:{grant:g,action,agent,mode,id,nonce,deadline}});
 }} as unknown as PublicClient;
 const p=await preparePoolChallenge(client,m,key,addr(99),{agent:addr(20),mode:1});assert.equal(p.deadline,150n);
 const call=decodeFunctionData({abi:agentChallengesAbi,data:p.data});assert.equal(call.functionName,'command');if(call.functionName!=='command')throw Error();
 const [player,action,agent,mode,id,nonce,deadline,signature]=call.args;assert.equal(player,addr(99));assert.equal(action,1);assert.equal(id,0n);
 assert.equal(await recoverTypedDataAddress({domain:{name:'PONGIT Agent Challenges',version:'1',chainId:10143,verifyingContract:m.challenges},types:poolChallengeTypes,primaryType:'AgentChallenge',message:{grant,action,agent,mode,id,nonce,deadline},signature}),key.address);
 expired=true;await assert.rejects(preparePoolChallenge(client,m,key,addr(99),{agent:addr(20),mode:1}),/Renew/);
 expired=false;wrongDomain=true;await assert.rejects(preparePoolChallenge(client,m,key,addr(99),{agent:addr(20),mode:1}),/domain/);
});
