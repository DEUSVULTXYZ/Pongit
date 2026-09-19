import {parseAbi,zeroHash,type Abi,type Hex,type PublicClient} from 'viem';
import {roomsEventsAbi} from '../../shared/abi-PongChaosEvents';
import {roomsRealtimeAbi} from '../../shared/abi-PongRoomsRealtime';
import {roomsChaosAbi} from '../../shared/abi-PongRoomsTestnet';
import type {RoomsFinanceManifest} from './rooms-finance-config';
import {isChaosEventsRules} from '../../shared/chaos-rules';

/** What the market adapter's finalizeResult(id) checks, read from Monad.
 *
 * RoomsMarketAdapter and its subclasses RoomsEarlySettlement,
 * RoomsRealtimeSettlement and ChaosEventsSettlement require, on Monad's PUBLISHED
 * state (contracts/src/labs/RoomsMarketAdapter.sol, RoomsEarlySettlement.sol,
 * RoomsRealtimeSettlement.sol, contracts/src/chaos/ChaosEventsSettlement.sol):
 * - finalResults[id].status == 0 ("already final");
 * - the game's published snapshot in phase 3 or 4 and resultHashes(id) != 0
 *   ("result pending");
 * - early settlement: matchEpoch[id] > 0 ("unknown match epoch"), which only
 *   openRound sets while the match is live, so a match that never had a round can
 *   never be finalized, and could never take a bet either;
 * - realtime betting (rules 5 and 6): finishedAt(id) > 0 and <= block.timestamp
 *   ("result timestamp pending").
 * The delegation checks (status None for the base adapter; not Challenged, and the
 * match's epoch while a delegation is active, for early settlement) hold in the
 * lifecycle's finalizing stage, which runs only after releaseStake. */
export type PublishedResult={
 phase:number;
 resultHash:Hex;
 /** realtime betting (rules 5 and 6) only */
 finishedAt?:bigint;
 /** early settlement only */
 matchEpoch?:bigint;
 /** Latest Monad block timestamp, for finishedAt. */
 now:bigint;
};
export type FinalizationVerdict='ready'|'wait'|'unpublished'|'unmarketed';

export function finalizationVerdict(r:PublishedResult):FinalizationVerdict{
 // Still live (or not even started) in Monad's published state: the epoch closed
 // before its result was published. It resumes on the next epoch's node, which
 // starts from this published state, and can only end there.
 if((r.phase!==3&&r.phase!==4)||r.resultHash===zeroHash)return 'unpublished';
 if(r.matchEpoch!==undefined&&r.matchEpoch===0n)return 'unmarketed';
 if(r.finishedAt!==undefined){
  if(r.finishedAt===0n)return 'unpublished';
  // Node and Monad clocks differ by seconds: wait, do not defer to a later epoch.
  if(r.finishedAt>r.now)return 'wait';
 }
 return 'ready';
}

export type Deferred={id:string;verdict:'unpublished'|'unmarketed'|'unreadable'};
export type FinalizationFailure={id:string;error:string};
/** Consecutive passes whose reads of one result failed before that result stops
 * holding the renewal. At the lifecycle's 10 s cycle, about one minute. */
export const FINALIZATION_READ_ATTEMPTS=6;

/** What earlier passes learnt, so a result is not read again every cycle forever.
 * - Finalized (finalResults status non-zero) and unmarketed (published terminal,
 *   matchEpoch 0) are permanent: an adapter never un-finalizes, and a round can
 *   only be opened, setting matchEpoch, while the match is live. Such a result is
 *   never read again by this process.
 * - Unpublished is permanent within one scope (the lifecycle passes its epoch):
 *   nothing is published between the hub's release and the next epoch's first
 *   batch. It is read again in a later scope.
 * - Read failures are counted per result and scope; after
 *   FINALIZATION_READ_ATTEMPTS consecutive failing passes the result is deferred
 *   as 'unreadable', and a later scope tries it again. */
export class FinalizationMemory {
 private settled=new Set<string>();
 private unpublished=new Map<string,string>();
 private failures=new Map<string,{scope:string;count:number}>();
 known(id:string,scope:string):'settled'|'unpublished'|'unreadable'|undefined{
  if(this.settled.has(id))return 'settled';
  if(this.unpublished.get(id)===scope)return 'unpublished';
  const f=this.failures.get(id);
  if(f&&f.scope===scope&&f.count>=FINALIZATION_READ_ATTEMPTS)return 'unreadable';
  return undefined;
 }
 settle(id:string){this.settled.add(id);this.unpublished.delete(id);this.failures.delete(id);}
 defer(id:string,scope:string){this.unpublished.set(id,scope);this.failures.delete(id);}
 /** The consecutive failure count of this result in this scope, this one included. */
 failed(id:string,scope:string){
  const last=this.failures.get(id),count=last?.scope===scope?last.count+1:1;
  this.failures.set(id,{scope,count});return count;
 }
 succeeded(id:string){this.failures.delete(id);}
}

