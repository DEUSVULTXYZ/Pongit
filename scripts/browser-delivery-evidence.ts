/** A late second delivery is not a second command. Preserve the rejected copy
 * in evidence, and exempt it only with an earlier successful exact-hash receipt.
 * Generic RPC, rate-limit and transport errors never qualify for this exemption. */
export function deliveryEvidence(
 submissions:readonly {at:string|number;observedAt?:number;hash?:string;error?:unknown;rpcError?:{message?:string};message?:string}[],
 receipts:readonly {hash?:string;status?:unknown;confirmedAt?:number}[],
){
 const at=(v:string|number)=>typeof v==='number'?v:Date.parse(v);
 const duplicateCopies:typeof submissions[number][]=[],unresolved:typeof submissions[number][]=[];
 for(const s of submissions){
  if(!s.error&&!s.rpcError)continue;
  const message=s.message??s.rpcError?.message??'';
  const confirmed=/^0x[\da-f]{64}$/i.test(s.hash??'')&&/\bnonce\s+\d+\s+too low\b/i.test(message)
   &&receipts.some(r=>r.hash?.toLowerCase()===s.hash!.toLowerCase()&&['0x1','success'].includes(String(r.status))
    &&Number.isFinite(r.confirmedAt)&&r.confirmedAt!<=(Number.isFinite(s.observedAt)?s.observedAt!:at(s.at)));
  (confirmed?duplicateCopies:unresolved).push(s);
 }
 return {duplicateCopies,unresolved};
}
