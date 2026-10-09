import {terminalReceiptRaces} from './terminal-receipt-evidence';
/** A late second delivery is not a second command. Preserve the rejected copy
 * in evidence, and classify it only with an earlier exact-hash receipt and a
 * verified outcome. Terminal reverts remain separate from successful commands.
 * Generic RPC, rate-limit and transport errors never qualify for this exemption. */
export function deliveryEvidence(
 submissions:readonly {at:string|number;observedAt?:number;hash?:string;error?:unknown;rpcError?:{message?:string};message?:string}[],
 receipts:readonly {hash?:string;status?:unknown;confirmedAt?:number;action?:string;revertName?:string}[],
 timings:readonly {stage:string;hash?:string;command?:string;startedAt?:number;timeOrigin?:number;ms?:number}[]=[],
){
 const at=(v:string|number)=>typeof v==='number'?v:Date.parse(v);
 const duplicateCopies:typeof submissions[number][]=[],reconciledCopies:typeof submissions[number][]=[],terminalCopies:typeof submissions[number][]=[],unresolved:typeof submissions[number][]=[];
 const terminal=terminalReceiptRaces(receipts,timings);
 for(const s of submissions){
  if(!s.error&&!s.rpcError)continue;
  const message=s.message??s.rpcError?.message??'';
  const duplicate=/^0x[\da-f]{64}$/i.test(s.hash??'')&&/\bnonce\s+\d+\s+too low\b/i.test(message);
  const prior=(r:typeof receipts[number])=>r.hash?.toLowerCase()===s.hash!.toLowerCase()
    &&Number.isFinite(r.confirmedAt)&&r.confirmedAt!<=(Number.isFinite(s.observedAt)?s.observedAt!:at(s.at));
  const confirmed=duplicate&&receipts.some(r=>['0x1','success'].includes(String(r.status))&&prior(r));
  // Network instrumentation can deliver its receipt callback after an HTTP
  // duplicate response, even though the actual sender already acknowledged the
  // exact hash. Require that earlier sender acknowledgment AND the matching
  // successful receipt within 500ms; a future receipt alone remains unresolved.
  const rejectedAt=Number.isFinite(s.observedAt)?s.observedAt!:at(s.at);
  const reconciled=duplicate&&receipts.some(r=>r.hash?.toLowerCase()===s.hash!.toLowerCase()
   &&['0x1','success'].includes(String(r.status))&&Number.isFinite(r.confirmedAt)
   &&r.confirmedAt!>=rejectedAt&&r.confirmedAt!-rejectedAt<=500)
   &&timings.some(t=>t.stage==='acknowledged'&&t.hash?.toLowerCase()===s.hash!.toLowerCase()
    &&Number.isFinite(t.startedAt)&&Number.isFinite(t.timeOrigin)&&Number.isFinite(t.ms)&&t.ms!>=0
    &&t.startedAt!+t.timeOrigin!+t.ms!<=rejectedAt&&rejectedAt-(t.startedAt!+t.timeOrigin!+t.ms!)<=500);
  // InvalidMatch at a verified terminal boundary remains a reverted command,
  // never a successful move. Its later identical copy may also be rejected.
  const ended=duplicate&&terminal.some(prior);
  (confirmed?duplicateCopies:reconciled?reconciledCopies:ended?terminalCopies:unresolved).push(s);
 }
 return {duplicateCopies,reconciledCopies,terminalCopies,unresolved};
}
