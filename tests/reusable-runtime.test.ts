import test from 'node:test';
import assert from 'node:assert/strict';
import {toHex,type Address} from 'viem';
import {validateReusableRecord} from '../relayer/src/agents/reusable-runtime';
import type {AgentPoolManifest} from '../shared/agent-pool';
const address=(n:number)=>toHex(n,{size:20}) as Address;
function fixture(){
 const common={hub:address(1),pool:address(2),catalog:address(3),tournaments:address(4),ratings:address(5),qualifications:address(6),family:address(7),challenges:address(8),verifier:address(9)};
 const arenas=[10,11,12].map(n=>({app:address(n),runtimeHash:toHex(123,{size:32}),node:`https://arena-${n}.example`}));
 const record:any={phase:'deployed-closed',rulesVersion:15,common,arenas,modules:{HousePolicies:address(13)},bots:Array.from({length:8},(_,i)=>({agent:address(20+i)}))};
 const evidence=toHex(321,{size:32}),manifest:AgentPoolManifest={...common,version:4,rulesVersion:15,arenas,chainId:10143,engineChainId:4242,
  enabled:false,tournamentsEnabled:false,verifiedCapacity:2,qualificationEvidence:evidence,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
 return{record,manifest,evidence,humans:[address(100)]};
}
test('reusable recovery stays available with public gates closed only on the exact reviewed deployment',()=>{
 const f=fixture();validateReusableRecord(f.record,f.humans,f.manifest,f.evidence);
 for(const mutation of ['rules','policy','human','capacity','version','evidence','bridge-key','arena']){
  const v=fixture();
  if(mutation==='rules')v.record.rulesVersion=11;
  if(mutation==='policy')delete v.record.modules.HousePolicies;
  if(mutation==='human')v.record.arenas[0].app=v.humans[0];
  if(mutation==='capacity')v.manifest.verifiedCapacity=0;
  if(mutation==='version')v.manifest.version=3;
  if(mutation==='evidence')v.evidence=toHex(0,{size:32});
  if(mutation==='bridge-key')v.record.admissionKey='must never be public';
  if(mutation==='arena')v.record.arenas=v.record.arenas.slice(0,2);
  assert.throws(()=>validateReusableRecord(v.record,v.humans,v.manifest,v.evidence),mutation);
 }
});
