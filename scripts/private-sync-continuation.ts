import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const PRIVATE_SYNC_PREDECESSOR='0xd47bc7fece722a237c6547f85b4dd91c2601a4c8';
export function privateSyncQualification(scope:string|undefined){
 if(scope==='private-sync-velocity-20261003')return {prefix:'reusable-agents-20261003-3',pool:'0xd8bc8424c74aafbe3e00cbd04468538e01f6a27d',results:254n,tournaments:11n,requests:59n,lastTournament:15n,arenas:8};
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
 if(expected.arenas!==undefined)assert.equal(record.arenaCount,expected.arenas);
 assert(record.common.pool.toLowerCase()!==expected.pool);
 return true;
}

/** Exact completed private seasons eligible for normal recovery. These counts
 * are requirements, not observations; callers must verify canonical completion. */
export function privateSyncCompleted(record:any,scope:string|undefined){
 const continuation=privateSyncContinuation(record,scope);
 assert.notEqual(scope,'private-sync-velocity-20261003','No completed recovery scope exists for this new trial');
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

/** Only the prepared, privately continued eight-arena deployment may exercise
 * the new hub's spare rotation. This is not permission to close a public arena
 * or a match, and does not certify continuous capacity. */
export function privateSyncRotation(record:any,scope:string|undefined){
 assert.equal(scope,'private-sync-velocity-20261003');
 assert(privateSyncContinuation(record,scope));
 assert.equal(record.phase,'deployed-closed');
 assert.equal(record.common.catalog.toLowerCase(),'0x0fe9230687fbc6f9f8139e0f86699bac8fb8c7d4');
 assert.equal(record.arenas.length,8);
 assert.equal(new Set(record.arenas.map((a:any)=>a.app.toLowerCase())).size,8);
 assert(record.arenas.every((a:any)=>/^0x[0-9a-f]{40}$/i.test(a.app)&&/^0x[0-9a-f]{64}$/i.test(a.runtimeHash)));
 return {source:record.arenas[0],spare:record.arenas[5]};
}

/** Additional backed-up namespaces must not invalidate an otherwise complete
 * recovery backup. Bind the receipt to its exact manifest and require the
 * original operator journal plus the precise source database and runtime. */
export function assertPrivateSyncBackup(receipt:any,bytes:Uint8Array,scope:string|undefined,minimumFiles:number){
 assert(receipt.verified===true);
 assert.equal(receipt.manifestSha256,createHash('sha256').update(bytes).digest('hex'));
 const manifest=JSON.parse(Buffer.from(bytes).toString('utf8'));
 assert(Array.isArray(manifest.files)&&manifest.files.length===receipt.files&&receipt.files>=minimumFiles);
 const names=new Set<string>();
 for(const row of manifest.files){
  assert(typeof row.name==='string'&&/^[a-z0-9][a-z0-9.-]*$/.test(row.name)&&!names.has(row.name));
  assert(Number.isSafeInteger(row.size)&&row.size>0&&/^[a-f0-9]{64}$/.test(row.sha256));names.add(row.name);
 }
 const source=scope==='private-sync-velocity-20261003'?'sync-velocity-continuation'
  :scope==='private-sync-queue-20261003'?'sync-queue-continuation'
  :scope==='private-sync-20261003'?'sync-optimized-continuation'
  :scope==='private-sync-20261002'?'sync-continuation':'sync-private';
 for(const name of ['operator.dump','runtime.tar.gz',source+'.dump',source+'.tar.gz'])assert(names.has(name),`Required backup missing: ${name}`);
}
