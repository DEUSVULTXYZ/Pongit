import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {privateSyncContinuation,privateSyncQualification,privateSyncCompleted,assertPrivateSyncBackup,PRIVATE_SYNC_PREDECESSOR} from '../scripts/private-sync-continuation';
function record(){return {prefix:'reusable-agents-20261002-2',continuation:{pool:PRIVATE_SYNC_PREDECESSOR},source:{manifest:{pool:PRIVATE_SYNC_PREDECESSOR}},migrationPhase:'imported-closed',rulesVersion:16,friendlyPause:'heartbeat-v1',maxMatches:5,common:{pool:'0x1234567890123456789012345678901234567890'}};}
test('private continuation requires its exact source, namespace and completed import',()=>{
 assert.equal(privateSyncContinuation({},undefined),false);
 assert.equal(privateSyncContinuation(record(),'private-sync-20261002'),true);
 assert.throws(()=>privateSyncContinuation(record(),undefined));
 for(const patch of [{prefix:'public'},{rulesVersion:15},{migrationPhase:'prepared-unimported'},{continuation:{pool:'0x205d5739136d6cb73d732e1146e1ce034798a613'}},{source:{manifest:{pool:'0x205d5739136d6cb73d732e1146e1ce034798a613'}}},{common:{pool:PRIVATE_SYNC_PREDECESSOR}}])
  assert.throws(()=>privateSyncContinuation({...record(),...patch},'private-sync-20261002'));
 assert.throws(()=>privateSyncContinuation(record(),'true'));
});

test('lower-gas continuation is restricted to the completed queue season and eight dormant targets',()=>{
 const scope='private-sync-velocity-20261003',expected=privateSyncQualification(scope);
 assert.equal(expected.results,254n);assert.equal(expected.tournaments,11n);assert.equal(expected.requests,59n);assert.equal(expected.lastTournament,15n);
 const next={...record(),prefix:expected.prefix,arenaCount:8,continuation:{pool:expected.pool},source:{manifest:{pool:expected.pool}}};
 assert(privateSyncContinuation(next,scope));
 assert.throws(()=>privateSyncContinuation({...next,arenaCount:5},scope));
 assert.throws(()=>privateSyncContinuation({...next,migrationPhase:'prepared-unimported'},scope));
 assert.throws(()=>privateSyncContinuation(next,'private-sync-queue-20261003'));
 assert.throws(()=>privateSyncContinuation({...next,source:{manifest:{pool:'0x205d5739136d6cb73d732e1146e1ce034798a613'}}},scope));
 assert.throws(()=>privateSyncCompleted(next,scope),'Preparing a new trial never authorizes its future closure');
});

test('recovery backup permits extra namespaces only with the bound manifest and required source files',()=>{
 const names=['operator.dump','runtime.tar.gz','sync-queue-continuation.dump','sync-queue-continuation.tar.gz','sync-velocity-continuation.tar.gz'];
 const check=(names:string[],override:Record<string,unknown>={})=>{
  const bytes=Buffer.from(JSON.stringify({files:names.map(name=>({name,size:123,sha256:'a'.repeat(64)}))}));
  const receipt={verified:true,files:names.length,manifestSha256:createHash('sha256').update(bytes).digest('hex'),...override};
  return()=>assertPrivateSyncBackup(receipt,bytes,'private-sync-queue-20261003',4);
 };
 check(names)();check(names.slice(0,4))();
 assert.throws(check(names,{manifestSha256:'b'.repeat(64)}));
 assert.throws(check(names,{verified:false}));assert.throws(check(names,{files:4}));
 assert.throws(check(names.filter(name=>name!=='operator.dump')));
 assert.throws(check([...names.slice(0,3),'another.dump']));
 assert.throws(check([...names,'operator.dump']));assert.throws(check([...names,'../operator.dump']));
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
