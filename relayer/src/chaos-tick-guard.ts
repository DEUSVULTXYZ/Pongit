/** Fast relayer guard for live rules-6 Chaos matches (interim, no contract change).
 *
 * A Chaos advance simulates the whole gap since the last successful advancing
 * command, and a force-grid state makes that gap expensive. Past 1.03 s (both
 * balls inside the gravity well, the worst state measured) to 1.41 s (one ball in
 * the wind) of engine time, one command cannot pay for it even at 30,000,000 gas
 * (CHAOS_GAP_TOLERANCE_MS in shared/engine-gas.ts). It reverts, and the match
 * freezes. The 2 s maintenance loop only ticks after 1.5 s of silence, so it can
 * never rescue a grid state on its own.
 *
 * The guard is an in-memory check on the relayer's applied-event stream. It
 * sends nothing while anyone else advances the match. It ticks only after
 * CHAOS_GUARD_STALE_MS without observed progress, through the same publicTick
 * path as the maintenance loop: one persisted journal entry, one signer and one
 * serialized writer. From the node's last advance, its worst case is the stream
 * delivery, the threshold, one check interval, the nonce read and the send:
 * 600 ms plus two round trips, 840 ms at the VPS's 120 ms p50. That fits the worst
 * measured tolerance (1,030 ms) up to a 215 ms round trip.
 *
 * Once a tick of a match has reverted with no progress observed since, the match
 * is frozen: every later tick needs more gas than the last (long gaps need about
 * 100 M). The guard then stays silent for that match, whoever's tick reverted,
 * until progress is observed or one of its ticks succeeds again (a node restart
 * that re-anchors the clock). The maintenance loop's own retries still reach the
 * contract's 30-minute cancel.
 */

/** No I/O per check (the feed is already in memory), so a short interval only
 * shortens the worst case; it does not add commands. */
export const CHAOS_GUARD_INTERVAL_MS=100;
/** Above the players' own cadence (primary: 300 ms after observed progress plus
 * a round trip), below every measured tolerance once the interval and a send are added. */
export const CHAOS_GUARD_STALE_MS=500;
/** Transport failure, refusal, publication gate, closing arena: the journal keeps
 * the signed bytes (or has retired refused ones) and the next attempt resends or
 * re-signs. Avoid a tight loop. */
export const CHAOS_GUARD_RETRY_BACKOFF_MS=1000;
/** The guard acts only on a recent maintenance verdict that commands may be
 * sent (delegation active, node not halted, publication healthy, lifecycle
 * playing or draining). */
export const CHAOS_GUARD_WRITABLE_MS=10_000;

export type ChaosGuardEngine={
 now:number;
 /** Rules-6 app with the applied-event stream enabled. */
 enabled:boolean;
 /** Progress ages come from the stream; without it they mean nothing. */
 streamConnected:boolean;
 writable:boolean;
 /** Remaining node Retry-After, shared with every other request. */
 cooldownMs:number;
};
export type ChaosGuardMatch={
 phase:number;
 mode:number;
 awaitingServe:boolean;
 progressAgeMs:number;
 /** Any relayer command for this match, or a journal recovery, is queued or in flight. */
 inFlight:boolean;
 /** Backoff after this guard's own failed attempt (transport, refusal). */
 blockedUntil:number;
 /** Time of the latest confirmed revert of a relayer tick for THIS match, from any
 * relayer path (guard, maintenance loop, journal recovery); 0 when none since its
 * last successful tick. */
 lastRevertAt:number;
};

/** A tick of this match reverted and nothing has advanced it since. */
export function chaosMatchFrozen(now:number,match:Pick<ChaosGuardMatch,'progressAgeMs'|'lastRevertAt'>){
 return match.lastRevertAt>0&&match.lastRevertAt>=now-match.progressAgeMs;
}

/** True when the guard must tick this match now. Pure; the caller supplies state. */
export function chaosGuardDue(engine:ChaosGuardEngine,match:ChaosGuardMatch):boolean{
 if(!engine.enabled||!engine.streamConnected||!engine.writable||engine.cooldownMs>0)return false;
 // Live Chaos only. Offers, finished and cancelled matches, Classic matches and a
 // paused rally awaiting its serve never receive a guard tick.
 if(match.phase!==2||match.mode!==1||match.awaitingServe)return false;
 if(match.inFlight||engine.now<match.blockedUntil)return false;
 // A frozen match only burns about 29 M gas of node execution per retry.
 if(chaosMatchFrozen(engine.now,match))return false;
 return match.progressAgeMs>=CHAOS_GUARD_STALE_MS;
}

/** publicTick's coalescing key. Shared so the in-flight check can never drift from it. */
export const publicCommandKey=(id:string,cancel:boolean,pressureHash?:string)=>`${id}:${cancel}:${pressureHash??'tick'}`;
/** Recovery of a pending journal entry is keyed under match '0' and may belong to any match. */
export function matchCommandInFlight(keys:Iterable<string>,id:string):boolean{
 for(const key of keys)if(key.startsWith(`${id}:`)||key.startsWith('0:'))return true;
 return false;
}

/** Records the latest tick outcome per match, from every relayer path. Keyed by
 * the match the executed command belongs to, never by the command that resolved it. */
export class ChaosTickOutcomes {
 private reverts=new Map<string,number>();
 record(matchId:string,action:string,outcome:'observed'|'failed',now:number){
  if(action!=='tick')return;
  if(outcome==='failed')this.reverts.set(matchId,now);else this.reverts.delete(matchId);
 }
 lastRevertAt(matchId:string){return this.reverts.get(matchId)??0;}
 retain(live:(matchId:string)=>boolean){for(const id of this.reverts.keys())if(!live(id))this.reverts.delete(id);}
 clear(){this.reverts.clear();}
}

/** Backoff after the guard's own publicTick failed. A confirmed revert of its own
 * tick needs none: the frozen rule silences the match until progress. A journal
 * entry of another command resolved in its place is not its failure. */
export function chaosGuardBackoffMs(error:unknown):number{
 const message=String((error as Error)?.message??error);
 if(/Previous engine command reconciled/.test(message))return 0;
 if(/Engine command reverted/.test(message))return 0;
 return CHAOS_GUARD_RETRY_BACKOFF_MS;
}
