import {isHex,type Hex} from 'viem';
export type ReusablePublicationBudget={rulesVersion:15;maxBatches:number;matchReserveBatches:number;rotationLeadSeconds:number;serviceSeconds:number;evidence:Hex;runtimeHashes:Hex[]};
/** Operational limits from an actual worst-case publication/release trial.
 * Absence of that evidence disables admissions, never result recovery. */
export function validateReusableBudget(value:unknown,hashes:readonly string[]):ReusablePublicationBudget{
 const b=value as ReusablePublicationBudget;
 if(!b||b.rulesVersion!==15||!Number.isSafeInteger(b.maxBatches)||!Number.isSafeInteger(b.matchReserveBatches)
  ||b.matchReserveBatches<1||b.maxBatches<=b.matchReserveBatches||!Number.isSafeInteger(b.rotationLeadSeconds)||b.rotationLeadSeconds<420
  ||!Number.isSafeInteger(b.serviceSeconds)||b.serviceSeconds<=b.rotationLeadSeconds
  ||!isHex(b.evidence)||b.evidence.length!==66||BigInt(b.evidence)===0n||!Array.isArray(b.runtimeHashes)
  ||hashes.some(h=>!b.runtimeHashes.some(x=>x.toLowerCase()===h.toLowerCase())))throw Error('Missing reviewed reusable publication budget');
 return b;
}
export function reusableAdmissionBudget(b:ReusablePublicationBudget|undefined,batches:bigint,expires:bigint,now:bigint){
 return !!b&&batches>=0n&&batches+BigInt(b.matchReserveBatches)<BigInt(b.maxBatches)&&expires>now+420n;
}
