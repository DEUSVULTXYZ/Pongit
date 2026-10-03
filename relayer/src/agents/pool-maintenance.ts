import {zeroAddress,zeroHash,type Abi,type Address} from 'viem';
import {agentCatalogAbi as catalogAbi} from '../../../shared/abi-AgentCatalog';
import {agentQualificationsAbi as qualificationAbi} from '../../../shared/abi-AgentQualifications';
import {agentChallengesAbi as challengeAbi} from '../../../shared/abi-AgentChallenges';
import {abi as familyAbi} from '../../../shared/abi-independent-ArcadeFamily';
import {agentTournamentsAbi as bookAbi} from '../../../shared/abi-AgentTournaments';
import {agentArenaPoolAbi as poolAbi} from '../../../shared/abi-AgentArenaPool';
import {houseInstanceAbi} from '../../../shared/agent-house-instances';
import {hostedControl,LEGACY_HOSTED_HUB} from '../../../shared/hosted-control';

export type PoolRead=<T=any>(address:Address,abi:Abi,fn:string,args?:readonly unknown[])=>Promise<T>;

/** Background expiry/qualification pages do not belong on every admission
 * cycle. A failed page stays due; restart starts with a fresh inspection. This
 * schedule never gates player admission or replaces contract eligibility. */
export function inspectionSchedule(now=Date.now,intervalMs=10_000){
 const next=new Map<'expiry'|'qualification',number>();
 return{due:(task:'expiry'|'qualification')=>now()>=(next.get(task)??0),
  completed:(task:'expiry'|'qualification')=>{next.set(task,now()+intervalMs);}};
}

/** Reads pinned to one block are pure functions of their call. Memoize them for
 * one keeper step and let independent reads start together, so a batched client
 * serves the common path in one multicall instead of dozens of sequential round
 * trips through the paced RPC gateway. Every write ends the step, so no read can
 * observe state changed after it was cached. A rejected read is evicted and a
 * later caller retries it exactly as before. */
export function pinnedReads(load:(address:Address,abi:Abi,functionName:string,args:readonly unknown[])=>Promise<unknown>){
 const memo=new Map<string,Promise<unknown>>();
 const key=(address:Address,functionName:string,args:readonly unknown[])=>address.toLowerCase()+'|'+functionName+'|'+JSON.stringify(args,(_,v)=>
  typeof v==='bigint'?{bigint:String(v)}:typeof v==='string'&&/^0x[\da-f]{40}$/i.test(v)?v.toLowerCase():v);
 const read=<T=any>(address:Address,abi:Abi,functionName:string,args:readonly unknown[]=[]):Promise<T>=>{
  const k=key(address,functionName,args),cached=memo.get(k);if(cached)return cached as Promise<T>;
  const pending=load(address,abi,functionName,args);memo.set(k,pending);
  pending.catch(()=>{if(memo.get(k)===pending)memo.delete(k);});
  return pending as Promise<T>;
 };
 const prefetch=(address:Address,abi:Abi,functionName:string,args:readonly unknown[]=[])=>{read(address,abi,functionName,args).catch(()=>{});};
 return{read,prefetch};
}
/** Voluntary rotations require the control plane for this exact hub. A missing
 * session is normal, but authorization, throttling or server errors do not prove
 * that the next epoch can be hosted. This is not a publication certificate. */
