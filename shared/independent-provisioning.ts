import {isAddress,isHex,type Address,type Hex} from 'viem';
import {NO_LEASE_HUB} from './hub-lease';

/** Private metadata pins hosting consent independently of lobby authority.
 * Historic manifests retain their original unsigned provisioning behavior. */
export function independentProvisioningScope(raw:any,app:Address,epoch:bigint,signer?:Address){
 if(raw.hub.toLowerCase()!==NO_LEASE_HUB.toLowerCase()){
  if(raw.hostedProvisioning!==undefined)throw Error('Hosting consent belongs to the pinned v3 hub');
  return undefined;
 }
 const arena=raw.arenas.find((a:any)=>a.app.toLowerCase()===app.toLowerCase());
 if(raw.rulesVersion!==14||raw.hostedProvisioning!=='owner-consent-v1'||!isAddress(raw.provisioningOwner)
  ||!signer||raw.provisioningOwner.toLowerCase()!==signer.toLowerCase()||BigInt(signer)===0n||epoch<=0n
  ||!arena||!isHex(arena.runtimeHash)||arena.runtimeHash.length!==66||BigInt(arena.runtimeHash)===0n)
  throw Error('Verified human v3 provisioning scope required');
 return {hub:NO_LEASE_HUB,app,epoch,owner:signer,runtimeHash:arena.runtimeHash as Hex};
}
