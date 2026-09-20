import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureSnapshot} from '../scripts/fixture-snapshot';
test('a confirmed receipt is applied once; subsequent resync only reads',async()=>{
 let receiptCalls=0,reads=0;const evidence:string[]=[];
 const result=await fixtureSnapshot(async()=>{receiptCalls++;throw Error('Engine snapshot is behind the applied stream');},async()=>{reads++;if(reads<3)throw Error('Engine reset is not yet consistent');return {revision:42n};},reason=>evidence.push(reason),async()=>{});
 assert.deepEqual(result,{revision:42n});assert.equal(receiptCalls,1);assert.equal(reads,3);assert.equal(evidence.length,3);
});
test('persistent stale reads fail the fixture and unrelated errors are never hidden',async()=>{
 let reads=0;const stale=async()=>{reads++;throw Error('Engine snapshot is behind the applied stream');};
 await assert.rejects(fixtureSnapshot(stale,stale,()=>{},async()=>{}),/behind/);assert.equal(reads,9);
 for(const message of ['RPC unavailable','Arcade session expired','Game command receipt is not confirmed']){
  const error=Error(message);await assert.rejects(fixtureSnapshot(async()=>{throw error;},async()=>{assert.fail('Must not retry a write failure');},()=>{},async()=>{}),e=>e===error);
 }
});
