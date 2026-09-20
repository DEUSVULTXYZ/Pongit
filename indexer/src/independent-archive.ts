import {applyChaosArchive} from './chaos-archive';
import {decodePublishedEntry} from './published-result';

export type IndependentArchiveDeployment = {rulesVersion:4|12|13|14; apps:readonly string[]};
export function independentArchiveRules(bindings:Record<string,IndependentArchiveDeployment>,ledger:string,arena:string){
 const binding=bindings[ledger.toLowerCase()];
 if(!binding||![4,12,13,14].includes(binding.rulesVersion)||!binding.apps.some(a=>a.toLowerCase()===arena.toLowerCase()))
  throw Error('Unknown independent result deployment');
 return binding.rulesVersion;
}

/** The canonical ledger read, including its original reference, is authoritative.
 * Reuse the shared correction/retention path instead of labelling every later
 * human generation as rules 4 or giving corrected matches another replay slot. */
export async function applyIndependentArchive(context:any,event:any,entry:ReturnType<typeof decodePublishedEntry>,
 bindings:Record<string,IndependentArchiveDeployment>){
 const first=entry.first,r=entry.latest;
 const rules=independentArchiveRules(bindings,event.srcAddress,first.arena);
 if(String(event.params.id)!==first.id||r.id!==first.id||r.arena!==first.arena||r.epoch!==first.epoch
  ||r.a!==first.a||r.b!==first.b||r.mode!==first.mode||r.ranked!==first.ranked)
  throw Error('Published result binding changed');
 const id=`10143:${first.arena}:${first.epoch}:${first.id}`,previous=await context.Match.get(id);
 await applyChaosArchive(context,{...event,params:{...r,app:first.arena,played:previous?.played||r.status===3}},rules);
 // Preserve the original ledger-based deployment reference used by this family.
 const stored=await context.Match.get(id);
 context.Match.set({...stored,deployment:`10143:${event.srcAddress.toLowerCase()}`});
}
