import {isHex} from 'viem';
import {publicIndependentManifest} from '../../shared/independent';

/** Explicit deployment opt-in, separate from the admission switch. Reviewed
 * metadata does not replace the pool's publication budget or live hub checks. */
export function independentRuntime(raw:any,env:Readonly<Record<string,string|undefined>>=process.env){
 const manifest=publicIndependentManifest(raw);
 if(manifest.rulesVersion===14){
  if(env.PONG_INDEPENDENT_REUSABLE_RUNTIME==='reviewed-release'){
   const evidence=env.PONG_INDEPENDENT_RELEASE_EVIDENCE;
   if(raw.production!==true||raw.status!=='sealed'||!evidence||!isHex(evidence)||evidence.length!==66||BigInt(evidence)===0n
    ||String(raw.qualificationEvidence).toLowerCase()!==evidence.toLowerCase()
    ||!isHex(raw.migrationHash)||raw.migrationHash.length!==66||BigInt(raw.migrationHash)===0n)
    throw Error('Reviewed human release metadata required');
   if(!env.PONG_INDEPENDENT_SNAPSHOT)throw Error('Verified human migration snapshot required');
  }else if(raw.production!==false||env.PONG_INDEPENDENT_REUSABLE_QUALIFICATION!=='isolated-vps'){
   throw Error('Reusable human service adapter is not yet qualified');
  }
 }
 if((manifest.rulesVersion===12||manifest.rulesVersion===13)&&env.PONG_INDEPENDENT_EVENTS_QUALIFICATION!=='isolated-vps')
  throw Error('Event arena service qualification is not complete');
 return manifest;
}
