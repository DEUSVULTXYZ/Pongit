import test from 'node:test';
import assert from 'node:assert/strict';
import {overdueAgentPublication} from '../relayer/src/agents/reusable-recovery';

const app='0x1111111111111111111111111111111111111111' as const;
const d={app,epoch:2n,status:1,lastCommitAt:1000n,maxBatchInterval:3600n};
const ticket={arena:app,epoch:2n,matchId:24n,sequence:2n,issuedAt:950n};
const previous=[2n,1n,'0x1234'] as const;

test('terminal unpublished result can recover only after the actual hub silence deadline',()=>{
 assert.equal(overdueAgentPublication(d,ticket,previous,4599n),false);
 assert.equal(overdueAgentPublication(d,ticket,previous,4600n),false);
 assert.equal(overdueAgentPublication(d,ticket,previous,4601n),true);
});
test('a new reservation after long idle gets its own publication observation window',()=>{
 const fresh={...ticket,issuedAt:10000n};
 assert.equal(overdueAgentPublication(d,fresh,previous,10001n),false);
 assert.equal(overdueAgentPublication(d,fresh,previous,13601n),true);
});
test('already published results await capture instead of force closing a healthy epoch',()=>{
 assert.equal(overdueAgentPublication(d,ticket,[2n,2n,'0xabcd'],100000n),false);
 assert.equal(overdueAgentPublication(d,ticket,[2n,5n,'0xef01'],100000n),false);
});
test('an empty, foreign or old reservation cannot retire this arena',()=>{
 for(const change of [{matchId:0n},{sequence:0n},{issuedAt:0n},{epoch:1n},{arena:'0x2222222222222222222222222222222222222222' as const}])
  assert.throws(()=>overdueAgentPublication(d,{...ticket,...change},previous,100000n),/ticket/);
 assert.throws(()=>overdueAgentPublication(d,ticket,[1n,1n,'0x1234'],100000n),/canonical/);
});
test('challenge, closing and released states never invoke publication-silence closure',()=>{
 for(const status of [0,2,3])assert.equal(overdueAgentPublication({...d,status},ticket,previous,100000n),false);
 assert.equal(overdueAgentPublication({...d,maxBatchInterval:0n},ticket,previous,100000n),false);
});
