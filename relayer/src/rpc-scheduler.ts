/** Classify the requested state, not only the RPC method. Current headers are
 * needed for grants, acceptance deadlines and sponsor fees, including while
 * an indexer is downloading old blocks. Receipt/hash reconciliation is also
 * interactive: delaying it can leave an already executed command uncertain. */
export function historicalRpcRequest(method:string, params:readonly unknown[]):boolean {
  if(method === "eth_getLogs" || method === "eth_getBlockByHash")return true;
  if(method !== "eth_getBlockByNumber")return false;
  return !["latest", "pending", "safe", "finalized"].includes(String(params[0]));
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
