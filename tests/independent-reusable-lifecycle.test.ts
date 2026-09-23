import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,encodeFunctionResult,toHex,zeroAddress,zeroHash,type Address,type Hex} from 'viem';
import {independentReusableLifecycle} from '../relayer/src/independent-reusable-lifecycle';
import {roomsLifecycleHubAbi} from '../shared/abi-rooms-lifecycle';
import {reusableAdmissionDigest} from '../shared/reusable-admission';
import {EMPTY_RESULT_ROOT} from '../shared/published-result-tree';
const at=(n:number)=>toHex(n,{size:20}) as Address;
function fixture(){
 const app=at(1),m:any={rulesVersion:14,arenas:[{app}],resultVerifier:at(2),hub:at(3),lobby:at(4),ratings:at(5)};
 const ticket={authority:m.lobby,arena:app,epoch:2n,sequence:1n,matchId:91n,bindingHash:toHex(2,{size:32}),issuedAt:900n,expires:1020n,sourceBlock:3n,sourceHash:toHex(3,{size:32}),rules:14n};
 const fields=roomsLifecycleHubAbi.find(x=>x.name==='delegationOf')!.outputs[0].components;
 const d:any=Object.fromEntries(fields.map(f=>[f.name,f.type==='address'?zeroAddress:f.type==='bytes32'?zeroHash:/^uint(8|16|32)$/.test(f.type)?0:0n]));
 Object.assign(d,{app,status:1,epoch:2n,baseBlock:3n,expiresAt:10000n,maxBatchInterval:3600n,lastCommitAt:900n,batchIndex:5n,stakeUnlockAt:1100n});
 let now=1000n,reserved=91n,slot=[2n,91n],phase=2n,current=[2n,91n,1n,reusableAdmissionDigest(ticket)],known=1n,sealed:Hex=zeroHash;
 let ref={id:0n,epoch:0n},livePhase=2,failedRead=false;
 let hostedCommitment:any=[2n,0,EMPTY_RESULT_ROOT],publishedCommitment:any=[2n,0,EMPTY_RESULT_ROOT];
 const jobs:any[]=[],events:string[]=[],session={chainId:4242,app,epoch:2,baseBlock:3};
 const health={id:'0',epoch:'0',expiresAt:0,releaseAt:0,online:false,lastProgressAt:0};
 const base:any={getBlock:async()=>({number:20n,timestamp:now}),request:async()=>encodeFunctionResult({abi:roomsLifecycleHubAbi,functionName:'delegationOf',result:d}),readContract:async(c:any)=>{
  encodeFunctionData({abi:c.abi,functionName:c.functionName,args:c.args});assert.equal(c.blockNumber,20n);
  switch(c.functionName){case 'reservedMatch':return reserved;case 'currentMatch':return slot;case 'finalizedRoots':return[sealed,1];
   case 'resultCommitment':return publishedCommitment;case 'getSnapshot':return{phase};case 'ticketOf':return[ticket,{}];case 'indexOf':return known;default:throw Error('Unexpected read '+c.functionName);}
 }};
 const engine:any={app,bind:(id:bigint,epoch:bigint)=>{const changed=id!==ref.id||epoch!==ref.epoch;ref={id,epoch};return changed;},
  restoreHealth:async()=>{},retire:async(epoch:bigint)=>events.push('retire:'+epoch),status:async()=>session,
  retireOlder:async()=>{},
  reconcile:async()=>events.push('reconcile'),read:async()=>{if(failedRead)throw Error('node unavailable');return{id:ref.id,phase:livePhase};},
  feed:{progressAge:()=>50},publicationFailure:()=>0,
  node:{readContract:async(c:any)=>{encodeFunctionData({abi:c.abi,functionName:c.functionName,args:c.args});if(c.functionName==='resultCommitment')return hostedCommitment;assert.equal(c.functionName,'currentAdmission');return current;}}};
 const results:any={capture:async(id:bigint)=>{events.push('capture:'+id);return true;},archiveSlot:async()=>{events.push('archive');return true;}};
 const worker=independentReusableLifecycle({base,manifest:m,engine,health,results,
  queue:async(at,abi,name,args)=>{encodeFunctionData({abi,functionName:name,args});jobs.push({at,name,args});},
  stage:async(name,code)=>{events.push('stage:'+name+(code?':'+code:''));},admit:async()=>{events.push('admit');},
  ensureHosted:async epoch=>{events.push('hosted:'+epoch);}});
 return{worker,health,d,events,jobs,session,results,base,engine,ticket,reference:()=>ref,
  change:(o:{now?:bigint;reserved?:bigint;phase?:bigint;livePhase?:number;sealed?:Hex;current?:any;known?:bigint;failedRead?:boolean;slot?:bigint[];hostedCommitment?:any;publishedCommitment?:any})=>{
   now=o.now??now;reserved=o.reserved??reserved;phase=o.phase??phase;livePhase=o.livePhase??livePhase;sealed=o.sealed??sealed;current=o.current??current;known=o.known??known;failedRead=o.failedRead??failedRead;
   slot=o.slot??slot;hostedCommitment=o.hostedCommitment??hostedCommitment;publishedCommitment=o.publishedCommitment??publishedCommitment;
  }};
}

