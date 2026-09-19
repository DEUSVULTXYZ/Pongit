import {parseAbi,zeroHash,type Abi,type Hex,type PublicClient} from 'viem';
import {roomsEventsAbi} from '../../shared/abi-PongChaosEvents';
import {roomsRealtimeAbi} from '../../shared/abi-PongRoomsRealtime';
import {roomsChaosAbi} from '../../shared/abi-PongRoomsTestnet';
import type {RoomsFinanceManifest} from './rooms-finance-config';

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

export type Deferred={id:string;verdict:'unpublished'|'unmarketed'};
/** One finalizing pass over terminal results, in order. Finalized results are
 * passed over; results finalizeResult cannot accept yet are deferred, never
 * submitted, so an unpublished result cannot hold the renewal that is the only
 * way for it to end. The first result that can be finalized now (or will be in
 * seconds) is returned. Read failures propagate: an RPC error never defers. */
export async function nextFinalization(ids:readonly string[],o:{finalStatus:(id:string)=>Promise<number>;published:(id:string)=>Promise<PublishedResult>}){
 const deferred:Deferred[]=[];
 for(const id of ids){
  if(await o.finalStatus(id)!==0)continue;
  const verdict=finalizationVerdict(await o.published(id));
  if(verdict==='unpublished'||verdict==='unmarketed'){deferred.push({id,verdict});continue;}
  return {next:{id,verdict},deferred};
 }
 return {next:undefined,deferred};
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
 return m.rulesVersion===6?roomsEventsAbi:m.betting==='realtime'?roomsRealtimeAbi:roomsChaosAbi;
}
/** Monad reads for nextFinalization, at the latest block. */
export function publishedResultReader(base:PublicClient,m:Pick<RoomsFinanceManifest,'app'|'adapter'|'rulesVersion'|'betting'|'settlement'>){
 // ChaosEventsSettlement (rules 6) and RoomsRealtimeSettlement (rules 5) both
 // check the game's finishedAt; both are realtime betting.
 const timed=m.rulesVersion===6||m.betting==='realtime',early=m.settlement==='early-published-testnet',gameAbi=financeGameAbi(m);
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
