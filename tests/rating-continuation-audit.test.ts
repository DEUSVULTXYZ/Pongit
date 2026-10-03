import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertReviewedRatingContinuation} from '../shared/rating-continuation-audit';
import {verifyHistoricalRuntime} from '../shared/historical-runtime';
import type {Address,Hex} from 'viem';
const artifact=JSON.parse(readFileSync('contracts/out/ContinuingAgentRatings.sol/ContinuingAgentRatings.json','utf8'));
test('reviewed continuation accepts independently deployed immutable values, with exact runtime comparison',async()=>{
 assertReviewedRatingContinuation(artifact);
 let code=artifact.deployedBytecode.object;
 for(const refs of Object.values(artifact.deployedBytecode.immutableReferences) as {start:number;length:number}[][])
  for(const r of refs)code=code.slice(0,2+r.start*2)+'1'.repeat(r.length*2)+code.slice(2+(r.start+r.length)*2);
 await verifyHistoricalRuntime(('0x'+'2'.repeat(40)) as Address,artifact,async()=>code as Hex,async()=>{throw Error('Unexpected library');});
 await assert.rejects(verifyHistoricalRuntime(('0x'+'2'.repeat(40)) as Address,artifact,async()=>code.replace(/^0x../,'0x00') as Hex,async()=>artifact),/differs/);
});
test('a different artifact or expanded immutable mask cannot establish seed rejection',()=>{
 for(const mutate of [
  (a:any)=>{a.deployedBytecode.object=a.deployedBytecode.object.replace(/^0x../,'0x00');},
  (a:any)=>{a.deployedBytecode.immutableReferences.extra=[{start:0,length:32}];},
  (a:any)=>{a.deployedBytecode.linkReferences.extra={Library:[{start:0,length:20}]};},
 ]){const altered=structuredClone(artifact);mutate(altered);assert.throws(()=>assertReviewedRatingContinuation(altered),/not been reviewed/);}
});