test('a published human result leaves the same delegation open for its next issued match',async()=>{
 const f=fixture();f.change({livePhase:3});await f.worker.observe();
 assert(f.events.indexOf('archive')<f.events.indexOf('capture:91'));assert.equal(f.jobs.length,0);assert.equal(f.health.online,true);
 f.events.length=0;f.change({reserved:0n});await f.worker.observe();
 assert(f.events.includes('stage:available'));assert.equal(f.jobs.length,0);assert.equal(f.health.id,'0');
});

test('routine in-flight observation preserves verified availability but a failed read clears it',async()=>{
 const f=fixture();await f.worker.observe();assert.equal(f.health.online,true);
 const getBlock=f.base.getBlock;
 let resume!:()=>void;f.base.getBlock=async()=>{await new Promise<void>(r=>resume=r);return getBlock();};
 const pending=f.worker.observe();assert.equal(f.health.online,true);resume();await pending;
 assert.equal(f.health.online,true);
 f.base.getBlock=async()=>{throw Error('RPC unavailable');};
 await assert.rejects(f.worker.observe(),/RPC unavailable/);assert.equal(f.health.online,false);
 f.base.getBlock=getBlock;await f.worker.observe();assert.equal(f.health.online,true);
 f.change({failedRead:true});await assert.rejects(f.worker.observe(),/node unavailable/);assert.equal(f.health.online,false);
});

test('a different match binding becomes unavailable before asynchronous recovery',async()=>{
 const f=fixture();await f.worker.observe();assert.equal(f.health.online,true);
 f.change({reserved:92n});let resume!:()=>void;
 const restoring=new Promise<void>(resolve=>{f.engine.restoreHealth=async()=>{resolve();await new Promise<void>(r=>resume=r);};});
 const pending=f.worker.observe();await restoring;assert.equal(f.health.online,false);
 resume();await pending;assert.equal(f.health.online,true);
 f.d.status=2;await f.worker.observe();assert.equal(f.health.online,false);
});

test('a fresh or renewed empty arena uses the verified commitment epoch before its first admission',async()=>{
 for(const epoch of [1n,3n]){
  const f=fixture();f.d.epoch=epoch;f.session.epoch=Number(epoch);
  f.change({reserved:0n,slot:[0n,0n],current:[0n,0n,0n,zeroHash],
   hostedCommitment:[epoch,0,EMPTY_RESULT_ROOT],publishedCommitment:[epoch,0,EMPTY_RESULT_ROOT]});
  await f.worker.observe();assert.equal(f.health.online,true);assert(f.events.includes('stage:available'));
  assert.equal(f.health.epoch,String(epoch));assert.equal(f.jobs.length,0);
 }
});

test('empty admission cannot conceal stale epochs, uncleared slots or unpublished results',async()=>{
 for(const change of [
  {current:[1n,0n,0n,zeroHash]}, {current:[0n,91n,0n,zeroHash]},
  {current:[0n,0n,1n,zeroHash]}, {current:[0n,0n,0n,toHex(1,{size:32})]},
  {slot:[1n,91n]}, {hostedCommitment:[1n,0,EMPTY_RESULT_ROOT]},
  {publishedCommitment:[1n,0,EMPTY_RESULT_ROOT]}, {hostedCommitment:[2n,1,EMPTY_RESULT_ROOT]},
  {publishedCommitment:[2n,1,EMPTY_RESULT_ROOT]}, {hostedCommitment:[2n,0,zeroHash]},
  {publishedCommitment:[2n,0,zeroHash]},
 ]){
  const f=fixture();f.change({reserved:0n,slot:[0n,0n],current:[0n,0n,0n,zeroHash],...change});
  await assert.rejects(f.worker.observe(),/epoch changed|commitment/);
  assert.equal(f.health.online,false);assert(!f.events.includes('stage:available'));assert.equal(f.jobs.length,0);
 }
});

test('an expired delegation still reconciles and closes independently from new admissions',async()=>{
 const f=fixture();f.change({now:10001n});await f.worker.observe();
 assert(f.events.includes('reconcile'));assert.equal(f.health.online,false);assert.equal(f.jobs[0].name,'closeReusableArena');
 assert(!f.events.includes('admit'));assert(!f.events.includes('retire:2'));
});

