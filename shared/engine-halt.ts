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
/** Never claims that finished results are saved: a batch the node could not
 * settle is lost with its epoch, and the matches it ended resume in the next one
 * from their last published state. */
export const ENGINE_HALTED_MESSAGE='The game service has stopped accepting moves after a publication failure. Your arcade session is saved. Matches whose results were not yet published resume from their last published state once the operator recovers the service.';
/** The node refuses commands signed with the configured gas limit
 * ("transaction gas limit is greater than the cap", in any of the wordings of
 * GAS_CAP_REFUSAL below). Every command would be
 * refused the same way, so the arena is unavailable until the operator lowers
 * the limit (ROOMS_ENGINE_COMMAND_GAS, shared/engine-gas.ts) or the next epoch. */
export const ENGINE_GAS_CAP_CODE='ENGINE_GAS_CAP';
export const ENGINE_GAS_CAP_MESSAGE='The game service is refusing moves at the current command size. Play is paused until the operator adjusts it. Your arcade session is saved.';
/** The relayer reads /health on its own schedule, never inside the 2 s maintenance
 * loop, and each read has this timeout. A slow answer is unknown, never a halt. */
export const ENGINE_HEALTH_TIMEOUT_MS=2500;
export const ENGINE_HEALTH_INTERVAL_MS=5000;

/** Local verdict that the node is halted. It never carries a node refusal of its
 * own, so it can never retire a journaled command. */
export class EngineHalted extends Error {
 code=ENGINE_HALTED_CODE;source='interlude_rpc';status=503;retryMs=30000;retryAt=Date.now()+30000;
 constructor(){super(ENGINE_HALTED_MESSAGE);}
}
/** Local verdict that the node refuses the configured command gas. Like
 * EngineHalted, it carries no node refusal and never retires a journaled command. */
export class EngineGasCapped extends Error {
 code=ENGINE_GAS_CAP_CODE;source='interlude_rpc';status=503;retryMs=30000;retryAt=Date.now()+30000;
 constructor(){super(ENGINE_GAS_CAP_MESSAGE);}
}
/** By code, not instanceof: web/ and the root package may load this module twice. */
export const isEngineHalted=(error:unknown)=>(error as {code?:unknown})?.code===ENGINE_HALTED_CODE;
export const isEngineGasCapped=(error:unknown)=>(error as {code?:unknown})?.code===ENGINE_GAS_CAP_CODE;

/** A /health report. `app` and `epoch` are the node session's own, when it says so. */
export type EngineHealth={halted:string|null;app?:string;epoch?:number};
const MAX_REASON=240;
/** Node text for logs and operator status: no URL, raw transaction or long hex. */
export function boundedReason(text:string){
 return text.replace(/https?:\/\/\S+/g,'[node]').replace(/0x[0-9a-fA-F]{64,}/g,'[hex omitted]').replace(/\s+/g,' ').trim().slice(0,MAX_REASON);
}
function healthSession(body:object){
 const {app,epoch}=body as {app?:unknown;epoch?:unknown};
 const session:{app?:string;epoch?:number}={};
 if(typeof app==='string'&&/^0x[0-9a-fA-F]{40}$/.test(app))session.app=app.toLowerCase();
 const n=typeof epoch==='number'?epoch:typeof epoch==='string'&&/^\d{1,15}$/.test(epoch)?Number(epoch):NaN;
 if(Number.isSafeInteger(n)&&n>=0)session.epoch=n;
 return session;
}
/** A /health body. undefined when it is not a report this code understands. */
export function engineHealth(body:unknown):EngineHealth|undefined{
 if(!body||typeof body!=='object'||!('halted' in body))return undefined;
 const value=(body as {halted:unknown}).halted,session=healthSession(body);
 if(value===null||value===false||value===undefined||value==='')return {halted:null,...session};
 if(value===true)return {halted:'halted',...session};
 if(typeof value==='string')return {halted:boundedReason(value)||'halted',...session};
 if(typeof value==='object')return {halted:boundedReason(JSON.stringify(value))||'halted',...session};
 return undefined;
}
/** A report about another application or another epoch says nothing about the
 * session the relayer serves: a renewed node answering at the same URL, or a
 * previous session's report arriving late. A report that does not name them is
 * taken as the session's own (older node builds). */
