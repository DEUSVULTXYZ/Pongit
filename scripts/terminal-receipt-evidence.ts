/** The client emits terminal only after its journal clears and a fresh live
 * read verifies the same match/epoch is over. Never infer this from a score. */
export function terminalReceiptRaces(receipts:readonly {hash?:string;action?:string;status?:unknown;revertName?:string}[],
 timings:readonly {stage:string;hash?:string;command?:string}[]) {
 return receipts.filter(r=>['0x0','reverted'].includes(String(r.status))&&r.revertName==='InvalidMatch'
  &&['input','heartbeat'].includes(r.action??'')&&/^0x[\da-f]{64}$/i.test(r.hash??'')
  &&timings.some(t=>t.stage==='terminal'&&t.command===r.action&&t.hash?.toLowerCase()===r.hash?.toLowerCase()));
}