test('closing respects the actual release deadline and retains unpublished participation',async()=>{
 const f=fixture();f.d.status=2;await f.worker.observe();assert.equal(f.jobs.length,0);assert(f.events.includes('capture:91'));
 f.change({now:1100n});await f.worker.observe();assert.equal(f.jobs[0].name,'releaseStake');
 assert(!f.events.includes('retire:2'));assert.deepEqual(f.reference(),{id:91n,epoch:2n});
});

test('released roots are sealed before recovery or reuse, with no engine availability prerequisite',async()=>{
 const f=fixture();f.d.status=0;f.change({failedRead:true});await f.worker.observe();assert.equal(f.jobs[0].name,'sealReleased');
 assert(f.events.includes('retire:2'));f.change({sealed:toHex(1,{size:32})});await f.worker.observe();assert(f.events.includes('capture:91'));
 f.change({reserved:0n,phase:2n});await f.worker.observe();assert.equal(f.jobs.at(-1).name,'recoverReleased');
 f.change({phase:4n});await f.worker.observe();assert(f.events.includes('stage:released'));assert.deepEqual(f.reference(),{id:0n,epoch:0n});
});

test('a readable but wrong hosted epoch or base never enables the match',async()=>{
 const f=fixture();f.session.baseBlock=2;await assert.rejects(f.worker.observe(),/mismatch/);
 assert.equal(f.health.online,false);assert(!f.events.includes('admit'));assert(f.events.includes('hosted:2'));
});

test('an unissued physical match cannot look like available capacity',async()=>{
 const f=fixture();f.change({reserved:0n,known:0n});await f.worker.observe();
 assert.equal(f.health.online,false);assert(f.events.includes('stage:review:UNRESOLVED_ENGINE_ADMISSION'));assert.equal(f.jobs.length,0);
});

test('a challenged result cannot release, renew or admit a player',async()=>{
 const f=fixture();f.d.status=3;await f.worker.observe();assert.equal(f.jobs.length,0);assert.equal(f.health.online,false);
 assert(!f.events.includes('capture:91'));assert(!f.events.includes('admit'));
});

test('publication silence uses the real hub deadline, not an ordinary RPC failure',async()=>{
 const f=fixture();f.change({failedRead:true});await assert.rejects(f.worker.observe(),/unavailable/);assert.equal(f.jobs.length,0);
 f.change({now:4501n});await f.worker.observe();assert.equal(f.jobs[0].name,'forceClose');assert(!f.events.includes('retire:2'));
});

test('an idle fully published arena survives the publication silence window',async()=>{
 for(const empty of [false,true]){
  const f=fixture();f.change({now:4501n,reserved:0n,...(empty?{slot:[0n,0n],current:[0n,0n,0n,zeroHash]}:{})});
  await f.worker.observe();assert.equal(f.jobs.length,0);assert.equal(f.health.online,true);
  assert(f.events.includes('stage:available'));
 }
});

test('a newly issued ticket after idle has time to publish without ignoring an actual stalled match',async()=>{
 const f=fixture();f.ticket.issuedAt=4490n;f.change({now:4501n});
 await f.worker.observe();assert.equal(f.jobs.length,0);assert(f.events.includes('admit'));
 f.change({now:8091n});await f.worker.observe();assert.equal(f.jobs[0].name,'forceClose');
});

test('idle uncommitted changes still require recovery after the real deadline',async()=>{
 const f=fixture();f.change({now:4501n,reserved:0n,hostedCommitment:[2n,1,toHex(5,{size:32})]});
 await f.worker.observe();assert.equal(f.jobs[0].name,'forceClose');assert.equal(f.health.online,false);
});

test('a failed idle read is not evidence of an unpublished result',async()=>{
 const f=fixture();f.change({now:4501n,reserved:0n});f.engine.node.readContract=async()=>{throw Error('RPC unavailable');};
 await assert.rejects(f.worker.observe(),/RPC unavailable/);assert.equal(f.jobs.length,0);assert.equal(f.health.online,false);
});

test('an epoch released without a single match is still sealed so its arena can reopen',async()=>{
 const f=fixture();
 // The delegation expired before anyone played: no current match, yet the
 // arena committed an empty result root that openEngine requires sealed.
 f.d.status=0;f.change({reserved:0n,slot:[0n,0n],publishedCommitment:[4n,0,EMPTY_RESULT_ROOT],sealed:zeroHash});
 await f.worker.observe();
 assert.deepEqual(f.jobs.map(j=>j.name),['sealReleased'],'seal the empty epoch before it is offered for reopening');
 assert(f.events.includes('stage:sealing'));assert(!f.events.includes('stage:released'));
 f.jobs.length=0;f.events.length=0;f.change({sealed:toHex(9,{size:32})});
 await f.worker.observe();
 assert.equal(f.jobs.length,0);assert(f.events.includes('stage:released'),'once sealed it is released to the reserve opener as before');
});
