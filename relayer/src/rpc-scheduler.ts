import {decodeFunctionData,multicall3Abi} from 'viem';
import {NO_LEASE_HUB} from '../../shared/hub-lease';

const rootDelegation=(data:unknown):data is string=>typeof data==='string'&&/^0xcd325a310{24}[\da-f]{40}0{64}$/i.test(data);
function arenaFenceBatch(call:{to?:unknown;data?:unknown}){
 if(typeof call.to!=='string'||call.to.toLowerCase()!=='0xca11bde05977b3631167028862be2a173976ca11'
  ||typeof call.data!=='string'||call.data.length>32770)return false;
 try{
  const decoded=decodeFunctionData({abi:multicall3Abi,data:call.data as `0x${string}`});
  if(decoded.functionName!=='aggregate3')return false;
  const calls=decoded.args[0];if(!calls.length||calls.length>21)return false;
  let fences=0;
  for(const item of calls){
   if(item.target.toLowerCase()===NO_LEASE_HUB.toLowerCase()&&rootDelegation(item.callData)){fences++;continue;}
   // laneRecord(uint8): at most five small assignment records accompany the
   // hub checks in the engine's canonical snapshot. Never promote a generic
   // aggregate, result archive, write simulation or nested multicall.
   if(!/^0x7057d9dd0{63}[0-4]$/i.test(item.callData))return false;
  }
  return fences>0&&calls.length-fences<=5;
 }catch{return false;}
}

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

/** The durable transaction owner must not queue nonce/receipt work behind the
 * routine canonical headers of every reader. This grants no extra throughput. */
export function transactionRpcRequest(method:string,params:readonly unknown[]):boolean{
 const address=(v:unknown)=>typeof v==='string'&&/^0x[\da-f]{40}$/i.test(v);
 if(method==='eth_getTransactionReceipt')return params.length===1&&typeof params[0]==='string'&&/^0x[\da-f]{64}$/i.test(params[0]);
 if(method==='eth_getTransactionCount')return params.length===2&&address(params[0])&&(params[1]==='latest'||params[1]==='pending');
 if(method==='eth_gasPrice'||method==='eth_maxPriorityFeePerGas')return params.length===0;
 // These methods are private-gateway only: the public browser read proxy
 // rejects both. Prioritizing an estimate never authorizes a signature.
 if(method==='eth_estimateGas'){
  const call=params[0] as {to?:unknown;from?:unknown;data?:unknown}|undefined;
  return params.length<=2&&!!call&&address(call.to)&&address(call.from)
   &&(params[1]===undefined||params[1]==='latest'||params[1]==='pending');
 }
 if(method==='eth_sendRawTransaction')return params.length===1&&typeof params[0]==='string'&&/^0x(?:[\da-f]{2})+$/i.test(params[0])&&params[0].length<=131074;
 return false;
}
export function controlRpcRequest(method:string,params:readonly unknown[],observedHead?:bigint,blockHeight?:(hash:string)=>bigint|undefined):boolean{
 if(transactionRpcRequest(method,params))return true;
 const address=(v:unknown)=>typeof v==='string'&&/^0x[\da-f]{40}$/i.test(v);
 const recent=(tag:unknown)=>{
  const height=typeof tag==='string'&&/^0x[\da-f]+$/i.test(tag)?BigInt(tag):
   tag&&typeof tag==='object'&&typeof (tag as {blockHash?:unknown}).blockHash==='string'
    ?blockHeight?.((tag as {blockHash:string}).blockHash):undefined;
  return observedHead!==undefined&&height!==undefined&&height<=observedHead&&observedHead-height<=64n;
 };
 if(method==='eth_blockNumber')return true;
 if(method==='eth_getBlockByNumber')return params[0]==='latest'||params[0]==='pending'||recent(params[0]);
 if(method==='eth_getBlockByHash')return recent({blockHash:params[0]});
 // Runtime identity is part of a fresh arena authorization. Historical code
 // audits retain their ordinary/archive lane, including unknown block hashes.
 if(method==='eth_getCode')return params.length===2&&address(params[0])
  &&(params[1]==='latest'||params[1]==='pending'||recent(params[1]));
 if(method!=='eth_call'||!(params[1]==='latest'||params[1]==='pending'||recent(params[1])))return false;
 const call=params[0] as {to?:unknown;data?:unknown}|undefined;
 // Direct player and atomic engine fences protect the same three-second
 // window. Batching the engine reads must not demote them behind hydration.
 return typeof call?.to==='string'&&/^0x[\da-f]{40}$/i.test(call.to)&&typeof call.data==='string'
  &&(rootDelegation(call.data)||arenaFenceBatch(call));
}

