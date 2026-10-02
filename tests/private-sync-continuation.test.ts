import test from 'node:test';
import assert from 'node:assert/strict';
import {privateSyncContinuation,PRIVATE_SYNC_PREDECESSOR} from '../scripts/private-sync-continuation';
function record(){return {prefix:'reusable-agents-20261002-2',continuation:{pool:PRIVATE_SYNC_PREDECESSOR},source:{manifest:{pool:PRIVATE_SYNC_PREDECESSOR}},migrationPhase:'imported-closed',rulesVersion:16,friendlyPause:'heartbeat-v1',maxMatches:5,common:{pool:'0x1234567890123456789012345678901234567890'}};}
test('private continuation requires its exact source, namespace and completed import',()=>{
 assert.equal(privateSyncContinuation({},undefined),false);
 assert.equal(privateSyncContinuation(record(),'private-sync-20261002'),true);
 assert.throws(()=>privateSyncContinuation(record(),undefined));
 for(const patch of [{prefix:'public'},{rulesVersion:15},{migrationPhase:'prepared-unimported'},{continuation:{pool:'0x205d5739136d6cb73d732e1146e1ce034798a613'}},{source:{manifest:{pool:'0x205d5739136d6cb73d732e1146e1ce034798a613'}}},{common:{pool:PRIVATE_SYNC_PREDECESSOR}}])
  assert.throws(()=>privateSyncContinuation({...record(),...patch},'private-sync-20261002'));
 assert.throws(()=>privateSyncContinuation(record(),'true'));
});
