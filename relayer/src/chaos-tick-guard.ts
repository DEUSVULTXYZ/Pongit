/** Fast relayer guard for live rules-6 Chaos matches (interim, no contract change).
 *
 * A Chaos advance simulates the whole gap since the last successful advancing
 * command, and a force-grid state makes that gap expensive. Past 1.14 s (two
 * balls in the wind) to 1.41 s (one ball) of engine time, one command cannot pay
 * for it even at 30,000,000 gas (CHAOS_WIND_GAP_TOLERANCE_MS). It reverts, and
 * the match freezes. The 2 s maintenance loop only ticks after 1.5 s of silence,
 * so it can never rescue a grid state on its own.
 *
 * The guard is an in-memory check on the relayer's applied-event stream. It
 * sends nothing while anyone else advances the match. It ticks only after
 * CHAOS_GUARD_STALE_MS without observed progress, through the same publicTick
 * path as the maintenance loop: one persisted journal entry, one signer and one
 * serialized writer. From the node's last advance, its worst case is the stream
 * delivery, the threshold, one check interval, the nonce read and the send:
 * about 500 + 100 + 2 round trips, 840 ms at the VPS's 120 ms p50.
 */

/** No I/O per check (the feed is already in memory), so a short interval only
 * shortens the worst case; it does not add commands. */
export const CHAOS_GUARD_INTERVAL_MS=100;
/** Above the players' own cadence (primary: 300 ms after observed progress plus
 * a round trip), below every measured tolerance once the interval and a send are added. */
export const CHAOS_GUARD_STALE_MS=500;
/** A confirmed revert during a live match is almost certainly a freeze. Each
 * retry then executes about 30 M gas on the shared node, and the maintenance loop
 * keeps retrying every 2 s regardless, so the guard stands back. */
export const CHAOS_GUARD_REVERT_BACKOFF_MS=5000;
/** Transport failure, publication gate, closing arena: the journal keeps the
 * signed bytes and the next attempt resends them. Avoid a tight loop. */
export const CHAOS_GUARD_RETRY_BACKOFF_MS=1000;
/** The guard acts only on a recent maintenance verdict that commands may be
 * sent (delegation active, publication healthy, lifecycle playing or draining). */
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
 /** Backoff after this guard's own failed command. */
 blockedUntil:number;
};

/** True when the guard must tick this match now. Pure; the caller supplies state. */
export function chaosGuardDue(engine:ChaosGuardEngine,match:ChaosGuardMatch):boolean{
 if(!engine.enabled||!engine.streamConnected||!engine.writable||engine.cooldownMs>0)return false;
 // Live Chaos only. Offers, finished and cancelled matches, Classic matches and a
 // paused rally awaiting its serve never receive a guard tick.
 if(match.phase!==2||match.mode!==1||match.awaitingServe)return false;
 if(match.inFlight||engine.now<match.blockedUntil)return false;
 return match.progressAgeMs>=CHAOS_GUARD_STALE_MS;
}

/** publicTick's coalescing key. Shared so the in-flight check can never drift from it. */
export const publicCommandKey=(id:string,cancel:boolean,pressureHash?:string)=>`${id}:${cancel}:${pressureHash??'tick'}`;
/** Recovery of a pending journal entry is keyed under match '0' and may belong to any match. */
export function matchCommandInFlight(keys:Iterable<string>,id:string):boolean{
 for(const key of keys)if(key.startsWith(`${id}:`)||key.startsWith('0:'))return true;
 return false;
}

export function chaosGuardBackoffMs(error:unknown):number{
 const message=String((error as Error)?.message??error);
 // The journal resent an older entry instead of this tick; nothing of ours failed.
 if(/Previous engine command reconciled/.test(message))return 0;
 if(/Engine command reverted/.test(message))return CHAOS_GUARD_REVERT_BACKOFF_MS;
 return CHAOS_GUARD_RETRY_BACKOFF_MS;
}