/** A validated foreground read has its own bounded priority lane. The hint
 * comes from internal services, never grants extra throughput or write access,
 * and cannot promote archive scans. Unknown methods retain normal scheduling. */
export function foregroundRpcRequest(method:string,params:readonly unknown[],hint:boolean,head?:bigint,height?:(hash:string)=>bigint|undefined){
 return hint&&!historicalRpcRequest(method,params,head,height)
  &&['eth_call','eth_getCode','eth_getBalance','eth_getStorageAt'].includes(method);
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
  const queues={live:[] as Array<()=>void>,control:[] as Array<()=>void>,foreground:[] as Array<()=>void>,history:[] as Array<()=>void>,transaction:[] as Array<()=>void>};
  let next=0,timer:ReturnType<typeof setTimeout>|undefined,liveRun=0,controlRun=0,foregroundRun=0,transactionRun=0,effectiveSpacing=spacingMs,lastAdjustment=-Infinity;
  // One ordinary read after four control checks; one historical read after
  // four total interactive reads. History does not reset the ordinary quota.
  // A foreground hint must not put every catalogue/match hydration in front
  // of an already accepted transaction's nonce, fees and receipt. Preserve
  // the existing upstream budget and both background fairness guarantees.
  // Transactions and headers share the burst before a foreground turn. Nested
  // separate bursts previously allowed 16 transactions plus four headers to
  // delay one login simulation, beyond its HTTP deadline under concurrent login.
  // A foreground turn does not reset the transaction/header fairness counter.
  const choose=(l:number,c:number,f:number,h:number,t:number,run:number,urgentRun:number,controlBurst:number,transactionBurst:number):keyof typeof queues=>
   h>0&&(!(l+c+f+t)||run>=4)?'history':l>0&&(!(c+f+t)||urgentRun>=4)?'live':
    f>0&&controlBurst>=4?'foreground':
    t>0&&(!(c+f)||transactionBurst<4)?'transaction':
    c>0&&(!f||controlBurst<4)?'control':'foreground';
  function tick(){
    timer=undefined;
    if(!Object.values(queues).some(q=>q.length))return;
    const wait=Math.max(0,next-Date.now());
    if(wait){timer=setTimeout(tick,wait);return;}
    const kind=choose(queues.live.length,queues.control.length,queues.foreground.length,queues.history.length,queues.transaction.length,liveRun,controlRun,foregroundRun,transactionRun);
    const release=queues[kind].shift()!;
    liveRun=kind==='history'?0:liveRun+1;
    if(kind!=='history')controlRun=kind==='live'?0:controlRun+1;
    if(kind==='control'||kind==='foreground'||kind==='transaction')foregroundRun=kind==='foreground'?0:foregroundRun+1;
    if(kind==='transaction'||kind==='control')transactionRun=kind==='transaction'?transactionRun+1:0;
    next=Date.now()+effectiveSpacing;release();
    if(Object.values(queues).some(q=>q.length))timer=setTimeout(tick,effectiveSpacing);
  }
  return {
    acquire(historical:boolean,control=false,foreground=false,transaction=false){return new Promise<void>(resolve=>{queues[historical?'history':transaction?'transaction':control?'control':foreground?'foreground':'live'].push(resolve);if(!timer)tick();});},
    pending(){return {interactive:queues.live.length+queues.control.length+queues.foreground.length+queues.transaction.length,history:queues.history.length};},
    waitMs(historical:boolean,control=false,foreground=false,transaction=false){
      // Estimate this caller's dispatch time, including the existing cooldown.
      // An interactive read overtakes archive work; counting the entire history
      // queue made the gateway avoid an upstream that could serve it next.
      const target=historical?'history':transaction?'transaction':control?'control':foreground?'foreground':'live';
      const sizes={live:queues.live.length,control:queues.control.length,foreground:queues.foreground.length,history:queues.history.length,transaction:queues.transaction.length};
      let run=liveRun,urgentRun=controlRun,controlBurst=foregroundRun,transactionBurst=transactionRun,before=0;
      for(;;){
        const kind=choose(sizes.live+Number(target==='live'),sizes.control+Number(target==='control'),sizes.foreground+Number(target==='foreground'),sizes.history+Number(target==='history'),sizes.transaction+Number(target==='transaction'),run,urgentRun,controlBurst,transactionBurst);
        if(kind===target&&sizes[kind]===0)return Math.max(0,next-Date.now())+before*effectiveSpacing;
        sizes[kind]--;run=kind==='history'?0:run+1;
        if(kind!=='history')urgentRun=kind==='live'?0:urgentRun+1;
        if(kind==='control'||kind==='foreground'||kind==='transaction')controlBurst=kind==='foreground'?0:controlBurst+1;
        if(kind==='transaction'||kind==='control')transactionBurst=kind==='transaction'?transactionBurst+1:0;
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
