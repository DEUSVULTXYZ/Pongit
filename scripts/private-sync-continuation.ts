import assert from 'node:assert/strict';
export const PRIVATE_SYNC_PREDECESSOR='0xd47bc7fece722a237c6547f85b4dd91c2601a4c8';
export function privateSyncQualification(scope:string|undefined){
 if(scope==='private-sync-20261002')return {prefix:'reusable-agents-20261002-2',pool:PRIVATE_SYNC_PREDECESSOR,results:34n,tournaments:2n,lastTournament:4n};
 if(scope==='private-sync-queue-20261003')return {prefix:'reusable-agents-20261003-2',pool:'0x67a61b10126c85dce8a5b4e67b7b637d094ce4ca',results:168n,tournaments:7n,requests:43n,lastTournament:11n};
 assert.equal(scope,'private-sync-20261003');
 return {prefix:'reusable-agents-20261003-1',pool:'0xdee98e3f7a0f0049244a8257a9cde304d909e5dc',results:110n,tournaments:4n,lastTournament:8n};
}
/** Narrow opt-in for the private continuation trial, never the public season. */
export function privateSyncContinuation(record:any,scope:string|undefined){
 if(scope===undefined){assert(!record.continuation,'Fresh private fixture only');return false;}
 const expected=privateSyncQualification(scope);
 assert.equal(record.prefix,expected.prefix);
 assert.equal(record.continuation?.pool?.toLowerCase(),expected.pool);
 assert.equal(record.source?.manifest?.pool?.toLowerCase(),expected.pool);
 assert.equal(record.migrationPhase,'imported-closed');
 assert.equal(record.rulesVersion,16);assert.equal(record.friendlyPause,'heartbeat-v1');
 assert.equal(record.maxMatches,5);
 assert(record.common.pool.toLowerCase()!==expected.pool);
 return true;
}

/** Exact completed private seasons eligible for normal recovery. These counts
 * are requirements, not observations; callers must verify canonical completion. */
export function privateSyncCompleted(record:any,scope:string|undefined){
 const continuation=privateSyncContinuation(record,scope);
 const plan=scope==='private-sync-queue-20261003'
  ?{pool:'0xd8bc8424c74aafbe3e00cbd04468538e01f6a27d',results:254n,tournaments:11n,backupFiles:20,
    proofs:['five-concurrent-4.json','five-tournament-8.json','five-tournament-9.json','five-tournament-10-attempt2.json','five-tournament-11.json']}
  :scope==='private-sync-20261003'
  ?{pool:'0x67a61b10126c85dce8a5b4e67b7b637d094ce4ca',results:168n,tournaments:7n,backupFiles:19,
    proofs:['five-concurrent-6.json','five-tournament-5.json','five-tournament-6.json','five-tournament-7.json']}
  :continuation
  ?{pool:'0xdee98e3f7a0f0049244a8257a9cde304d909e5dc',results:110n,tournaments:4n,backupFiles:16,
    proofs:['five-concurrent-6.json','five-tournament-3.json','five-tournament-4.json']}
  :{pool:PRIVATE_SYNC_PREDECESSOR,results:34n,tournaments:2n,backupFiles:7,
    proofs:['five-concurrent-1.json','five-tournament-1.json','five-tournament-2.json']};
 assert.equal(record.common.pool.toLowerCase(),plan.pool,'Only the exact completed private pool is eligible');
 return plan;
}
