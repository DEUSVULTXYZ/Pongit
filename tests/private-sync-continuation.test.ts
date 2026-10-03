import test from 'node:test';
import assert from 'node:assert/strict';
import {privateSyncContinuation,privateSyncQualification,privateSyncCompleted,PRIVATE_SYNC_PREDECESSOR} from '../scripts/private-sync-continuation';
function record(){return {prefix:'reusable-agents-20261002-2',continuation:{pool:PRIVATE_SYNC_PREDECESSOR},source:{manifest:{pool:PRIVATE_SYNC_PREDECESSOR}},migrationPhase:'imported-closed',rulesVersion:16,friendlyPause:'heartbeat-v1',maxMatches:5,common:{pool:'0x1234567890123456789012345678901234567890'}};}
test('private continuation requires its exact source, namespace and completed import',()=>{
 assert.equal(privateSyncContinuation({},undefined),false);
 assert.equal(privateSyncContinuation(record(),'private-sync-20261002'),true);
 assert.throws(()=>privateSyncContinuation(record(),undefined));
 for(const patch of [{prefix:'public'},{rulesVersion:15},{migrationPhase:'prepared-unimported'},{continuation:{pool:'0x205d5739136d6cb73d732e1146e1ce034798a613'}},{source:{manifest:{pool:'0x205d5739136d6cb73d732e1146e1ce034798a613'}}},{common:{pool:PRIVATE_SYNC_PREDECESSOR}}])
  assert.throws(()=>privateSyncContinuation({...record(),...patch},'private-sync-20261002'));
 assert.throws(()=>privateSyncContinuation(record(),'true'));
});
test('second private continuation preserves its explicit source and cannot accept the first namespace or public source',()=>{
 const expected=privateSyncQualification('private-sync-20261003');
 const next={...record(),prefix:expected.prefix,continuation:{pool:expected.pool},source:{manifest:{pool:expected.pool}}};
 assert.equal(expected.results,110n);assert.equal(expected.tournaments,4n);
 assert.equal(privateSyncContinuation(next,'private-sync-20261003'),true);
 assert.throws(()=>privateSyncContinuation(record(),'private-sync-20261003'));
 assert.throws(()=>privateSyncContinuation(next,'private-sync-20261002'));
 assert.throws(()=>privateSyncQualification('public'));
 for(const field of ['continuation','source']){
  const wrong=field==='continuation'?{pool:'0x205d5739136d6cb73d732e1146e1ce034798a613'}:{manifest:{pool:'0x205d5739136d6cb73d732e1146e1ce034798a613'}};
  assert.throws(()=>privateSyncContinuation({...next,[field]:wrong},'private-sync-20261003'));
 }
});

test('queue candidate imports the completed optimized source and keeps earlier trial ranges fixed',()=>{
 const scope='private-sync-queue-20261003',expected=privateSyncQualification(scope);
 assert.equal(expected.results,168n);assert.equal(expected.tournaments,7n);assert.equal(expected.lastTournament,11n);
 assert.equal(expected.requests,43n);
 const next={...record(),prefix:expected.prefix,continuation:{pool:expected.pool},source:{manifest:{pool:expected.pool}}};
 assert(privateSyncContinuation(next,scope));
 assert.throws(()=>privateSyncContinuation(next,'private-sync-20261003'));
 assert.throws(()=>privateSyncContinuation({...next,migrationPhase:'prepared-unimported'},scope));
 assert.throws(()=>privateSyncContinuation({...next,prefix:'reusable-agents-20261003-1'},scope));
 for(const field of ['continuation','source']){
  const publicPool='0x205d5739136d6cb73d732e1146e1ce034798a613';
  assert.throws(()=>privateSyncContinuation({...next,[field]:field==='source'?{manifest:{pool:publicPool}}:{pool:publicPool}},scope));
 }
 assert.equal(privateSyncQualification('private-sync-20261002').lastTournament,4n);
 assert.equal(privateSyncQualification('private-sync-20261003').lastTournament,8n);
});

test('recovery binds the exact private pool and requires the successful retry plus final championship',()=>{
 const scope='private-sync-queue-20261003',source=privateSyncQualification(scope);
 const completed={...record(),prefix:source.prefix,continuation:{pool:source.pool},source:{manifest:{pool:source.pool}},common:{pool:'0xd8bc8424c74aafbe3e00cbd04468538e01f6a27d'}};
 const plan=privateSyncCompleted(completed,scope);
 assert.equal(plan.results,254n);assert.equal(plan.tournaments,11n);
 assert(plan.proofs.includes('five-concurrent-4.json'));
 assert(plan.proofs.includes('five-tournament-10-attempt2.json'));
 assert(plan.proofs.includes('five-tournament-11.json'));
 assert(!plan.proofs.includes('five-tournament-10.json'),'The failed first attempt cannot authorize closure');
 for(const pool of ['0x205d5739136d6cb73d732e1146e1ce034798a613',source.pool,'0x1234567890123456789012345678901234567890'])
  assert.throws(()=>privateSyncCompleted({...completed,common:{pool}},scope));
 assert.throws(()=>privateSyncCompleted(completed,'private-sync-20261003'));
 assert.throws(()=>privateSyncCompleted(completed,undefined));
 assert.throws(()=>privateSyncCompleted({...completed,migrationPhase:'prepared-unimported'},scope));
});
