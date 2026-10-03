import assert from 'node:assert/strict';
import type {Address} from 'viem';
import {privateSyncContinuation,privateSyncQualification,PRIVATE_SYNC_PREDECESSOR} from './private-sync-continuation';

const seasons=[
 {pool:PRIVATE_SYNC_PREDECESSOR,database:'pong_sync_games_20261002'},
 {pool:'0xdee98e3f7a0f0049244a8257a9cde304d909e5dc',database:'pong_sync_continuation_20261002'},
 {pool:'0x67a61b10126c85dce8a5b4e67b7b637d094ce4ca',database:'pong_sync_optimized_20261003'},
 {pool:'0xd8bc8424c74aafbe3e00cbd04468538e01f6a27d',database:'pong_sync_queue_20261003'},
] as const;
export type PrivateSyncHistory={pool:Address;database:string;rulesVersion:16;arenas:string[]};

/** Read-only evidence routing for the exact private lineage. These database
 * names never come from a URL or an arbitrary deployment property. */
export function privateSyncHistory(record:any,scope:string):PrivateSyncHistory[]{
 assert(privateSyncContinuation(record,scope));
 const expected=privateSyncQualification(scope);
 const parent=seasons.findIndex(s=>s.pool===expected.pool);assert(parent>=0);
 const prior=record.source.manifest;
 const manifests=[{...record.common,rulesVersion:record.rulesVersion,arenas:record.arenas},prior,...(prior.history??[])];
 const sourceSeasons=seasons.slice(0,parent+1).reverse();
 assert.equal(manifests.length,sourceSeasons.length+1,'Historical season omitted or inserted');
 const current=seasons[parent+1];
 if(current)assert.equal(record.common.pool.toLowerCase(),current.pool);
 else assert.equal(record.common.catalog.toLowerCase(),'0x0fe9230687fbc6f9f8139e0f86699bac8fb8c7d4');
 const databases=[current?.database??'pong_sync_velocity_20261003',...sourceSeasons.map(s=>s.database)];
 const seenPools=new Set<string>(),seenArenas=new Set<string>();
 const history:PrivateSyncHistory[]=manifests.map((m,index)=>{
  const pool=String(m.pool).toLowerCase();
  assert(/^0x[\da-f]{40}$/.test(pool)&&BigInt(pool)>0n&&!seenPools.has(pool));seenPools.add(pool);
  if(index)assert.equal(pool,sourceSeasons[index-1].pool,'Historical source does not match its database');
  if(index>1)assert.equal(m.history,undefined,'History must remain flat');
  assert.equal(m.rulesVersion,16);assert(Array.isArray(m.arenas)&&m.arenas.length>=5&&m.arenas.length<=8);
  const arenas=m.arenas.map((a:any)=>{
   const app=String(a.app).toLowerCase();
   assert(/^0x[\da-f]{40}$/.test(app)&&BigInt(app)>0n&&!seenArenas.has(app),'Ambiguous historical arena');seenArenas.add(app);return app;
  });
  return {pool:pool as Address,database:databases[index],rulesVersion:16,arenas};
 });
 assert([...seenPools].every(pool=>!seenArenas.has(pool)),'An archive emitter cannot be an arena');
 return history;
}

export function privateSyncIndexDatabase(scope:string){
 privateSyncQualification(scope);
 return scope==='private-sync-20261002'?'pong_sync_index_20261002':'pong_sync_history_20261003';
}
