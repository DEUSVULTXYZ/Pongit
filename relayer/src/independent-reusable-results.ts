import {decodeAbiParameters,getAbiItem,type Abi,type Address,type PublicClient} from 'viem';
import type {Pool} from 'pg';
import type {IndependentManifest} from '../../shared/independent';
import {independentReader} from '../../shared/independent-read';
import {abi as arenaAbi} from '../../shared/abi-independent-ReusableEventsArena';
import {abi as lobbyAbi} from '../../shared/abi-independent-ReusableEventsLobby';
import {abi as verifierAbi} from '../../shared/abi-independent-PublishedResultVerifier';
import {reusableAdmissionDigest} from '../../shared/reusable-admission';
import {reusableSlotResult} from '../../shared/reusable-results';
import {createReusableResultArchive} from './reusable-result-archive';

type Actor={app:Address;node:PublicClient;reference():{id:bigint;epoch:bigint}};
type Enqueue=(address:Address,abi:Abi,action:string,args:readonly unknown[],value?:bigint,priority?:number)=>Promise<unknown>;
/** Capture is independent from admission, ticks and expiry. The current slot
 * is only an archive source; a canonical published proof is still mandatory.
 * Historical IDs never read whichever different game occupies that slot. */
export function independentReusableResults(db:Pool,base:PublicClient,m:IndependentManifest,queue:Enqueue){
 if(m.rulesVersion!==14||!m.resultVerifier)throw Error('Reusable result verifier required');
 const verifier=m.resultVerifier,archive=createReusableResultArchive(db);
 async function archiveSlot(actor:Actor){
  const ref=actor.reference(),block=await base.getBlock({includeTransactions:false}),r=independentReader(base,m,block.number);
  const [ticket]=await r.lobby('ticketOf',[ref.id]);
  if(!ref.id||ticket.matchId!==ref.id||ticket.epoch!==ref.epoch||ticket.arena.toLowerCase()!==actor.app.toLowerCase())throw Error('Result ticket differs from the observed match');
  const before=await actor.node.readContract({address:actor.app,abi:arenaAbi,functionName:'resultCommitment'});
  if(before[0]!==ref.epoch||BigInt(before[1])!==ticket.sequence)return false;
  const result=await actor.node.readContract({address:actor.app,abi:arenaAbi,functionName:'publishedResult'});
  const after=await actor.node.readContract({address:actor.app,abi:arenaAbi,functionName:'resultCommitment'});
  if(before.some((v,i)=>v!==after[i]))throw Error('Result changed while archiving its retained body');
  const candidate=reusableSlotResult(arenaAbi,{chainId:10143n,arena:actor.app,epoch:ref.epoch},14,ref.id,reusableAdmissionDigest(ticket),ticket.sequence,result,before);
  await archive.storeSlot(candidate);return true;
 }
 async function capture(id:bigint){
  const block=await base.getBlock({includeTransactions:false}),r=independentReader(base,m,block.number);
  const [ticket]=await r.lobby('ticketOf',[id]);
  if(!id||ticket.matchId!==id||!m.arenas.some(a=>a.app.toLowerCase()===ticket.arena.toLowerCase()))throw Error('Unknown issued result');
  const [root,finality]=await base.readContract({address:verifier,abi:verifierAbi,functionName:'currentRoot',args:[ticket.arena,ticket.epoch],blockNumber:block.number});
  const known=await r.ratings('indexOf',[id]),previous=known?await r.ratings('entry',[id]):null;
  if(BigInt(root.count)<ticket.sequence){
   if(!finality)return false;
   // Only a released canonical prefix can prove that execution was lost.
   // Never cancel merely because a receipt, archive or RPC is unavailable.
   if(!previous||!previous.finality||previous.latest.status!==4){await queue(m.lobby,lobbyAbi,'captureMissing',[id],0n,0);return true;}
   return false;
  }
  const proof=await archive.proof({chainId:10143n,arena:ticket.arena,epoch:ticket.epoch},{root:root.hash,count:root.count},id);
  if(proof.rules!==14||BigInt(proof.index)+1n!==ticket.sequence||proof.ticketHash!==reusableAdmissionDigest(ticket))
   throw Error('Archived result differs from its issued ticket');
  const complete=decodeAbiParameters(getAbiItem({abi:arenaAbi,name:'publishedResult'}).outputs,proof.canonical)[0];
  if(previous?.latest.hash===complete.match_.hash&&previous.finality===finality)return false;
  await queue(m.lobby,lobbyAbi,'captureProof',[id,complete,proof.siblings],0n,0);return true;
 }
 return{archive,archiveSlot,capture};
}
