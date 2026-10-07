import {isHex,type Hex} from 'viem';
import {hubLeaseValid} from '../../../shared/hub-lease';
export type ReusablePublicationBudget={rulesVersion:14|15|16|17|18;maxBatches:number;matchReserveBatches:number;rotationLeadSeconds:number;serviceSeconds:number;evidence:Hex;runtimeHashes:Hex[]};
/** Operational limits from an actual worst-case publication/release trial.
 * Absence of that evidence disables admissions, never result recovery. */
export function validateReusableBudget(value:unknown,hashes:readonly string[],expectedRules:14|15|16|17|18=15):ReusablePublicationBudget{
 const b=value as ReusablePublicationBudget;
 const lead=(expectedRules===14||expectedRules===18)?1860:420;
 if(!hashes.length||!b||b.rulesVersion!==expectedRules||!Number.isSafeInteger(b.maxBatches)||!Number.isSafeInteger(b.matchReserveBatches)
  ||b.matchReserveBatches<1||b.maxBatches<=b.matchReserveBatches||!Number.isSafeInteger(b.rotationLeadSeconds)||b.rotationLeadSeconds<lead
  ||!Number.isSafeInteger(b.serviceSeconds)||b.serviceSeconds<=b.rotationLeadSeconds
  ||!isHex(b.evidence)||b.evidence.length!==66||BigInt(b.evidence)===0n||!Array.isArray(b.runtimeHashes)
  ||hashes.some(h=>!b.runtimeHashes.some(x=>x.toLowerCase()===h.toLowerCase())))throw Error('Missing reviewed reusable publication budget');
 return b;
}
export function reusableAdmissionBudget(b:ReusablePublicationBudget|undefined,batches:bigint,expires:bigint,now:bigint,hub?:string){
 return !!b&&batches>=0n&&batches+BigInt(b.matchReserveBatches)<BigInt(b.maxBatches)&&hubLeaseValid(hub,expires,now,(b.rulesVersion===14||b.rulesVersion===18)?1860n:420n);
}
/** A delegated idle arena with no admission reserve is not usable capacity.
 * Active games keep their slot until captured; exhaustion can retire only idle
 * arenas. Unknown health never supplies the reserve for a voluntary rotation. */
export function reusableCapacity(b:ReusablePublicationBudget,arenas:readonly {
 app:string;batches:bigint;expires:bigint;occupied:boolean;serving:boolean;
}[],now:bigint,hub?:string){
 const ready:string[]=[],exhausted:string[]=[];
 for(const a of arenas){
  const admits=reusableAdmissionBudget(b,a.batches,a.expires,now,hub);
  if(a.serving&&(a.occupied||admits))ready.push(a.app);
  if(!a.occupied&&!admits)exhausted.push(a.app);
 }
 return{ready,exhausted};
}
