import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluationReadiness} from '../shared/agent-evaluation-readiness';
const now=100_000;
const ready={app:'0x01',epoch:1n,enabled:true,batches:1n,checkpoint:1n,
  health:{stage:'available',epoch:'1',observedAt:now}};
test('healthy subset works while stopped, unpublished arenas are excluded',()=>{
  const r=evaluationReadiness([ready,{app:'0x02',epoch:1n,enabled:false,batches:0n,checkpoint:0n}],now);
  assert.deepEqual(r,{ready:['0x01'],excluded:['0x02'],qualified:false});
});
test('enabled unpublished arena cannot be skipped by a healthy peer',()=>{
  assert.throws(()=>evaluationReadiness([ready,{...ready,app:'0x02',batches:0n}],now),/published marker/);
});
test('old epoch publication does not prove readiness',()=>{
  assert.throws(()=>evaluationReadiness([{...ready,checkpoint:2n}],now),/published marker/);
});
test('unhealthy, stale, future, or wrong epoch live observations fail',()=>{
  for(const health of [undefined,{...ready.health,stage:'provisioning'},
    {...ready.health,epoch:'2'},{...ready.health,observedAt:now-15_001},
    {...ready.health,observedAt:now+1}]){
    assert.throws(()=>evaluationReadiness([{...ready,health}],now),/live health/);
  }
});
test('all excluded and empty configurations cannot open admissions',()=>{
  assert.throws(()=>evaluationReadiness([{...ready,enabled:false}],now),/No admissible/);
  assert.throws(()=>evaluationReadiness([],now),/No registered/);
});
test('duplicate identities cannot inflate the ready count',()=>{
  assert.throws(()=>evaluationReadiness([ready,ready],now),/Duplicate/);
});
test('initial closed deployment enables only fresh published candidates',()=>{
  assert.deepEqual(evaluationReadiness([{...ready,enabled:false},
    {...ready,app:'0x02',enabled:false,batches:0n},
    {...ready,app:'0x03',enabled:false,health:undefined}],now,true),
    {ready:['0x01'],excluded:['0x02','0x03'],qualified:false});
});
