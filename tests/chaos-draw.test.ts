import assert from 'node:assert/strict';
import {test} from 'node:test';
import {toHex,keccak256} from 'viem';
import {chaosDrawCommitment,deriveChaosDraw,drandRoundAfter,type ChaosDrawRequest} from '../shared/chaos-draw';
import {chaosEvents,chaosEvent,chaosCollisionId} from '../shared/chaos-events';
const request=():ChaosDrawRequest=>({app:'0x0000000000000000000000000000000000001234',epoch:1n,matchId:99n,index:0,round:20595447n,excluded:0});
test('candidate catalogue preserves all 24 events and their weights',()=>{
 assert.equal(chaosEvents.length,24);assert.equal(new Set(chaosEvents.map(e=>e.key)).size,24);
 assert.equal(chaosEvents.reduce((n,e)=>n+e.weight,0),84);
 for(let i=1;i<=24;i++)assert.equal(chaosEvent(i).id,i);
 assert.throws(()=>chaosEvent(25));assert.throws(()=>chaosEvent(0));
 assert.match(chaosEvent(22).description,/not multiplied/);
});
test('all 276 active pairs are excluded from draw selection (not a physics test)',()=>{
 let pairs=0;
 for(let a=1;a<=24;a++)for(let b=a+1;b<=24;b++){
  const r={...request(),excluded:(1<<(a-1))|(1<<(b-1))};
  const d=deriveChaosDraw(r,chaosDrawCommitment(r),keccak256(toHex(`${a}:${b}`)));
  assert.notEqual(d.eventId,a);assert.notEqual(d.eventId,b);assert(d.target===0||d.target===1);
  assert(d.intervalMs>=8000&&d.intervalMs<=12000);assert.equal(d.intervalMs%10,0);pairs++;
 }
 assert.equal(pairs,276);
});
test('all draw context fields are committed before revelation',()=>{
 const r=request(),c=chaosDrawCommitment(r),random=toHex(42n,{size:32});
 for(const change of [{epoch:2n},{matchId:100n},{index:1},{round:r.round+1n},{excluded:1},{app:'0x0000000000000000000000000000000000005678' as const}])
  assert.throws(()=>deriveChaosDraw({...r,...change},c,random));
 assert.deepEqual(deriveChaosDraw(r,c,random),deriveChaosDraw(r,c,random));
});
test('future round calculation never selects a round at or before commitment time',()=>{
 assert.equal(drandRoundAfter(1727521074n),1n);assert.equal(drandRoundAfter(1727521075n),2n);
 assert.equal(drandRoundAfter(1727521077n),2n);assert.equal(drandRoundAfter(1727521078n),3n);
});
test('collision identity separates deployments, epochs, rallies and balls',()=>{
 const c={arena:request().app,epoch:'1',matchId:'99',rally:4,sequence:3,ballId:1,kind:'paddle' as const,x:0n,y:0n};
 assert.notEqual(chaosCollisionId(c),chaosCollisionId({...c,ballId:2}));
 assert.notEqual(chaosCollisionId(c),chaosCollisionId({...c,rally:5}));
 assert.notEqual(chaosCollisionId(c),chaosCollisionId({...c,epoch:'2'}));
});
