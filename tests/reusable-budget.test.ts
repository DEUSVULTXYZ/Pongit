import test from 'node:test';
import assert from 'node:assert/strict';
import {toHex} from 'viem';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {validateReusableBudget,reusableAdmissionBudget,reusableCapacity,type ReusablePublicationBudget} from '../relayer/src/agents/reusable-budget';
test('a no-lease epoch still needs measured publication reserve',()=>{
 const b:ReusablePublicationBudget={rulesVersion:15,maxBatches:100,matchReserveBatches:20,rotationLeadSeconds:420,serviceSeconds:7200,evidence:toHex(2,{size:32}),runtimeHashes:[toHex(1,{size:32})]};
 assert(reusableAdmissionBudget(b,79n,0n,500n,NO_LEASE_HUB));
 for(const hub of [undefined,toHex(5,{size:20})])assert(!reusableAdmissionBudget(b,79n,0n,500n,hub));
 assert(!reusableAdmissionBudget(b,80n,0n,500n,NO_LEASE_HUB));
 assert(!reusableAdmissionBudget(undefined,0n,0n,500n,NO_LEASE_HUB));
 assert(!reusableAdmissionBudget(b,0n,920n,500n,NO_LEASE_HUB));
 const arenas=[{app:'a',batches:79n,expires:0n,occupied:false,serving:true}];
 assert.deepEqual(reusableCapacity(b,arenas,500n,NO_LEASE_HUB).ready,['a']);
 arenas[0].serving=false;assert.deepEqual(reusableCapacity(b,arenas,500n,NO_LEASE_HUB).ready,[]);
});
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

test('hub Active status cannot hide unusable or exhausted reserve arenas',()=>{
 const b:ReusablePublicationBudget={rulesVersion:15,maxBatches:2000,matchReserveBatches:800,rotationLeadSeconds:420,serviceSeconds:7200,evidence:toHex(2,{size:32}),runtimeHashes:[toHex(1,{size:32})]};
 const arenas=Array.from({length:6},(_,i)=>({app:String(i),batches:1200n,expires:100000n,occupied:false,serving:true}));
 let state=reusableCapacity(b,arenas,1000n);
 assert.equal(state.ready.length,0,'Six Active delegations are not six admission slots');
 assert.deepEqual(state.exhausted,['0','1','2','3','4','5']);
 arenas[0].occupied=true;
 state=reusableCapacity(b,arenas,1000n);
 assert.deepEqual(state.ready,['0']);assert(!state.exhausted.includes('0'),'A running match must never be retired');
 arenas[1].batches=1199n;arenas[2].batches=0n;arenas[2].serving=false;
 state=reusableCapacity(b,arenas,1000n);
 assert.deepEqual(state.ready,['0','1']);assert(!state.exhausted.includes('2'),'Unavailable health alone does not prove exhaustion');
 arenas[1].expires=1420n;
 state=reusableCapacity(b,arenas,1000n);
 assert.deepEqual(state.ready,['0']);assert(state.exhausted.includes('1'),'The full final-match time reserve must fit');
 for(const arena of arenas){arena.occupied=false;arena.batches=0n;arena.expires=100000n;arena.serving=false;}
 assert.equal(reusableCapacity(b,arenas,1000n).ready.length,0,'Six unavailable engines must not suppress opening an already released spare');
 arenas[0].serving=true;
 assert.equal(reusableCapacity(b,arenas,1000n).ready.length,1);
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
