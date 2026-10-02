import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isAddress,zeroAddress,type Hex} from 'viem';
import {validateSeriesRecord} from './series-runtime';
import {validateAgentPoolManifest,agentPoolReleaseEvidence,type AgentPoolManifest} from '../../../shared/agent-pool';
import {NO_LEASE_HUB} from '../../../shared/hub-lease';

const fields=['hub','pool','catalog','tournaments','ratings','qualifications','family','challenges','verifier'] as const;
export function validateReusableRecord(record:any,humans:readonly string[],manifest?:AgentPoolManifest,evidence?:string,isolated=false){
 validateSeriesRecord(record,humans);
 const v3=record.common.hub.toLowerCase()===NO_LEASE_HUB.toLowerCase();
 if(v3||record.hostedProvisioning!==undefined||record.provisioningOwner!==undefined){
  assert(v3&&record.hostedProvisioning==='owner-consent-v1','Pinned v3 provisioning capability required');
  assert(isAddress(record.provisioningOwner)&&record.provisioningOwner.toLowerCase()!==zeroAddress,'Provisioning owner required');
  assert(!Object.values(record.common).some(value=>String(value).toLowerCase()===record.provisioningOwner.toLowerCase()),'Provisioner cannot own game authority');
 }
 if(record.countdownClock!==undefined)assert.equal(record.countdownClock,"engine-ticks-v1");
 if(record.publicationProbe!==undefined){assert.equal(record.publicationProbe,'epoch-marker-v1');assert.equal(record.maxMatches,5);}
 if(record.housePolicy!==undefined&&record.housePolicy!=='inherited'){
  assert.equal(record.housePolicy,'progressive-v1');assert.equal(record.maxMatches,5);
  assert.equal(record.modules?.ProgressiveHousePolicies?.toLowerCase(),record.modules?.HousePolicies?.toLowerCase(),'Progressive controller binding mismatch');
 }
 if(record.houseInstances!==undefined){
  assert.equal(record.houseInstances,'official-v1');
  assert(isAddress(record.modules?.HouseInstances),'Pinned instance library required');
 }
 assert([15,16].includes(record.rulesVersion),'Reusable rules required');
 if(record.rulesVersion===16)assert(record.friendlyPause==='heartbeat-v1'&&record.maxMatches===5&&v3&&record.housePolicy==='progressive-v1','Rules 16 synchronization capabilities required');
 else assert(record.friendlyPause===undefined,'Historical rules cannot acquire pause authority');
 if(record.maxMatches!==undefined)assert([2,5].includes(record.maxMatches),'Supported lane count required');
 if(record.maxMatches===5){assert(record.arenaAdmissions==='verified-epoch-v1'&&record.houseInstances==='official-v1'&&record.arenas.length>=5,'Five-lane capabilities required');}
 assert(record.arenas.length>=3&&record.arenas.length<=16,'Reviewed reusable arena bounds');
 assert(isAddress(record.common.verifier)&&record.common.verifier.toLowerCase()!==zeroAddress,'Result verifier required');
 assert(record.arenas.every((a:any)=>a.app.toLowerCase()!==record.common.verifier.toLowerCase()),'Verifier cannot be an arena');
 assert(isAddress(record.modules?.HousePolicies),'Pinned house strategy required');
 if(manifest){
  const m=validateAgentPoolManifest(manifest,humans);
  if(record.continuation){
   const prior=m.history?.find(p=>p.pool.toLowerCase()===String(record.continuation.pool).toLowerCase());
   assert(prior,'Continuation requires its historical manifest');
   for(const field of ['pool','catalog','tournaments','ratings','qualifications','challenges'] as const){
    assert(isAddress(record.continuation[field]),'Invalid predecessor authority');
    assert.equal(record.continuation[field].toLowerCase(),prior[field].toLowerCase(),'Predecessor authority mismatch');
    assert.notEqual(record.continuation[field].toLowerCase(),record.common[field].toLowerCase(),'Continuation cannot point to itself');
   }
   assert.equal(m.family.toLowerCase(),prior.family.toLowerCase(),'Continuation must retain existing family grants');
  }
  assert.equal(m.countdownClock,record.countdownClock,"Countdown capability mismatch");
  assert.equal(m.publicationProbe,record.publicationProbe,'Publication preflight capability mismatch');
  assert.equal(m.houseInstances,record.houseInstances,'House instance capability mismatch');
  assert.equal(m.housePolicy,record.housePolicy==='inherited'?undefined:record.housePolicy,'House policy capability mismatch');
  assert.equal(m.maxMatches,record.maxMatches??2,'Lane count mismatch');
  assert.equal(m.arenaAdmissions,record.arenaAdmissions,'Admission gate mismatch');
  assert(m.version===(record.maxMatches===5?5:4)&&m.rulesVersion===record.rulesVersion,'Reusable manifest version mismatch');
  assert.equal(m.friendlyPause,record.friendlyPause,'Friendly pause capability mismatch');
  if(isolated){assert(!m.enabled&&!m.tournamentsEnabled&&m.verifiedCapacity===0&&m.qualificationEvidence===null&&!m.releaseStage,'Private qualification cannot claim a release');}
  else{const releaseEvidence=agentPoolReleaseEvidence(m);
   assert(releaseEvidence&&BigInt(releaseEvidence)!==0n,'Explicit reusable release evidence required');
   assert.equal(releaseEvidence.toLowerCase(),evidence?.toLowerCase());}
  for(const field of fields)if(field!=='verifier')assert.equal(record.common[field].toLowerCase(),(m as any)[field]?.toLowerCase(),'Reusable authority mismatch');
  assert.equal(record.arenas.length,m.arenas.length);
  record.arenas.forEach((a:any,i:number)=>{assert.equal(a.app.toLowerCase(),m.arenas[i].app.toLowerCase());assert.equal(a.runtimeHash.toLowerCase(),m.arenas[i].runtimeHash.toLowerCase());});
  assert(!('engineKey' in record)&&!('admissionKey' in record)&&!('provisioningKey' in record),'Shared metadata must not contain keys');
 }
}
export async function loadReusableRuntime(role:'engines'|'keeper'){
 assert.equal(process.getuid?.(),1000,'Keep journal ownership');
 const prefix=process.env.PONG_REUSABLE_AGENT_PREFIX!;assert(/^reusable-agents-\d{8}(?:-[1-9]\d?)?$/.test(prefix),'Stable operator namespace required');
 const released=process.env.PONG_REUSABLE_AGENT_RUNTIME==='reviewed-release';
 const isolated=process.env.PONG_REUSABLE_AGENT_RUNTIME==='isolated-candidate';
 assert.equal(role==='engines'?process.env.PONG_REUSABLE_AGENT_ENGINES:process.env.PONG_REUSABLE_AGENT_MAINTENANCE,
  released?'reviewed-release':role==='engines'?'private-qualification':'authorized-private-testnet');
 const protectedApps=(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean);
 const separated=released||isolated;
 const record=JSON.parse(await readFile(separated?'/metadata/reusable.json':'/secrets/deployment.json','utf8'));
 assert.equal(record.prefix,prefix);
 if(separated){
  const manifest=JSON.parse(await readFile('/metadata/manifest.json','utf8'));
  validateReusableRecord(record,protectedApps,manifest,process.env.PONG_AGENT_POOL_RELEASE_EVIDENCE,isolated);
  if(role==='engines')for(const [field,path] of [['engineKey','engine'],['admissionKey','admission']] as const){
   const key=JSON.parse(await readFile(`/run/pongit-agent-pool/${path}.json`,'utf8')).privateKey;
   assert(/^0x[\da-f]{64}$/i.test(key),'Invalid limited service key');record[field]=key as Hex;
  }
  if(role==='engines'&&record.hostedProvisioning){
   const key=JSON.parse(await readFile('/run/pongit-agent-pool/provisioning.json','utf8')).privateKey;
   assert(/^0x[\da-f]{64}$/i.test(key),'Invalid provisioning key');record.provisioningKey=key as Hex;
  }
 }else validateReusableRecord(record,protectedApps);
 return{record,prefix,protectedApps,stateFile:separated?`/state/${prefix}-maintenance.json`:`/secrets/${prefix}-maintenance.json`};
}
