import assert from 'node:assert/strict';
export const PRIVATE_SYNC_PREDECESSOR='0xd47bc7fece722a237c6547f85b4dd91c2601a4c8';
/** Narrow opt-in for the private continuation trial, never the public season. */
export function privateSyncContinuation(record:any,scope:string|undefined){
 if(scope===undefined){assert(!record.continuation,'Fresh private fixture only');return false;}
 assert.equal(scope,'private-sync-20261002');
 assert.equal(record.prefix,'reusable-agents-20261002-2');
 assert.equal(record.continuation?.pool?.toLowerCase(),PRIVATE_SYNC_PREDECESSOR);
 assert.equal(record.source?.manifest?.pool?.toLowerCase(),PRIVATE_SYNC_PREDECESSOR);
 assert.equal(record.migrationPhase,'imported-closed');
 assert.equal(record.rulesVersion,16);assert.equal(record.friendlyPause,'heartbeat-v1');
 assert.equal(record.maxMatches,5);
 assert(record.common.pool.toLowerCase()!==PRIVATE_SYNC_PREDECESSOR);
 return true;
}
