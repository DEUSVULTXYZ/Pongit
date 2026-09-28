import {agentPoolReleaseEvidence,type AgentPoolManifest} from './agent-pool';

export function validateAgentSponsorRuntime(m:AgentPoolManifest,mode:string|undefined,runtime:string|undefined,evidence:string|undefined){
 if(mode==='isolated-candidate'){
  if(runtime!=='isolated-candidate'||m.version!==5||m.enabled||m.tournamentsEnabled||m.verifiedCapacity!==0
   ||m.qualificationEvidence!==null||m.releaseStage||evidence)throw Error('Private sponsor cannot claim a public release');
  return{public:false};
 }
 const proof=agentPoolReleaseEvidence(m);
 if(mode!=='reviewed-release'||![3,4,5].includes(m.version)||!proof||BigInt(proof)===0n||proof.toLowerCase()!==evidence?.toLowerCase())
  throw Error('Sponsor requires exact reviewed release evidence');
 return{public:true};
}
