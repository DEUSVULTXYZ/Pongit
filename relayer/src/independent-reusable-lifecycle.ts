import {zeroHash,type Abi,type Address,type PublicClient} from 'viem';
import type {IndependentManifest} from '../../shared/independent';
import {independentReader} from '../../shared/independent-read';
import {readHubDelegation} from '../../shared/rooms-hub';
import {reusableAdmissionDigest} from '../../shared/reusable-admission';
import {abi as arenaAbi} from '../../shared/abi-independent-ReusableEventsArena';
import {abi as lobbyAbi} from '../../shared/abi-independent-ReusableEventsLobby';
import {abi as verifierAbi} from '../../shared/abi-independent-PublishedResultVerifier';
import {roomsLifecycleHubAbi as hubAbi} from '../../shared/abi-rooms-lifecycle';
import {abi as hubCalls} from '../../shared/abi-independent-IInterludeHub';
import type {independentEngine} from './independent-engine';
import type {independentReusableResults} from './independent-reusable-results';

type Engine=ReturnType<typeof independentEngine>;
type Results=ReturnType<typeof independentReusableResults>;
type Queue=(at:Address,abi:Abi,name:string,args:readonly unknown[],value?:bigint,priority?:number)=>Promise<unknown>;
export type ReusableHumanHealth={id:string;epoch:string;expiresAt:number;releaseAt:number;online:boolean;lastProgressAt:number};
type Options={base:PublicClient;manifest:IndependentManifest;engine:Engine;health:ReusableHumanHealth;results:Results;queue:Queue;
 stage(name:string,code?:string):Promise<void>;
 admit(e:Engine):Promise<unknown>;
 /** This only locates/starts the already delegated epoch. It cannot open one. */
 ensureHosted(epoch:bigint):Promise<void>;
};

/** Observe one reusable arena without closing after every game. Admission of a
 * new delegation remains in the separately budgeted pool coordinator. Result
 * recovery and real release do not depend on that admission budget. */
