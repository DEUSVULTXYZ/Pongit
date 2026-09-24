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
export function replacementBudget(history:readonly number[]|undefined,now:number){
 const recent=(history??[]).filter(at=>now-at<DAY_MS);
 return {recent,allowed:recent.length<DEAD_ARENA_MAX_REPLACEMENTS};
}
