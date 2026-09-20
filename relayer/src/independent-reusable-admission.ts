import {privateKeyToAccount} from 'viem/accounts';
import type {Address,Hex,PublicClient} from 'viem';
import type {IndependentManifest} from '../../shared/independent';
import {independentReader} from '../../shared/independent-read';
import {readHubDelegation} from '../../shared/rooms-hub';
import {abi} from '../../shared/abi-independent-ReusableEventsArena';
import {reusableAdmissionDigest,validateReusableAdmission,validateReusableCancellation,type ReusableTicket,type ReusableBinding} from '../../shared/reusable-admission';

type Actor={app:Address;node:PublicClient;reference():{id:bigint;epoch:bigint};
 send(action:'admit'|'cancelAdmission',args:readonly unknown[]):Promise<unknown>};
/** The bridge transports the exact Monad reservation. It does not create one,
 * change its participants or turn a missing engine response into a cancellation.
 * Caller serializes this lane with the arena's existing nonce journal. */
export function independentReusableAdmission(base:PublicClient,m:IndependentManifest,key:Hex){
 if(m.rulesVersion!==14||!m.admissionSigner)throw Error('Reusable human admission manifest required');
 const signer=privateKeyToAccount(key);
 if(signer.address.toLowerCase()!==m.admissionSigner.toLowerCase())throw Error('Admission bridge identity mismatch');
 return async(actor:Actor)=>{
  if(!m.arenas.some(a=>a.app.toLowerCase()===actor.app.toLowerCase()))throw Error('Arena outside this human deployment');
  const ref=actor.reference();if(ref.id<=0n||ref.epoch<=0n)throw Error('Admission needs an exact match reference');
  const block=await base.getBlock({includeTransactions:false});if(!block.hash)throw Error('Canonical admission block unavailable');
  const r=independentReader(base,m,block.number);
  const [reserved,pair,hub]=await Promise.all([r.lobby('reservedMatch',[actor.app]),r.lobby('ticketOf',[ref.id]),readHubDelegation(base,m.hub,actor.app,block.number)]);
  const [ticket,binding]=pair as [ReusableTicket,ReusableBinding];
  if(reserved!==ref.id||ticket.matchId!==ref.id||ticket.epoch!==ref.epoch||ticket.arena.toLowerCase()!==actor.app.toLowerCase())throw Error('Authoritative reservation changed');
  const session:any=await actor.node.request({method:'interlude_session',params:[]} as any);
  if(String(session.app).toLowerCase()!==actor.app.toLowerCase()||session.chainId!==4242
   ||BigInt(session.epoch)!==hub.epoch||BigInt(session.baseBlock)!==hub.baseBlock)throw Error('Engine admission base or epoch changed');
  const current=await actor.node.readContract({address:actor.app,abi,functionName:'currentAdmission'});
  if(current[0]===ref.epoch&&current[1]===ref.id){
   if(current[2]!==ticket.sequence||current[3]!==reusableAdmissionDigest(ticket))throw Error('Engine admission differs from its Monad ticket');
   return 'already-admitted' as const;
  }
  if(current[1]>0n){
   const prior=await actor.node.readContract({address:actor.app,abi,functionName:'getSnapshot',args:[current[1]]});
   if(prior.phase<3n)throw Error('Previous physical match is still active');
  }
  const [[engineEpoch,engineCount],issuedDigest,source]=await Promise.all([
   actor.node.readContract({address:actor.app,abi,functionName:'resultCommitment'}),
   r.lobby('issuedTicket',[actor.app,ticket.epoch,ticket.sequence]),base.getBlock({blockNumber:ticket.sourceBlock,includeTransactions:false})]);
  if(!source.hash)throw Error('Admission source block unavailable');
  const evidence={chainId:10143,authority:m.lobby,arena:actor.app,issuedDigest,sourceHash:source.hash,reservedMatch:reserved,
   hubEpoch:hub.epoch,hubStatus:hub.status,hubExpires:hub.expiresAt,engineEpoch,engineCount,now:block.timestamp};
  const cancel=block.timestamp>=ticket.expires;
  (cancel?validateReusableCancellation:validateReusableAdmission)(ticket,binding,evidence);
  // Network awaits never keep using a changed authority or match binding.
  const latest=actor.reference();
  if(latest.id!==ref.id||latest.epoch!==ref.epoch||(await base.getBlock({blockNumber:block.number,includeTransactions:false})).hash!==block.hash)
   throw Error('Admission changed before attestation');
  const signature=await signer.sign({hash:reusableAdmissionDigest(ticket)});
  await actor.send(cancel?'cancelAdmission':'admit',[ticket,binding,signature]);
  return cancel?'cancellation-submitted' as const:'admission-submitted' as const;
 };
}
