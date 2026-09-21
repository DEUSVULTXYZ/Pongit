import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,toHex,zeroHash,type Address,type PublicClient} from 'viem';
import {validateAgentPoolManifest,type AgentPoolManifest} from '../shared/agent-pool';
import {verifyHouseInstanceAuthorities} from '../shared/agent-house-instances';
import {AgentPoolReader} from '../relayer/src/agents/pool-read';
import {qualificationWork,type PoolRead} from '../relayer/src/agents/pool-maintenance';

const address=(n:number)=>toHex(n,{size:20}) as Address;
const m:AgentPoolManifest={version:4,rulesVersion:15,houseInstances:'official-v1',chainId:10143,engineChainId:4242,
 hub:address(1),pool:address(2),catalog:address(3),tournaments:address(4),ratings:address(5),challenges:address(6),
 qualifications:address(7),family:address(8),arenas:[9,10,11].map(n=>({app:address(n),node:`https://arena-${n}.example`,runtimeHash:toHex(1,{size:32})})),
 enabled:false,tournamentsEnabled:false,verifiedCapacity:0,qualificationEvidence:null,
 durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};

test('house instance support is explicit and requires the matching pool and both queue contracts',async()=>{
 assert.equal(validateAgentPoolManifest(m).houseInstances,'official-v1');
 assert.throws(()=>validateAgentPoolManifest({...m,version:3,rulesVersion:11}),/Unsupported house/);
 assert.throws(()=>validateAgentPoolManifest({...m,houseInstances:true} as any),/Unsupported house/);
 let bad:Address|undefined,version=2n,calls=0;
 const read:PoolRead=async(at,abi,fn,args=[])=>{
  encodeFunctionData({abi,functionName:fn,args});calls++;
  return(fn==='AUTHORITY_VERSION'?version:at!==bad) as any;
 };
 await verifyHouseInstanceAuthorities(read,{...m,houseInstances:undefined});assert.equal(calls,0);
 await verifyHouseInstanceAuthorities(read,m);assert.equal(calls,4);
 for(const at of [m.pool,m.challenges,m.qualifications]){bad=at;await assert.rejects(verifyHouseInstanceAuthorities(read,m),/mismatch/);}
 bad=undefined;version=1n;await assert.rejects(verifyHouseInstanceAuthorities(read,m),/mismatch/);
 await assert.rejects(verifyHouseInstanceAuthorities((async()=>{throw Error('RPC unavailable');}) as PoolRead,m),/RPC unavailable/);
});

test('independent house waiting status uses contract eligibility while competitive and community references remain intact',async()=>{
 const human=address(40),bot=address(41),token=toHex(500,{size:32}),playing=toHex(501,{size:32});
 let eligible=true,official=true;
 const client={getBlock:async()=>({number:50n,hash:zeroHash,timestamp:1000n}),readContract:async(r:any)=>{
  assert.equal(r.blockNumber,50n);encodeFunctionData({abi:r.abi,functionName:r.functionName,args:r.args});
  switch(r.functionName){
   case 'count':return 1n;case 'at':return bot;case 'house':return official?bot:address(42);
   case 'identity':return{creator:address(43),house:1,codeHash:zeroHash,metadata:zeroHash,modes:3,qualified:3,available:true,lastTournament:3n};
   case 'pending':return 2n;case 'requests':return[human,bot,1,1,1000n,zeroHash];
   case 'participation':return token;case 'playing':return playing;case 'token':return token;
   case 'houseInstanceEligible':assert.equal(r.address,m.challenges);return eligible;
   default:throw Error(r.functionName);
  }
 }} as unknown as PublicClient;
 const reader=new AgentPoolReader(client,m);
 const house=(await reader.catalog()).value.items[0];assert.equal(house.waiting,false);
 assert.equal(house.participation,token);assert.equal(house.playing,playing);assert.equal(house.friendlyInstances[1],true);
 let request=(await reader.challenge(human)).value.request!;assert.equal(request.waitReason,'arena');assert.equal(request.tournamentId,undefined);
 eligible=false;assert.equal((await reader.catalog()).value.items[0].waiting,true);
 request=(await reader.challenge(human)).value.request!;assert.equal(request.waitReason,'tournament');assert.equal(request.tournamentId,'3');
 official=false;const community=(await reader.catalog()).value.items[0];assert.equal(community.official,false);assert.equal(community.friendlyInstances[0],false);
 const legacy=new AgentPoolReader(client,{...m,houseInstances:undefined});eligible=true;
 assert.equal((await legacy.catalog()).value.items[0].waiting,true);assert.equal((await legacy.challenge(human)).value.request?.waitReason,'tournament');
});

test('qualification inspects the same versioned opponent rule as the contract without bypassing candidate or fresh-base checks',async()=>{
 const candidate=address(40),house=address(41);let candidateFree=true,base=500n,partner=true;
 const read:PoolRead=async(at,abi,fn,args=[])=>{
  encodeFunctionData({abi,functionName:fn,args});
  if(fn==='count')return 1n as any;if(fn==='at')return candidate as any;
  if(fn==='identity')return{available:true,modes:1,qualified:0,house:0} as any;
  if(fn==='registeredBlock')return base as any;if(fn==='retryAt')return 0n as any;
  if(fn==='house')return house as any;
  if(fn==='qualificationEligible'){assert.equal(at,m.catalog);return(args[0]===candidate&&candidateFree) as any;}
  if(fn==='opponentEligible'){assert.equal(at,m.qualifications);assert.equal(args[0],house);return partner as any;}
  throw Error(fn);
 };
 assert.equal((await qualificationWork(read,m,0n,1000n,16,500n)).needed,true);
 assert.equal((await qualificationWork(read,{...m,houseInstances:undefined},0n,1000n,16,500n)).needed,false);
 candidateFree=false;assert.equal((await qualificationWork(read,m,0n,1000n,16,500n)).needed,false);
 candidateFree=true;base=501n;assert.equal((await qualificationWork(read,m,0n,1000n,16,500n)).needed,false);
 base=500n;partner=false;assert.equal((await qualificationWork(read,m,0n,1000n,16,500n)).needed,false);
});
