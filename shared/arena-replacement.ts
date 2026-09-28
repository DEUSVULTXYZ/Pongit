/** When a pooled arena counts as dead, and how often it may be replaced. Shared by
 * the human pool (relayer) and the agent keeper. The contract picks arenas itself,
 * so one dead idle arena would otherwise hold every admission until its delegation
 * expires days later. Replacement is the ordinary close, release, seal and reopen. */
export const DEAD_ARENA_MS=15*60_000;
/** A freshly opened epoch can take minutes to build its node: never judge it earlier. */
export const DEAD_ARENA_MIN_EPOCH_SECONDS=1800n;
/** Replacements per arena per day before an operator has to look. */
export const DEAD_ARENA_MAX_REPLACEMENTS=2;
const DAY_MS=86_400_000;

/** The replacements that still count today, and whether one more is allowed. */
export function replacementBudget(history:readonly number[]|undefined,now:number,recoveredAt=0){
 if(!Number.isFinite(recoveredAt)||recoveredAt<0||recoveredAt>now)throw Error('Invalid verified recovery time');
 const recent=(history??[]).filter(at=>now-at<DAY_MS&&at>recoveredAt);
 return {recent,allowed:recent.length<DEAD_ARENA_MAX_REPLACEMENTS};
}

export type ArenaRecoveryWindow={epoch:string;since:number;firstBatches:string;lastAt:number};
/** One healthy poll cannot erase the incident budget. Require an uninterrupted
 * verified epoch for fifteen minutes and actual new publications in that epoch. */
export function verifiedRecovery(previous:ArenaRecoveryWindow|undefined,input:{epoch:bigint;batches:bigint;healthy:boolean;now:number}){
 if(!input.healthy)return{window:undefined,recoveredAt:undefined};
 const epoch=String(input.epoch),batches=String(input.batches);
 const window=!previous||previous.epoch!==epoch||input.now<previous.lastAt||input.now-previous.lastAt>30000
  ||input.batches<BigInt(previous.firstBatches)?{epoch,since:input.now,firstBatches:batches,lastAt:input.now}:{...previous,lastAt:input.now};
 return{window,recoveredAt:input.now-window.since>=DEAD_ARENA_MS&&input.batches>BigInt(window.firstBatches)?input.now:undefined};
}
