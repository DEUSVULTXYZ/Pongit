import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureSnapshot} from '../scripts/fixture-snapshot';
test('a confirmed receipt is applied once; subsequent resync only reads',async()=>{
 let receiptCalls=0,reads=0;const evidence:string[]=[];
 const result=await fixtureSnapshot(async()=>{receiptCalls++;throw Error('Engine snapshot is behind the applied stream');},async()=>{reads++;if(reads<3)throw Error('Engine reset is not yet consistent');return {revision:42n};},reason=>evidence.push(reason),async()=>{});
 assert.deepEqual(result,{revision:42n});assert.equal(receiptCalls,1);assert.equal(reads,3);assert.equal(evidence.length,3);
});

test('read-only timeout and Retry-After recovery is bounded and records every interruption',async()=>{
 let applied=0,reads=0;const evidence:string[]=[],delays:number[]=[];
 const timeout=Object.assign(Error('request timeout'),{name:'TimeoutError'});
 const result=await fixtureSnapshot(async()=>{applied++;throw timeout;},async()=>{reads++;if(reads===1)throw {status:429,headers:{'retry-after':'3'}};return 7;},reason=>evidence.push(reason),async ms=>{delays.push(ms);});
 assert.equal(result,7);assert.equal(applied,1);assert.equal(reads,2);assert.deepEqual(delays,[1000,3000]);
 assert.deepEqual(evidence,['RPC timeout (read only)','RPC rate limit (read only)']);
 let repeated=0;await assert.rejects(fixtureSnapshot(async()=>{throw timeout;},async()=>{repeated++;throw timeout;},()=>{},async()=>{}));assert.equal(repeated,8);
 let waited=false;await assert.rejects(fixtureSnapshot(async()=>{throw {status:429,headers:{'retry-after':'120'}};},async()=>{assert.fail('Must not read before Retry-After');},()=>{},async()=>{waited=true;}));assert.equal(waited,false);
});
test('persistent stale reads fail the fixture and unrelated errors are never hidden',async()=>{
 let reads=0;const stale=async()=>{reads++;throw Error('Engine snapshot is behind the applied stream');};
 await assert.rejects(fixtureSnapshot(stale,stale,()=>{},async()=>{}),/behind/);assert.equal(reads,9);
 for(const message of ['RPC unavailable','Arcade session expired','Game command receipt is not confirmed']){
  const error=Error(message);await assert.rejects(fixtureSnapshot(async()=>{throw error;},async()=>{assert.fail('Must not retry a write failure');},()=>{},async()=>{}),e=>e===error);
 }
});
