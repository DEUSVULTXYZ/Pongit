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
