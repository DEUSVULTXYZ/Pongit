/** Classify the requested state, not only the RPC method. Current headers are
 * needed for grants, acceptance deadlines and sponsor fees, including while
 * an indexer is downloading old blocks. Receipt/hash reconciliation is also
 * interactive: delaying it can leave an already executed command uncertain. */
export function historicalRpcRequest(method:string, params:readonly unknown[],observedHead?:bigint,blockHeight?:(hash:string)=>bigint|undefined):boolean {
  if(method === "eth_getLogs")return true;
  if(method === "eth_getBlockByHash"){
    const height=typeof params[0]==='string'?blockHeight?.(params[0]):undefined;
    return observedHead===undefined||height===undefined||height>observedHead||observedHead-height>64n;
  }
  // Result archives also read old contract state. Previously these eth_call
  // requests occupied the live queue even while headers for that block waited
  // in the history queue. Hash-pinned calls without a known height stay live.
  const stateTag=method==='eth_getStorageAt'?params[2]:
    ['eth_call','eth_getBalance','eth_getCode'].includes(method)?params[1]:undefined;
  if(observedHead!==undefined&&stateTag&&typeof stateTag==='object'){
    const hash=(stateTag as {blockHash?:unknown}).blockHash;
    const height=typeof hash==='string'?blockHeight?.(hash):undefined;
    if(height!==undefined)return height<=observedHead&&observedHead-height>64n;
  }
  if(observedHead!==undefined&&typeof stateTag==='string'&&/^0x[\da-f]+$/i.test(stateTag)){
    const height=BigInt(stateTag);return height<=observedHead&&observedHead-height>64n;
  }
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

/** Header observations classify scheduling only. They never replace canonical
 * RPC validation or serve cached state. Remember hashes, not heights alone, so
 * a replacement block cannot relabel reads of the orphaned hash. Unknown hashes
 * remain interactive; stale/evicted observations cannot delay a player. */
export function rpcBlockObservations(limit=2048){
 const heights=new Map<string,bigint>();let head:bigint|undefined;
 const number=(v:unknown)=>typeof v==='string'&&/^0x[\da-f]+$/i.test(v)?BigInt(v):undefined;
 return{
  head:()=>head,
  height:(hash:string)=>heights.get(hash.toLowerCase()),
  observe(method:string,params:readonly unknown[],result:unknown){
   const block=result&&typeof result==='object'?result as {number?:unknown;hash?:unknown}:undefined;
   const n=method==='eth_blockNumber'?number(result):number(block?.number);
   if(method==='eth_blockNumber'||method==='eth_getBlockByNumber'&&params[0]==='latest'){
    if(n!==undefined)head=n;
   }
   if(!['eth_getBlockByNumber','eth_getBlockByHash'].includes(method)||n===undefined
    ||typeof block?.hash!=='string'||!/^0x[\da-f]{64}$/i.test(block.hash))return;
   const hash=block.hash.toLowerCase();
   if(method==='eth_getBlockByHash'&&String(params[0]).toLowerCase()!==hash)return;
   if(method==='eth_getBlockByNumber'&&number(params[0])!==undefined&&number(params[0])!==n)return;
   heights.delete(hash);heights.set(hash,n);
   while(heights.size>limit)heights.delete(heights.keys().next().value!);
  },
 };
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
  let next=0,timer:ReturnType<typeof setTimeout>|undefined,liveRun=0,effectiveSpacing=spacingMs,lastAdjustment=-Infinity;
  function tick(){
    timer=undefined;
    if(!live.length && !history.length)return;
    const wait=Math.max(0,next-Date.now());
    if(wait){timer=setTimeout(tick,wait);return;}
    const low=history.length>0 && (!live.length || liveRun>=4);
    const release=(low?history:live).shift()!;
    liveRun=low?0:liveRun+1;next=Date.now()+effectiveSpacing;release();
    if(live.length || history.length)timer=setTimeout(tick,effectiveSpacing);
  }
  return {
    acquire(historical:boolean){return new Promise<void>(resolve=>{(historical?history:live).push(resolve);if(!timer)tick();});},
    pending(){return {interactive:live.length,history:history.length};},
    waitMs(historical:boolean){
      // Estimate this caller's dispatch time, including the existing cooldown.
      // An interactive read overtakes archive work; counting the entire history
      // queue made the gateway avoid an upstream that could serve it next.
      let l=live.length,h=history.length,run=liveRun,before=0;
      for(;;){
        const low=(h>0||historical)&&(!(l>0||!historical)||run>=4);
        if(low){if(h===0)return Math.max(0,next-Date.now())+before*effectiveSpacing;h--;run=0;}
        else {if(l===0)return Math.max(0,next-Date.now())+before*effectiveSpacing;l--;run++;}
        before++;
      }
    },
    throttle(retryMs:number){
      // All callers share a provider cooldown. Sleeping only the rejected
      // caller left the other indexers/arenas hammering that same provider.
      if(Date.now()-lastAdjustment>=1000){
        effectiveSpacing=Math.min(500,Math.max(effectiveSpacing+10,Math.ceil(effectiveSpacing*1.1)));lastAdjustment=Date.now();
      }
      next=Math.max(next,Date.now()+Math.max(250,Math.min(60000,retryMs)));
    },
    spacing(){return effectiveSpacing;},
    success(){
      // Recover slowly after a quiet minute; a temporary incident must not
      // permanently strand gameplay at the emergency rate until a restart.
      if(effectiveSpacing>spacingMs&&Date.now()-lastAdjustment>=60000){
        effectiveSpacing=Math.max(spacingMs,effectiveSpacing-5);lastAdjustment=Date.now();
      }
    },
  };
}
