/** A hosted game node that cannot settle a batch halts for good. It keeps
 * answering reads and interlude_session, which has no halt field, so a
 * session-based check still sees an active, writable node. Only two signals show
 * the halt: /health reports `halted` with the reason, and every send is refused
 * before execution with "this session is over and the node is no longer accepting
 * transactions: batch N could not be settled (...)".
 *
 * Incident of 2026-09-18: batch 191 of the human arcade could not be settled at
 * 20:11 UTC and the relayer kept reporting online:true for the whole halt. */

export const ENGINE_HALTED_CODE='ENGINE_HALTED';
export const ENGINE_HALTED_MESSAGE='The game service has stopped accepting moves after a publication failure. Your arcade session and finished results are saved; play resumes after the operator recovers the service.';
/** The health read runs beside interlude_session in the relayer's 2 s maintenance
 * loop. A slow answer is treated as unknown, never as a halt. */
export const ENGINE_HEALTH_TIMEOUT_MS=2500;

/** Local verdict that the node is halted. It never carries a node refusal of its
 * own, so it can never retire a journaled command. */
export class EngineHalted extends Error {
 code=ENGINE_HALTED_CODE;source='interlude_rpc';status=503;retryMs=30000;retryAt=Date.now()+30000;
 constructor(){super(ENGINE_HALTED_MESSAGE);}
}
/** By code, not instanceof: web/ and the root package may load this module twice. */
export const isEngineHalted=(error:unknown)=>(error as {code?:unknown})?.code===ENGINE_HALTED_CODE;

export type EngineHealth={halted:string|null};
const MAX_REASON=240;
/** Node text for logs and operator status: no URL, raw transaction or long hex. */
export function boundedReason(text:string){
 return text.replace(/https?:\/\/\S+/g,'[node]').replace(/0x[0-9a-fA-F]{64,}/g,'[hex omitted]').replace(/\s+/g,' ').trim().slice(0,MAX_REASON);
}
/** A /health body. undefined when it is not a report this code understands. */
export function engineHealth(body:unknown):EngineHealth|undefined{
 if(!body||typeof body!=='object'||!('halted' in body))return undefined;
 const value=(body as {halted:unknown}).halted;
 if(value===null||value===false||value===undefined||value==='')return {halted:null};
 if(value===true)return {halted:'halted'};
 if(typeof value==='string')return {halted:boundedReason(value)||'halted'};
 if(typeof value==='object')return {halted:boundedReason(JSON.stringify(value))||'halted'};
 return undefined;
}
/** Never throws. A failed, slow, rate-limited or unreadable health read is unknown:
 * it neither marks the node halted nor clears an earlier halt. */
export async function readEngineHealth(node:string,o:{fetch?:typeof fetch;timeoutMs?:number}={}):Promise<EngineHealth|undefined>{
 try{
  const response=await (o.fetch??fetch)(`${node.replace(/\/+$/,'')}/health`,{signal:AbortSignal.timeout(o.timeoutMs??ENGINE_HEALTH_TIMEOUT_MS)});
  return engineHealth(await response.json());
 }catch{return undefined;}
}

/** The node's own words, through viem and SDK wrappers (details, short message,
 * message, cause). Local wrappers without a node cause contribute only their own
 * message, which never matches the patterns below. */
function nodeText(error:unknown){
 const parts:string[]=[];
 for(let e=error as any,n=0;e&&n<8;e=e.cause,n++){
  if(typeof e!=='object'){parts.push(String(e));break;}
  parts.push(String(e.details??''),String(e.shortMessage??''),String(e.message??''));
 }
 return parts.join(' ');
}
/** Refusals the node returns without executing the transaction: the gas cap, the
 * generic "rejected before execution", and a halted node. A refusal alone never
 * proves the nonce is free; callers also require the node's latest transaction
 * count to equal the command's nonce. "commit relay failed" alone is not listed:
 * it describes a batch, not this transaction. */
const REFUSED_BEFORE_EXECUTION=/rejected before execution|gas limit is greater than the cap|this session is over|no longer accepting transactions/i;
const HALT_REFUSAL=/this session is over|no longer accepting transactions/i;
export const refusedBeforeExecution=(error:unknown)=>REFUSED_BEFORE_EXECUTION.test(nodeText(error));
export const haltRefusal=(error:unknown)=>HALT_REFUSAL.test(nodeText(error));
/** The refusal sentence only, for logs. */
export function refusalReason(error:unknown){
 const text=nodeText(error),match=REFUSED_BEFORE_EXECUTION.exec(text);
 if(!match)return '';
 return boundedReason(text.slice(Math.max(0,match.index-40)));
}