export function independentReusableLifecycle(o:Options){
 const {base,manifest:m,engine:e,health:h,results,queue}=o;
 if(m.rulesVersion!==14||!m.resultVerifier)throw Error('Reusable human lifecycle manifest required');
 const verifier=m.resultVerifier;let validated=0n,checked=0;
 async function observe(){
  h.online=false;
  const block=await base.getBlock({includeTransactions:false}),r=independentReader(base,m,block.number);
  const [reserved,d,slot]=await Promise.all([r.lobby('reservedMatch',[e.app]),readHubDelegation(base,m.hub,e.app,block.number),r.arena(e.app,'currentMatch')]);
  const id=BigInt(reserved||slot[1]),epoch=d.status===0?BigInt(slot[0]):d.epoch;
  h.id=String(reserved);h.epoch=String(epoch);h.expiresAt=Number(d.expiresAt)*1000;h.releaseAt=Number(d.stakeUnlockAt)*1000;
  // Retain the exact last logical match for receipt recovery, including while
  // closing. A stale physical slot is never labelled with a newer reservation.
  if(e.bind(id,epoch))await e.restoreHealth();
  if(d.status===3){await o.stage('review','DELEGATION_CHALLENGED');return;}
  if(d.status===0){
   if(epoch){
    await e.retire(epoch);
    const [sealed]=await base.readContract({address:verifier,abi:verifierAbi,functionName:'finalizedRoots',args:[e.app,epoch],blockNumber:block.number});
    if(sealed===zeroHash){await o.stage('sealing');await queue(verifier,verifierAbi,'sealReleased',[e.app],0n,0);return;}
    const snapshot=slot[1]?await r.arena(e.app,'getSnapshot',[slot[1]]):null;
    if(reserved||snapshot&&snapshot.phase<3n){
     await o.stage('recovering');
     // An existing leaf needs its archived proof; an absent final leaf can be
     // cancelled by the authority. Neither path guesses from node availability.
     if(reserved&&await results.capture(reserved))return;
     await queue(m.lobby,lobbyAbi,'recoverReleased',[e.app],0n,0);return;
    }
   }
   e.bind(0n,0n);await o.stage('released');return;
  }
  if(d.status===2){
   await o.stage('closing');await e.reconcile();
   if(block.timestamp>=d.stakeUnlockAt)await queue(m.hub,hubAbi,'releaseStake',[e.app,zeroHash],0n,0);
   if(reserved&&d.batchIndex>0n)await results.capture(reserved);
   return;
  }
  if(d.status!==1)throw Error('Unknown reusable delegation status');
  await e.retireOlder(epoch,async old=>{
   const [root]=await base.readContract({address:verifier,abi:verifierAbi,functionName:'finalizedRoots',args:[e.app,old],blockNumber:block.number});
   return root!==zeroHash;
  });
  // These real protocol deadlines may retire an unavailable node, never a
  // guessed local RPC timeout. Simulations/inclusion recheck them on Monad.
  if(block.timestamp>=d.expiresAt){
   await o.stage('recovering','DELEGATION_EXPIRED');await e.reconcile();
   await queue(m.lobby,lobbyAbi,'closeReusableArena',[e.app],0n,0);return;
  }
  if(d.maxBatchInterval>0n&&block.timestamp>d.lastCommitAt+d.maxBatchInterval){
   await o.stage('recovering','PUBLICATION_SILENCE_DEADLINE');await e.reconcile();
   await queue(m.hub,hubCalls,'forceClose',[e.app,zeroHash],0n,0);return;
  }
  try{
   if(validated!==epoch||Date.now()-checked>15000){
    const session=await e.status();
    if(String(session.app).toLowerCase()!==e.app.toLowerCase()||BigInt(session.epoch)!==epoch
     ||Number(session.chainId)!==4242||BigInt(session.baseBlock)!==d.baseBlock)throw Error('Hosted arena epoch or base mismatch');
    validated=epoch;checked=Date.now();
   }
  }catch(error){
   await o.stage('starting','ENGINE_SYNCHRONIZING');
   if(validated!==epoch)await o.ensureHosted(epoch);
   throw error;
  }
  await e.reconcile();
  if(!reserved){
   // A bridge-only or unpublished game cannot be silently discarded. The
   // authority's assignNext also checks the published previous result.
   const current=await e.node.readContract({address:e.app,abi:arenaAbi,functionName:'currentAdmission'});
   if(current[0]!==epoch)throw Error('Engine result epoch changed');
   if(current[1]){
    const [issued]=await r.lobby('ticketOf',[current[1]]);
    const known=await r.ratings('indexOf',[current[1]]);
    if(issued.arena.toLowerCase()!==e.app.toLowerCase()||issued.epoch!==epoch||!known
     ||current[2]!==issued.sequence||current[3]!==reusableAdmissionDigest(issued)){
     await o.stage('review','UNRESOLVED_ENGINE_ADMISSION');return;
    }
   }
   h.online=true;await o.stage('available');return;
  }
  const [ticket]=await r.lobby('ticketOf',[reserved]);
  if(ticket.arena.toLowerCase()!==e.app.toLowerCase()||ticket.epoch!==epoch)throw Error('Reservation belongs to another epoch');
  // Even after app admission is disabled, finish transporting already issued
  // tickets (or their expiry cancellation) so the participation can resolve.
  await o.admit(e);
  const live=await e.read();if(live.id!==reserved)throw Error('Hosted logical match mismatch');
  h.online=true;h.lastProgressAt=Date.now()-e.feed.progressAge(reserved);
  if(live.phase>=3){
   await o.stage('publishing');await results.archiveSlot(e);
   if(d.batchIndex>0n)await results.capture(reserved);
   return;
  }
  await o.stage(e.publicationFailure()?'publication-paused':live.phase===1?'countdown':'playing',e.publicationFailure()?'ENGINE_PUBLICATION_UNAVAILABLE':'');
 }
 return{observe};
}
