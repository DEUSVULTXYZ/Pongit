import test from 'node:test';
import assert from 'node:assert/strict';
import {toHex} from 'viem';
import {validateReusableBudget,reusableAdmissionBudget} from '../relayer/src/agents/reusable-budget';
test('missing or foreign worst-case evidence cannot open reusable admissions',()=>{
 const runtime=toHex(1,{size:32}),b={rulesVersion:15,maxBatches:100,matchReserveBatches:20,rotationLeadSeconds:420,serviceSeconds:7200,evidence:toHex(2,{size:32}),runtimeHashes:[runtime]};
 const valid=validateReusableBudget(b,[runtime]);
 assert.equal(reusableAdmissionBudget(valid,79n,1000n,500n),true);
 assert.equal(reusableAdmissionBudget(valid,80n,1000n,500n),false);
 assert.equal(reusableAdmissionBudget(valid,1n,920n,500n),false);
 assert.equal(reusableAdmissionBudget(undefined,1n,1000n,500n),false);
 for(const mutation of [{rulesVersion:11},{maxBatches:20},{matchReserveBatches:0},{rotationLeadSeconds:419},{serviceSeconds:420},{evidence:toHex(0,{size:32})},{runtimeHashes:[]}])
  assert.throws(()=>validateReusableBudget({...b,...mutation},[runtime]));
});

test('a human match reserves its full thirty-minute duration rather than the agent limit',()=>{
 const runtime=toHex(1,{size:32}),b={rulesVersion:14,maxBatches:50000,matchReserveBatches:20000,rotationLeadSeconds:1860,serviceSeconds:7200,evidence:toHex(2,{size:32}),runtimeHashes:[runtime]};
 const valid=validateReusableBudget(b,[runtime],14);
 assert.equal(reusableAdmissionBudget(valid,1n,2860n,1000n),false);
 assert.equal(reusableAdmissionBudget(valid,1n,2861n,1000n),true);
 assert.throws(()=>validateReusableBudget({...b,rotationLeadSeconds:420},[runtime],14));
 assert.throws(()=>validateReusableBudget(b,[runtime]));
 assert.throws(()=>validateReusableBudget(b,[],14));
});
