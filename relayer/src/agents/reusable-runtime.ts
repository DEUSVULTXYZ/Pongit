import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isAddress,zeroAddress,type Hex} from 'viem';
import {validateSeriesRecord} from './series-runtime';
import {validateAgentPoolManifest,agentPoolReleaseEvidence,type AgentPoolManifest} from '../../../shared/agent-pool';

const fields=['hub','pool','catalog','tournaments','ratings','qualifications','family','challenges','verifier'] as const;
export function validateReusableRecord(record:any,humans:readonly string[],manifest?:AgentPoolManifest,evidence?:string){
 validateSeriesRecord(record,humans);
 if(record.countdownClock!==undefined)assert.equal(record.countdownClock,"engine-ticks-v1");
 if(record.houseInstances!==undefined){
  assert.equal(record.houseInstances,'official-v1');
  assert(isAddress(record.modules?.HouseInstances),'Pinned instance library required');
 }
 assert.equal(record.rulesVersion,15,'Reusable rules required');
 assert(record.arenas.length>=3&&record.arenas.length<=16,'Reviewed reusable arena bounds');
 assert(isAddress(record.common.verifier)&&record.common.verifier.toLowerCase()!==zeroAddress,'Result verifier required');
 assert(record.arenas.every((a:any)=>a.app.toLowerCase()!==record.common.verifier.toLowerCase()),'Verifier cannot be an arena');
 assert(isAddress(record.modules?.HousePolicies),'Pinned house strategy required');
 if(manifest){
  const m=validateAgentPoolManifest(manifest,humans);
  assert.equal(m.countdownClock,record.countdownClock,"Countdown capability mismatch");
  assert.equal(m.houseInstances,record.houseInstances,'House instance capability mismatch');
  const releaseEvidence=agentPoolReleaseEvidence(m);
  assert(m.version===4&&m.rulesVersion===15&&releaseEvidence&&BigInt(releaseEvidence)!==0n,'Explicit reusable release evidence required');
  assert.equal(releaseEvidence.toLowerCase(),evidence?.toLowerCase());
  for(const field of fields)if(field!=='verifier')assert.equal(record.common[field].toLowerCase(),(m as any)[field]?.toLowerCase(),'Reusable authority mismatch');
  assert.equal(record.arenas.length,m.arenas.length);
  record.arenas.forEach((a:any,i:number)=>{assert.equal(a.app.toLowerCase(),m.arenas[i].app.toLowerCase());assert.equal(a.runtimeHash.toLowerCase(),m.arenas[i].runtimeHash.toLowerCase());});
  assert(!('engineKey' in record)&&!('admissionKey' in record),'Shared metadata must not contain keys');
 }
}
export async function loadReusableRuntime(role:'engines'|'keeper'){
 assert.equal(process.getuid?.(),1000,'Keep journal ownership');
 const prefix=process.env.PONG_REUSABLE_AGENT_PREFIX!;assert(/^reusable-agents-\d{8}(?:-[1-9]\d?)?$/.test(prefix),'Stable operator namespace required');
 const released=process.env.PONG_REUSABLE_AGENT_RUNTIME==='reviewed-release';
 assert.equal(role==='engines'?process.env.PONG_REUSABLE_AGENT_ENGINES:process.env.PONG_REUSABLE_AGENT_MAINTENANCE,
  released?'reviewed-release':role==='engines'?'private-qualification':'authorized-private-testnet');
 const protectedApps=(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean);
 const record=JSON.parse(await readFile(released?'/metadata/reusable.json':'/secrets/deployment.json','utf8'));
 assert.equal(record.prefix,prefix);
 if(released){
  const manifest=JSON.parse(await readFile('/metadata/manifest.json','utf8'));
  validateReusableRecord(record,protectedApps,manifest,process.env.PONG_AGENT_POOL_RELEASE_EVIDENCE);
  if(role==='engines')for(const [field,path] of [['engineKey','engine'],['admissionKey','admission']] as const){
   const key=JSON.parse(await readFile(`/run/pongit-agent-pool/${path}.json`,'utf8')).privateKey;
   assert(/^0x[\da-f]{64}$/i.test(key),'Invalid limited service key');record[field]=key as Hex;
  }
 }else validateReusableRecord(record,protectedApps);
 return{record,prefix,protectedApps,stateFile:released?`/state/${prefix}-maintenance.json`:`/secrets/${prefix}-maintenance.json`};
}
