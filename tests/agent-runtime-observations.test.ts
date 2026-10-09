import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionResult,multicall3Abi,zeroAddress,zeroHash,type Address} from 'viem';
import {agentRuntimeObservations} from '../shared/agent-runtime-observations';
import {agentAssignments} from '../shared/agent-assignments';
import {hubObservations} from '../shared/hub-observation';
import {reusableAgentPoolAbi} from '../shared/abi-ReusableAgentPool';
import {roomsLifecycleHubAbi} from '../shared/abi-rooms-lifecycle';
const apps=Array.from({length:7},(_,i)=>`0x${(i+1).toString(16).padStart(40,'0')}` as Address);
const pool='0x1111111111111111111111111111111111111111',hub='0x2222222222222222222222222222222222222222';
function fixture(){
 let now=0,headers=0,reads=0,failArena=-1,failLane=false,reorg=false,age=0,slow=false,finish!:()=>void;
 const d:any=Object.fromEntries(roomsLifecycleHubAbi[0].outputs[0].components.map(f=>[f.name,f.type==='address'?zeroAddress:f.type==='bytes32'?zeroHash:/^uint(8|16|32)$/.test(f.type)?0:0n]));
 Object.assign(d,{status:1,epoch:3n,expiresAt:10000n,baseBlock:2n});
 const base:any={getBlock:async()=>{headers++;return{number:20n,hash:zeroHash,timestamp:100n};},request:async(a:any)=>{
  reads++;assert.equal(a.method,'eth_call');assert.deepEqual(a.params[1],{blockHash:zeroHash,requireCanonical:true});
  if(slow)await new Promise<void>(r=>finish=r);
  if(reorg)throw Error('Requested block is no longer canonical');now+=age;
  const decoded=decodeFunctionData({abi:multicall3Abi,data:a.params[0].data});
  assert.equal(decoded.functionName,'aggregate3');
  if(decoded.functionName!=='aggregate3')throw Error('Expected canonical batch');
  const calls=decoded.args[0];
  return encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result:calls.map(c=>{
   if(c.target.toLowerCase()===pool){
    const index=decodeFunctionData({abi:reusableAgentPoolAbi,data:c.callData}).args![0];
    if(failLane&&index===2)return{success:false,returnData:'0x' as const};
    const value={ref:{chainId:10143n,arena:apps[Number(index)],epoch:3n,id:BigInt(Number(index)+1)},a:zeroAddress,b:zeroAddress,tournament:0n,fixture:0,lane:Number(index),ranked:false,captured:false};
    return{success:true,returnData:encodeFunctionResult({abi:reusableAgentPoolAbi,functionName:'laneRecord',result:value})};
   }
   assert.equal(c.target.toLowerCase(),hub);
   const app=decodeFunctionData({abi:roomsLifecycleHubAbi,data:c.callData}).args![0];
   if(apps.findIndex(x=>x.toLowerCase()===String(app).toLowerCase())===failArena)return{success:false,returnData:'0x' as const};
   return{success:true,returnData:encodeFunctionResult({abi:roomsLifecycleHubAbi,functionName:'delegationOf',result:d})};
  })});
 }};
 return{base,now:()=>now,time:(t:number)=>now=t,counts:()=>({headers,reads}),fail:(i:number)=>failArena=i,
  laneFail:()=>failLane=true,reorg:()=>reorg=true,age:(n:number)=>age=n,slow:()=>slow=true,finish:()=>{slow=false;finish();}};
}
test('planning and seven lifecycle fences use two RPCs instead of four at the same canonical block',async()=>{
 const before=fixture(),planning=agentAssignments(before.base,pool,5,before.now),fences=hubObservations(before.base,hub,apps,before.now);
 const old=await Promise.all([planning.read(),...apps.map(a=>fences.read(a,true))]);
 assert.deepEqual(before.counts(),{headers:2,reads:2});
 const f=fixture(),v=agentRuntimeObservations(f.base,pool,hub,apps,5,f.now);
 const actual=await Promise.all([v.assignments.read(),...apps.map(a=>v.hub.read(a,true))]);
 assert.deepEqual(actual,old);assert.deepEqual(f.counts(),{headers:1,reads:1});
});
test('a failed arena subcall does not poison assignments or the other six arenas',async()=>{
 const f=fixture();f.fail(2);const v=agentRuntimeObservations(f.base,pool,hub,apps,5,f.now);
 assert.equal((await v.assignments.read()).lanes.length,5);
 await assert.rejects(v.hub.read(apps[2],true),/observation failed/);
 assert.equal((await v.hub.read(apps[6],true)).delegation.epoch,3n);
 f.laneFail();f.time(3001);await v.hub.read(apps[6],true);
 await assert.rejects(v.assignments.read(),/Incomplete arena assignments/);
});

test('a completed contradictory refresh replaces a still-valid command observation immediately',async()=>{
 const f=fixture(),v=agentRuntimeObservations(f.base,pool,hub,apps,5,f.now);
 await v.hub.read(apps[0],true);f.fail(0);f.time(500);
 assert.equal((await v.hub.read(apps[0],true)).observedAt,0);
 await new Promise(r=>setImmediate(r));
 await assert.rejects(v.hub.read(apps[0],true),/observation failed/);
 assert.equal((await v.hub.read(apps[1],true)).observedAt,500);
});
test('unexpired commands do not wait for refresh; expired commands await the same canonical fence',async()=>{
 const f=fixture(),v=agentRuntimeObservations(f.base,pool,hub,apps,5,f.now);
 await v.assignments.read();f.time(500);f.slow();await v.assignments.read();
 await new Promise(r=>setImmediate(r));f.time(1600);
 await v.assignments.read();
 assert((await Promise.all(apps.map(a=>v.hub.read(a,true)))).every(r=>r.observedAt===0),'The original validity deadline is never extended');
 f.time(3001);let done=false;
 const commands=Promise.all(apps.map(a=>v.hub.read(a,true))).then(x=>{done=true;return x;});
 await new Promise(r=>setImmediate(r));assert(!done);assert.deepEqual(f.counts(),{headers:2,reads:2});
 f.finish();assert((await commands).every(r=>r.observedAt===500),'Validity starts before the RPC latency');
});
test('reorgs and late successes cannot authorize a stale lifecycle',async()=>{
 const f=fixture();f.age(3001);const v=agentRuntimeObservations(f.base,pool,hub,apps,5,f.now);
 await assert.rejects(v.hub.read(apps[0],true),/stale/);
 const g=fixture(),w=agentRuntimeObservations(g.base,pool,hub,apps,5,g.now);
 await w.hub.read(apps[0]);g.time(500);g.reorg();await w.assignments.read();await new Promise(r=>setImmediate(r));
 assert.equal((await w.hub.read(apps[0])).observedAt,0);
 g.time(3001);await assert.rejects(w.hub.read(apps[0],true),/canonical/);
});
test('unregistered and duplicate arenas are rejected without an RPC',async()=>{
 const f=fixture();assert.throws(()=>agentRuntimeObservations(f.base,pool,hub,[apps[0],apps[0]],5),/Duplicate/);
 const v=agentRuntimeObservations(f.base,pool,hub,apps,5,f.now);
 await assert.rejects(v.hub.read(zeroAddress,true),/outside/);assert.deepEqual(f.counts(),{headers:0,reads:0});
});