export function healthApplies(report:EngineHealth,session:{app:string;epoch:number}){
 if(report.app!==undefined&&report.app!==session.app.toLowerCase())return false;
 if(report.epoch!==undefined&&report.epoch!==session.epoch)return false;
 return true;
}
type Gate=<T>(send:()=>Promise<T>)=>Promise<T>;
/** Never throws. A failed, slow, rate-limited or unreadable health read is unknown:
 * it neither marks the node halted nor clears an earlier halt.
 *
 * `gate` is the node's shared request gate (shared/engine-transport.ts): while
 * its Retry-After runs the read is refused locally, and a 429 from /health
 * extends the same cooldown for every other request. */
export async function readEngineHealth(node:string,o:{fetch?:typeof fetch;timeoutMs?:number;gate?:Gate}={}):Promise<EngineHealth|undefined>{
 const gate:Gate=o.gate??(send=>send());
 try{
  return await gate(async()=>{
   const response=await (o.fetch??fetch)(`${node.replace(/\/+$/,'')}/health`,{signal:AbortSignal.timeout(o.timeoutMs??ENGINE_HEALTH_TIMEOUT_MS)});
   if(response.status===429){
    await response.body?.cancel().catch(()=>{});
    throw Object.assign(new Error('The game node is limiting requests.'),{status:429,code:'ENGINE_RATE_LIMIT',source:'interlude_rpc',headers:response.headers});
   }
   return engineHealth(await response.json());
  });
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
/** Only two refusals retire a journaled command, and only with the nonce check
 * (the node's latest count for the signer equals the command's nonce):
 * - the gas cap: a property of the signed bytes, which can never execute on
 *   this node, however often they are sent;
 * - a halted node: it never executes anything again.
 * The generic "rejected before execution" prefix is not enough on its own: a
 * duplicate resend answered that way while the original is still in flight also
 * sees the nonce unused, and retiring those bytes would free a nonce they may
 * still take. "commit relay failed" alone describes a batch, not this command.
 *
 * Nobody has recorded the human node's own gas-cap text yet, so every wording a
 * node of this kind may use is accepted:
 * - "transaction gas limit is greater than the cap", as the agent arcade's node
 *   answered its coordinator (docs/AGENT_ARCADE.md, codex/contract-authority);
 * - revm's EIP-7825 text, numbers inside the phrase: "transaction gas limit
 *   (30000000) is greater than the cap (16777216)";
 * - go-ethereum's EIP-7825 text: "transaction gas limit too high (cap: ..., tx: ...)";
 * - a pool's limit on one transaction or on the block: "exceeds block gas limit",
 *   "exceeds block's gas limit", "exceeds maximum transaction gas limit".
 * Each is a property of the signed gas limit: those bytes can never run on this
 * node, and a lower limit is the remedy. A full block ("gas limit reached") is
 * none of them and never matches. */
const GAS_CAP_REFUSAL=/gas limit(?:\s*\(\s*\d+\s*\))?\s+is\s+(?:greater|higher)\s+than\s+(?:the\s+)?cap|transaction gas limit too high|exceeds\s+(?:the\s+)?(?:block(?:'s)?|maximum\s+transaction)\s+gas\s+limit/i;
const HALT_REFUSAL=/this session is over|no longer accepting transactions/i;
const LOGGED_REFUSAL=new RegExp(['rejected before execution',GAS_CAP_REFUSAL.source,HALT_REFUSAL.source].join('|'),'i');
export const gasCapRefusal=(error:unknown)=>GAS_CAP_REFUSAL.test(nodeText(error));
export const haltRefusal=(error:unknown)=>HALT_REFUSAL.test(nodeText(error));
export const retirableRefusal=(error:unknown)=>{const text=nodeText(error);return GAS_CAP_REFUSAL.test(text)||HALT_REFUSAL.test(text);};
/** The refusal sentence only, for logs. */
export function refusalReason(error:unknown){
 const text=nodeText(error),match=LOGGED_REFUSAL.exec(text);
 if(!match)return '';
 return boundedReason(text.slice(Math.max(0,match.index-40)));
}
/** Whatever the node and its wrappers said, bounded, for the operator's log of a
 * send that was neither confirmed nor retired: the literal text is what tells a
 * refusal this code does not recognise from a lost response. */
export const nodeRefusalText=(error:unknown)=>boundedReason(nodeText(error));