export async function controlPlaneAnswers(app:Address,transport:typeof fetch=fetch,timeoutMs=5000,hub:Address=LEGACY_HOSTED_HUB){
 try{
  const origin=await hostedControl(hub,transport);
  const response=await transport(`${origin}/sessions/${app}`,{signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
  await response.body?.cancel().catch(()=>{});return response.ok||response.status===404;
 }catch{return false;}
}
/** The shared operator key was busy with another transaction (a sponsored player
 * action, usually): nothing was signed, so the next step may simply try again. */
export function operatorBusy(error:unknown){
 return /Operator is busy|Reconcile the existing operator transaction first|Operator nonce is in use/.test(String((error as any)?.message??error));
}
/** Cooldown after a failed keeper write: short when only the operator was busy,
 * long for a revert or anything that needs the situation to change first. */
export const writeRetryMs=(error:unknown)=>operatorBusy(error)?3000:30000;
/** The contract records the minute after completion. Publication/capacity
 * guards can hold admission, but must not silently insert a multi-day gap. */
export function tournamentDue(_last:{startedAt:bigint}|null,nextAt:bigint,now:bigint,allowNew=true){
 return allowNew&&now>=nextAt;
}
type Common={catalog:Address;qualifications:Address;challenges:Address;family:Address;tournaments:Address;pool:Address;houseInstances?:'official-v1'};

/** Capture clears the active lane. Recover its tournament work from the durable
 * pool record before the slower historical scan, including after a restart. */
export async function capturedTournamentWork(read:PoolRead,m:Common,record:any){
 if(!record.captured||!record.tournament||!record.ref.id)return null;
 const f=await read(m.tournaments,bookAbi,'fixture',[record.tournament,record.fixture]);
 if(!f.bound||f.ref.chainId!==record.ref.chainId||f.ref.epoch!==record.ref.epoch||f.ref.id!==record.ref.id
  ||f.ref.arena.toLowerCase()!==record.ref.arena.toLowerCase())return null;
 const result=await read(m.pool,poolAbi,'result',[record.ref]);
 if(result.hash!==f.published.hash||result.finality!==f.published.finality||result.status!==f.published.status)
  return{to:m.tournaments,method:'synchronize',args:[record.tournament,record.fixture]};
 if(!f.resolved&&result.status===4&&result.finality)
  return{to:m.tournaments,method:'retryCancelled',args:[record.tournament,record.fixture]};
 return null;
}

/** A published cancellation cannot be retried until its epoch is final. This
 * is settlement, not a voluntary rotation: waiting for engine discovery or a
 * long lease to expire deadlocks the bracket. The caller supplies the owned
 * arena and all lane reservations from the same pinned block. Normal closure
 * rechecks settlement on-chain; it cannot discard an unpublished active game. */
export async function cancelledTournamentClosure(read:PoolRead,m:Common,fixture:any,
 arena:{app:Address;epoch:bigint;status:number;occupied:boolean}){
 const ref=fixture.ref,published=fixture.published;
 if(!fixture.bound||fixture.resolved||published.status!==4||published.finality||!ref.id
  ||arena.status!==1||arena.occupied||arena.epoch!==ref.epoch||arena.app.toLowerCase()!==ref.arena.toLowerCase())return null;
 const record=await read(m.pool,poolAbi,'record',[ref]);
 if(!record.captured||record.ref.chainId!==ref.chainId||record.ref.epoch!==ref.epoch||record.ref.id!==ref.id
  ||record.ref.arena.toLowerCase()!==ref.arena.toLowerCase())return null;
 const result=await read(m.pool,poolAbi,'result',[ref]);
 if(result.status!==4||result.finality||result.hash!==published.hash)return null;
 return{to:m.pool,method:'closeReusableArena',args:[arena.app]};
}

/** Resumable inspection of the entire catalogue, without a first-256 cutoff.
 * This never chooses the trial participants; the contract cursor does that. */
export async function qualificationWork(read:PoolRead,m:Common,cursor:bigint,now:bigint,budget=16,baseBlock?:bigint){
 if(!Number.isInteger(budget)||budget<1||budget>32)throw Error('Qualification inspection budget');
 const count=await read<bigint>(m.catalog,catalogAbi,'count');if(!count)return{needed:false,next:0n};
 let at=cursor%count;
 const page:Promise<{agent:Address;identity:any;known:boolean;next:bigint}>[]=[];
 for(let n=0;n<budget&&BigInt(n)<count;n++){
  const index=at,next=(at+1n)%count;at=next;
  // Independent entries share one block and can use the keeper's multicall.
  // Consume them in cursor order; a later failed read cannot invalidate an
  // earlier eligible candidate, nor cause an unhandled promise rejection.
  const load=(async()=>{const agent=await read<Address>(m.catalog,catalogAbi,'at',[index]);
   const identity=await read(m.catalog,catalogAbi,'identity',[agent]);
   const known=baseBlock===undefined||identity.house||await read<bigint>(m.catalog,catalogAbi,'registeredBlock',[agent])<=baseBlock;
   return{agent,identity,known:!!known,next};})();
  load.catch(()=>{});page.push(load);
 }
 for(const pending of page){
  const {agent,identity,known,next}=await pending;at=next;
  if(!known)continue;
  for(const mode of [0,1])if(identity.available&&(identity.modes&(1<<mode))&&!(identity.qualified&(1<<mode))){
   if(await read<bigint>(m.qualifications,qualificationAbi,'retryAt',[agent,mode])>now)continue;
   if(!await read<boolean>(m.catalog,catalogAbi,'qualificationEligible',[agent,mode]))continue;
   // The contract needs an available house opponent, not just a candidate.
   // Otherwise it only advances its scan cursor and burns sponsor transactions
   // while every house identity is reserved by a tournament.
   for(let j=0;j<8;j++){
    const opponent=await read<Address>(m.catalog,catalogAbi,'house',[(j+2)%8]);
    if(opponent!==zeroAddress&&opponent.toLowerCase()!==agent.toLowerCase()
     &&await (m.houseInstances?read<boolean>(m.qualifications,houseInstanceAbi,'opponentEligible',[opponent,mode])
      :read<boolean>(m.catalog,catalogAbi,'qualificationEligible',[opponent,mode])))return{needed:true,next:at};
   }
  }
 }
 return{needed:false,next:at};
}

/** A revoked/expired waiting grant frees the queue, never an active match.
 * Revalidate on-chain in expire(); an RPC error must not be treated as expiry. */
export async function expiredChallenge(read:PoolRead,m:Common,cursor:bigint,budget=8){
 if(!Number.isInteger(budget)||budget<1||budget>32)throw Error('Challenge inspection budget');
 const count=await read<bigint>(m.challenges,challengeAbi,'count');if(!count)return{expired:null,next:1n};
 let at=cursor>=1n&&cursor<=count?cursor:1n;
 // The scan order is fixed by the cursor, so start every request read together
 // and consume them in that order: same first match, same next cursor, one
 // batched round trip instead of one per inspected challenge.
 const scan:{id:bigint;next:bigint}[]=[];
 for(let n=0;n<budget&&BigInt(n)<count;n++){const id=at;at=at===count?1n:at+1n;scan.push({id,next:at});}
 const requests=scan.map(({id})=>read(m.challenges,challengeAbi,'requests',[id]));
 for(const request of requests)request.catch(()=>{});
 for(let i=0;i<scan.length;i++){
  // Solidity's public mapping getter returns the tuple in ABI order.
  const [player,,,status,,expected]=await requests[i];
  if(status!==1)continue;
  const grant=await read(m.family,familyAbi,'grantOf',[player]);
  if(grant.key===zeroAddress||await read(m.family,familyAbi,'grantDigest',[grant])!==expected)return{expired:scan[i].id,next:scan[i].next};
 }
 return{expired:null,next:at};
}

export async function historicalRepairWork(read:PoolRead,m:Common,id:bigint,t:any,idle:bigint,laneFree:boolean){
 if(!idle||!laneFree)return null;
 if(t.status===4){
  // A newer tournament/challenge owns its locks until it finishes. Frozen
  // controllers also cannot silently be replaced while repairing history.
  for(let i=0;i<8;i++){
   if(!await read<boolean>(m.catalog,catalogAbi,'eligible',[t.agents[i],t.mode]))return null;
   if((await read(m.catalog,catalogAbi,'identity',[t.agents[i]])).codeHash!==t.controllers[i])return null;
  }
  return{to:m.tournaments,method:'resumeRepair',args:[id]};
 }
 if(t.status===2){
  const [index,a,b]=await read(m.tournaments,bookAbi,'nextFixture',[id]);
  if(index!==255&&await read(m.pool,poolAbi,'playing',[a])===zeroHash&&await read(m.pool,poolAbi,'playing',[b])===zeroHash)
   return{to:m.pool,method:'admitTournament',args:[id]};
 }
 return null;
}
