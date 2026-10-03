import assert from 'node:assert/strict';
export const PRIVATE_SYNC_PREDECESSOR='0xd47bc7fece722a237c6547f85b4dd91c2601a4c8';
export function privateSyncQualification(scope:string|undefined){
 if(scope==='private-sync-20261002')return {prefix:'reusable-agents-20261002-2',pool:PRIVATE_SYNC_PREDECESSOR,results:34n,tournaments:2n};
 assert.equal(scope,'private-sync-20261003');
 return {prefix:'reusable-agents-20261003-1',pool:'0xdee98e3f7a0f0049244a8257a9cde304d909e5dc',results:110n,tournaments:4n};
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
