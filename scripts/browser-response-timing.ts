/** Browser network timestamps, not delayed Playwright callback timestamps.
 * Receipt confirmation uses the latest possible aligned end of the full body.
 * Invalid or unavailable wire timing cannot establish earlier receipt proof.
 */
export function browserResponseTiming(t:{startTime:number;requestStart:number;responseStart:number;responseEnd:number},
 observedAt:number,alignment:{offsetMs:number;uncertaintyMs:number}|undefined){
 if(!alignment||!Object.values(t).every(Number.isFinite)||!Number.isFinite(observedAt)
  ||!Number.isFinite(alignment.offsetMs)||!Number.isFinite(alignment.uncertaintyMs)
  ||alignment.uncertaintyMs<0||alignment.uncertaintyMs>5
  ||t.startTime<=0||t.requestStart<0||t.responseStart<t.requestStart||t.responseEnd<t.responseStart)return;
 const sentAt=t.startTime+t.requestStart+alignment.offsetMs;
 const confirmedAt=t.startTime+t.responseEnd+alignment.offsetMs+alignment.uncertaintyMs;
 if(confirmedAt>observedAt+alignment.uncertaintyMs||confirmedAt<sentAt)return;
 return {sentAt,confirmedAt,ms:t.responseEnd-t.requestStart,basis:'browser-response-body' as const};
}

/** Earliest aligned socket-error time: clock uncertainty must never make a
 * duplicate look as though it arrived after an otherwise unproven receipt. */
export function browserSocketErrorTiming(nativeAt:number,alignment:{offsetMs:number;uncertaintyMs:number}|undefined){
 if(!alignment||!Number.isFinite(nativeAt)||!Number.isFinite(alignment.offsetMs)
  ||!Number.isFinite(alignment.uncertaintyMs)||alignment.uncertaintyMs<0||alignment.uncertaintyMs>5)return;
 return nativeAt+alignment.offsetMs-alignment.uncertaintyMs;
}
