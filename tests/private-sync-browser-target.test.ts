import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPrivateSyncBrowserTarget,privateSyncQualification,PRIVATE_SYNC_PREDECESSOR} from '../scripts/private-sync-continuation';
import {NO_LEASE_HUB} from '../shared/hub-lease';
const scope='private-sync-velocity-20261003',expected=privateSyncQualification(scope);
const address=(n:number)=>`0x${n.toString(16).padStart(40,'0')}`;
function fixture(){
 const common={hub:NO_LEASE_HUB,pool:address(101),catalog:'0x0fe9230687fbc6f9f8139e0f86699bac8fb8c7d4',tournaments:address(102),ratings:address(103),qualifications:address(104),family:address(105),challenges:address(106)};
 const arenas=Array.from({length:8},(_,i)=>({app:address(i+1),runtimeHash:`0x${'ab'.repeat(32)}`}));
 const record={prefix:expected.prefix,phase:'deployed-closed',migrationPhase:'imported-closed',rulesVersion:16,friendlyPause:'heartbeat-v1',maxMatches:5,arenaCount:8,
  continuation:{pool:expected.pool},source:{manifest:{pool:expected.pool}},common,arenas};
 const config={...common,arenas,chainId:10143,engineChainId:4242,version:5,rulesVersion:16,friendlyPause:'heartbeat-v1',houseInstances:'official-v1',housePolicy:'progressive-v1',maxMatches:5,enabled:true,challengeAdmission:'atomic-v1'};
 return {record,config};
}
test('browser accepts the exact imported private continuation instead of the closed predecessor',()=>{
 const {config,record}=fixture();assert.doesNotThrow(()=>assertPrivateSyncBrowserTarget(config,record,scope));
});
test('browser rejects incomplete import, wrong private source, public scope and earlier target',()=>{
 const {config,record}=fixture();
 for(const patch of [{migrationPhase:'prepared-unimported'},{prefix:'public'},{phase:'prepared-unimported'},
  {source:{manifest:{pool:'0x205d5739136d6cb73d732e1146e1ce034798a613'}}},
  {common:{...record.common,catalog:address(120)}}])assert.throws(()=>assertPrivateSyncBrowserTarget(config,{...record,...patch},scope));
 for(const value of [undefined,'public','private-sync-queue-20261003'])assert.throws(()=>assertPrivateSyncBrowserTarget(config,record,value));
 for(const pool of [PRIVATE_SYNC_PREDECESSOR,expected.pool,'0x205d5739136d6cb73d732e1146e1ce034798a613'])
  assert.throws(()=>assertPrivateSyncBrowserTarget({...config,pool},record,scope));
});
test('browser binds API capabilities, every common contract and all eight arena hashes',()=>{
 const {config,record}=fixture();
 for(const patch of [{chainId:1},{engineChainId:10143},{version:4},{rulesVersion:15},{maxMatches:2},{enabled:false},
  {friendlyPause:undefined},{housePolicy:undefined},{houseInstances:undefined},{challengeAdmission:undefined}])
  assert.throws(()=>assertPrivateSyncBrowserTarget({...config,...patch},record,scope));
 for(const key of Object.keys(record.common))assert.throws(()=>assertPrivateSyncBrowserTarget({...config,[key]:address(121)},record,scope));
 for(const arenas of [config.arenas.slice(0,5),[...config.arenas.slice(0,7),config.arenas[0]],
  config.arenas.map((a,i)=>i===0?{...a,runtimeHash:`0x${'cd'.repeat(32)}`}:a),
  config.arenas.map((a,i)=>i===0?{...a,app:address(150)}:a)])assert.throws(()=>assertPrivateSyncBrowserTarget({...config,arenas},record,scope));
 assert.doesNotThrow(()=>assertPrivateSyncBrowserTarget({...config,arenas:[...config.arenas].reverse()},record,scope));
});
