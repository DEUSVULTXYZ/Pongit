import type {Address,PublicClient} from 'viem';
import type {IndependentManifest} from '../../shared/independent';
import {independentReader} from '../../shared/independent-read';

/** Slots, consent and assignments refer to one block. Start independent reads
 * together so the client's existing multicall can share each dependency wave. */
export async function readAdmissionProposals(base:PublicClient,m:IndependentManifest){
 const block=await base.getBlock({includeTransactions:false});
 const r=independentReader(base,m,block.number);
 const slots=await Promise.all([0n,1n].map(i=>r.lobby('slot',[i]))) as bigint[];
 return Promise.all(slots.filter(id=>id>0n).map(async id=>{
  const [proposal,arena]=await Promise.all([r.lobby('proposal',[id]),r.lobby('arenaOf',[id])]);
  return {id,proposal,arena:arena as Address,block:block.number};
 }));
}
