/** Classify the requested state, not only the RPC method. Current headers are
 * needed for grants, acceptance deadlines and sponsor fees, including while
 * an indexer is downloading old blocks. Receipt/hash reconciliation is also
 * interactive: delaying it can leave an already executed command uncertain. */
export function historicalRpcRequest(method:string, params:readonly unknown[],observedHead?:bigint):boolean {
  if(method === "eth_getLogs" || method === "eth_getBlockByHash")return true;
  if(method !== "eth_getBlockByNumber")return false;
  const tag=String(params[0]);
  if(["latest", "pending", "safe", "finalized"].includes(tag))return false;
  // A UI pins its reads to a recent concrete block and rechecks that block's
  // hash. That verification is interactive, not an indexer backfill request.
  if(observedHead!==undefined&&/^0x[\da-f]+$/i.test(tag)){
    const height=BigInt(tag);if(height<=observedHead&&observedHead-height<=64n)return false;
  }
  return true;
}

/** A read naming a concrete block (number or hash) or a closed log range has one
 * answer on every synchronized provider, so only these may be spread across
 * upstreams. "latest", pending, receipts, nonces and writes stay on one provider:
 * two providers at different heights could make state appear to move backwards
 * between consecutive reads of the same caller. */
export function pinnedRpcRequest(method:string,params:readonly unknown[]):boolean{
 const number=(v:unknown)=>typeof v==='string'&&/^0x[\da-f]+$/i.test(v);
 const hash=(v:unknown)=>typeof v==='string'&&/^0x[\da-f]{64}$/i.test(v);
 const block=(v:unknown)=>number(v)||!!v&&typeof v==='object'&&hash((v as {blockHash?:unknown}).blockHash);
 switch(method){
  case 'eth_call':case 'eth_getBalance':case 'eth_getCode':return block(params[1]);
  case 'eth_getStorageAt':return block(params[2]);
  case 'eth_getBlockByNumber':return number(params[0]);
  case 'eth_getBlockByHash':return hash(params[0]);
  case 'eth_getLogs':{const f=params[0] as {blockHash?:unknown;fromBlock?:unknown;toBlock?:unknown}|undefined;
   return !!f&&typeof f==='object'&&(hash(f.blockHash)||number(f.fromBlock)&&number(f.toBlock));}
  default:return false;
 }
}

/** One upstream rate budget; gameplay reads take priority over historical scans. */
export function rpcScheduler(spacingMs:number) {
  const live:Array<()=>void>=[], history:Array<()=>void>=[];
  let next=0,timer:ReturnType<typeof setTimeout>|undefined,liveRun=0;
  function tick(){
    timer=undefined;
    if(!live.length && !history.length)return;
    const wait=Math.max(0,next-Date.now());
    if(wait){timer=setTimeout(tick,wait);return;}
    const low=history.length>0 && (!live.length || liveRun>=4);
    const release=(low?history:live).shift()!;
    liveRun=low?0:liveRun+1;next=Date.now()+spacingMs;release();
    if(live.length || history.length)timer=setTimeout(tick,spacingMs);
  }
  return {
    acquire(historical:boolean){return new Promise<void>(resolve=>{(historical?history:live).push(resolve);if(!timer)tick();});},
    pending(){return {interactive:live.length,history:history.length};},
  };
}
