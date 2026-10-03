import test from 'node:test';
import assert from 'node:assert/strict';
import {privateSyncHistory,privateSyncIndexDatabase} from '../scripts/private-sync-history';
const pools=['0xd47bc7fece722a237c6547f85b4dd91c2601a4c8','0xdee98e3f7a0f0049244a8257a9cde304d909e5dc',
 '0x67a61b10126c85dce8a5b4e67b7b637d094ce4ca','0xd8bc8424c74aafbe3e00cbd04468538e01f6a27d','0x'+'ab'.repeat(20)];
function record(index:number){
 const manifests=pools.map((pool,i)=>({pool,rulesVersion:16,arenas:Array.from({length:i===4?8:5},(_,j)=>({app:'0x'+(100+i*10+j).toString(16).padStart(40,'0')}))}));
 return {prefix:['','reusable-agents-20261002-2','reusable-agents-20261003-1','reusable-agents-20261003-2','reusable-agents-20261003-3'][index],
  continuation:{pool:pools[index-1]},source:{manifest:{...manifests[index-1],...(index>1?{history:manifests.slice(0,index-1).reverse()}:{})}},
  common:{pool:pools[index],catalog:'0x0fe9230687fbc6f9f8139e0f86699bac8fb8c7d4'},arenas:manifests[index].arenas,arenaCount:index===4?8:5,
  rulesVersion:16,friendlyPause:'heartbeat-v1',maxMatches:5,migrationPhase:'imported-closed'};
}
const scopes=['private-sync-20261002','private-sync-20261003','private-sync-queue-20261003','private-sync-velocity-20261003'];
test('replay evidence resolves every private generation to its own database',()=>{
 for(let i=1;i<=4;i++){
  const history=privateSyncHistory(record(i),scopes[i-1]);
  assert.deepEqual(history.map(s=>s.pool),pools.slice(0,i+1).reverse());
  assert.equal(new Set(history.map(s=>s.database)).size,i+1);
  assert.equal(history.at(-1)?.database,'pong_sync_games_20261002');
 }
 assert.equal(privateSyncHistory(record(4),scopes[3])[0].database,'pong_sync_velocity_20261003');
 assert.equal(privateSyncIndexDatabase(scopes[0]),'pong_sync_index_20261002');
 assert.equal(privateSyncIndexDatabase(scopes[3]),'pong_sync_history_20261003');
 assert.throws(()=>privateSyncIndexDatabase('public'));
});
test('history cannot omit a generation, reorder databases or resolve a public authority',()=>{
 const r=record(4),scope=scopes[3];
 const patches=[
  {...r,source:{manifest:{...r.source.manifest,history:r.source.manifest.history?.slice(1)}}},
  {...r,source:{manifest:{...r.source.manifest,history:[...(r.source.manifest.history??[])].reverse()}}},
  {...r,common:{...r.common,catalog:'0x'+'11'.repeat(20)}},
  {...r,migrationPhase:'prepared-unimported'},
 ];
 for(const p of patches)assert.throws(()=>privateSyncHistory(p,scope));
 const old=record(2);old.common.pool='0x205d5739136d6cb73d732e1146e1ce034798a613';assert.throws(()=>privateSyncHistory(old,scopes[1]));
});
test('identical match numbers cannot cross ambiguous arenas or guessed rules',()=>{
 const r=record(3),scope=scopes[2];
 r.source.manifest.arenas[0].app=r.arenas[0].app;assert.throws(()=>privateSyncHistory(r,scope));
 const wrong=record(3);wrong.source.manifest.history![0].rulesVersion=15;assert.throws(()=>privateSyncHistory(wrong,scope));
});