const failureText=(e:unknown)=>String((e as Error)?.message??e).split('\n')[0].replace(/https?:\S+/g,'[rpc]').slice(0,160);

/** One finalizing pass over terminal results, in order. Finalized results are
 * passed over; results finalizeResult cannot accept yet are deferred, never
 * submitted, so an unpublished result cannot hold the renewal that is the only
 * way for it to end. The first result that can be finalized now (or will be in
 * seconds) is returned.
 *
 * A read failure is never a deferral by itself, and it never ends the pass: the
 * pass goes on to the next result, so one failing read cannot keep every later
 * result from being finalized. It is reported in `failed`, and the caller
 * retries before renewing. After FINALIZATION_READ_ATTEMPTS failing passes in a
 * row the result is deferred as 'unreadable' instead, so one result Monad cannot
 * answer for does not hold the renewal forever (its bettors are then paid by a
 * later epoch's pass). */
export async function nextFinalization(ids:readonly string[],o:{finalStatus:(id:string)=>Promise<number>;published:(id:string)=>Promise<PublishedResult>},
 memory:FinalizationMemory=new FinalizationMemory(),scope=''){
 const deferred:Deferred[]=[],failed:FinalizationFailure[]=[];
 for(const id of ids){
  const known=memory.known(id,scope);
  if(known==='settled')continue;
  if(known){deferred.push({id,verdict:known});continue;}
  let verdict:FinalizationVerdict;
  try{
   if(await o.finalStatus(id)!==0){memory.settle(id);continue;}
   verdict=finalizationVerdict(await o.published(id));
   memory.succeeded(id);
  }catch(e){
   if(memory.failed(id,scope)>=FINALIZATION_READ_ATTEMPTS)deferred.push({id,verdict:'unreadable'});
   else failed.push({id,error:failureText(e)});
   continue;
  }
  if(verdict==='unmarketed'){memory.settle(id);deferred.push({id,verdict});continue;}
  if(verdict==='unpublished'){memory.defer(id,scope);deferred.push({id,verdict});continue;}
  return {next:{id,verdict},deferred,failed};
 }
 return {next:undefined,deferred,failed};
}

const adapterReads=parseAbi([
 'function finalResults(uint256) view returns(address a,address b,address winner,uint8 status,bytes32 hash)',
 'function matchEpoch(uint256) view returns(uint256)',
]);
const gameReads=parseAbi([
 'function resultHashes(uint256) view returns(bytes32)',
 'function finishedAt(uint256) view returns(uint64)',
]);
/** The game ABI whose getSnapshot this finance deployment's adapter decodes. */
export function financeGameAbi(m:Pick<RoomsFinanceManifest,'rulesVersion'|'betting'>):Abi{
 return isChaosEventsRules(m.rulesVersion)?roomsEventsAbi:m.betting==='realtime'?roomsRealtimeAbi:roomsChaosAbi;
}
/** Monad reads for nextFinalization, at the latest block. */
export function publishedResultReader(base:PublicClient,m:Pick<RoomsFinanceManifest,'app'|'adapter'|'rulesVersion'|'betting'|'settlement'>){
 // ChaosEventsSettlement (rules 6) and RoomsRealtimeSettlement (rules 5) both
 // check the game's finishedAt; both are realtime betting.
 const timed=isChaosEventsRules(m.rulesVersion)||m.betting==='realtime',early=m.settlement==='early-published-testnet',gameAbi=financeGameAbi(m);
 return {
  finalStatus:async(id:string)=>Number((await base.readContract({address:m.adapter,abi:adapterReads,functionName:'finalResults',args:[BigInt(id)]}))[3]),
  published:async(id:string):Promise<PublishedResult>=>{
   const n=BigInt(id);
   const [snapshot,resultHash,finishedAt,matchEpoch,block]=await Promise.all([
    base.readContract({address:m.app,abi:gameAbi,functionName:'getSnapshot',args:[n]}) as Promise<readonly unknown[]>,
    base.readContract({address:m.app,abi:gameReads,functionName:'resultHashes',args:[n]}),
    timed?base.readContract({address:m.app,abi:gameReads,functionName:'finishedAt',args:[n]}):Promise.resolve(undefined),
    early?base.readContract({address:m.adapter,abi:adapterReads,functionName:'matchEpoch',args:[n]}):Promise.resolve(undefined),
    timed?base.getBlock({blockTag:'latest'}):Promise.resolve(undefined),
   ]);
   return {phase:Number(snapshot[2]),resultHash:resultHash as Hex,finishedAt:finishedAt===undefined?undefined:BigInt(finishedAt),
    matchEpoch:matchEpoch===undefined?undefined:BigInt(matchEpoch),now:block?.timestamp??0n};
  },
 };
}
export type PublishedResultReader=ReturnType<typeof publishedResultReader>;
/** For logs: stable key of a deferred set, so a stuck pass logs once. */
export const deferredKey=(deferred:readonly Deferred[])=>deferred.map(d=>`${d.id}:${d.verdict}`).join(',');
