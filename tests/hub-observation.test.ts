import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionResult,multicall3Abi,zeroAddress,zeroHash,type Address} from 'viem';
import {roomsLifecycleHubAbi} from '../shared/abi-rooms-lifecycle';
import {hubObservations} from '../shared/hub-observation';
const apps=Array.from({length:8},(_,i)=>`0x${(i+1).toString(16).padStart(40,'0')}` as Address);
function fixture(){
 let now=0,reads=0,headers=0,failed=-1,reorg=false,slow=false,unavailable=false;
 const d:any=Object.fromEntries(roomsLifecycleHubAbi[0].outputs[0].components.map(f=>[f.name,f.type==='address'?zeroAddress:f.type==='bytes32'?zeroHash:/^uint(8|16|32)$/.test(f.type)?0:0n]));
 Object.assign(d,{status:1,epoch:3n,expiresAt:10000n,baseBlock:2n});
 const raw=encodeFunctionResult({abi:roomsLifecycleHubAbi,functionName:'delegationOf',result:d});
 const base:any={getBlock:async()=>{headers++;return{number:20n,hash:zeroHash,timestamp:100n};},request:async(a:any)=>{
  reads++;assert.equal(a.method,'eth_call');assert.deepEqual(a.params[1],{blockHash:zeroHash,requireCanonical:true});
  const call=decodeFunctionData({abi:multicall3Abi,data:a.params[0].data});assert.equal(call.functionName,'aggregate3');assert.equal((call.args[0] as readonly unknown[]).length,8);
  if(reorg)throw Error('Requested hash is no longer a canonical block');
  if(unavailable)throw Error('network');if(slow)now+=3001;
  return encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result:apps.map((_,i)=>({success:i!==failed,returnData:i===failed?'0x':raw}))});
 }};
 const cache=hubObservations(base,zeroAddress,apps,()=>now);
 return{cache,counts:()=>({reads,headers}),time:(t:number)=>now=t,fail:(i:number)=>failed=i,reorg:()=>reorg=true,slow:()=>slow=true,unavailable:()=>unavailable=true};
}
test('eight arenas and concurrent command fences share two canonical RPC reads',async()=>{
 const f=fixture();const results=await Promise.all([...apps,...apps].map(a=>f.cache.read(a)));
 assert(results.every(r=>r.delegation.epoch===3n&&r.observedAt===0));assert.deepEqual(f.counts(),{reads:1,headers:1});
 f.time(1400);await f.cache.read(apps[0]);assert.equal(f.counts().reads,1);
 f.time(1600);await f.cache.read(apps[0]);await new Promise(r=>setImmediate(r));assert.equal(f.counts().reads,2);
});
test('one invalid arena does not block the other seven',async()=>{
 const f=fixture();f.fail(3);await assert.rejects(f.cache.read(apps[3]),/observation failed/);
 assert.equal((await f.cache.read(apps[7])).delegation.epoch,3n);
});
test('reorganized and already-stale observations cannot authorize commands',async()=>{
 const f=fixture();f.reorg();await assert.rejects(f.cache.read(apps[0]),/canonical block/);
 const g=fixture();g.slow();await assert.rejects(g.cache.read(apps[0]),/stale/);
});
test('failed refresh never extends the original valid window',async()=>{
 const f=fixture();await f.cache.read(apps[0]);f.unavailable();f.time(1600);
 assert.equal((await f.cache.read(apps[0])).observedAt,0);await new Promise(r=>setImmediate(r));
 f.time(3001);await assert.rejects(f.cache.read(apps[0]),/network/);
});

test('command fences await the shared renewal instead of using its nearly expired predecessor',async()=>{
 const f=fixture();await f.cache.read(apps[0]);f.time(1600);
 const values=await Promise.all(apps.map(app=>f.cache.read(app,true)));
 assert(values.every(v=>v.observedAt===1600));assert.deepEqual(f.counts(),{reads:2,headers:2});
 f.time(2999);assert.equal((await f.cache.read(apps[0],true)).observedAt,1600);
 assert.equal(f.counts().reads,2,'no extra refresh before the next half-window');
 f.unavailable();f.time(3200);await assert.rejects(f.cache.read(apps[0],true),/network/);
 assert.equal((await f.cache.read(apps[0])).observedAt,1600,'ordinary observations retain their original validity');
 f.time(4601);await assert.rejects(f.cache.read(apps[0]),/network/);
});
