import {http,type Transport} from 'viem';
import {engineReadRetryMs} from './engine-read';
import {measuredFetch} from './rpc-metrics';

/** Pace and coalesce identical in-flight public reads. Never retry a signed write,
 * or cache a value across different pinned blocks. All browser base-chain users
 * share one instance; gameplay writes still go straight to their arena. */
export function baseReadTransport(url:string,options:{intervalMs?:number;now?:()=>number;sleep?:(ms:number)=>Promise<void>}={}):Transport{
 const now=options.now??Date.now,sleep=options.sleep??(ms=>new Promise(r=>setTimeout(r,ms))),interval=options.intervalMs??400;
 const reads=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_call','eth_getCode','eth_getStorageAt','eth_getBalance','eth_getTransactionCount','eth_getTransactionReceipt','eth_getLogs']);
 const inFlight=new Map<string,Promise<any>>();let queue:Promise<unknown>=Promise.resolve(),next=0;
 return config=>{
  const transport=http(url,{retryCount:0,timeout:8000,fetchFn:measuredFetch('monad')})(config);
  return {...transport,request:args=>{
   if(!reads.has(args.method))return Promise.reject(Error('This connection only permits public chain reads'));
   const key=JSON.stringify(args),existing=inFlight.get(key);if(existing)return existing;
   const pending=queue.then(async()=>{
    for(let attempt=0;;attempt++){
     const delay=next-now();if(delay>0)await sleep(delay);next=now()+interval;
     try{return await transport.request(args);}
     catch(error){
      let cause:any=error,limited=false;
      for(let i=0;cause&&i<8;i++,cause=cause.cause)if(cause.status===429||/requests limited to|rate limit|too many requests/i.test(String(cause.details??cause.message??'')))limited=true;
      if(!limited)throw error;
      if(attempt>=2)throw Object.assign(Error('Monad reads are temporarily limited. Your arcade session is saved; retry synchronization.'),{code:'BASE_READ_RATE_LIMIT',source:'monad_rpc',cause:error});
      // Some Monad gateways return their limit as a JSON-RPC error with HTTP 200.
      next=Math.max(next,now()+Math.max(engineReadRetryMs(error),1000*2**attempt));
     }
    }
   });
   queue=pending.catch(()=>{});inFlight.set(key,pending);
   void pending.finally(()=>{if(inFlight.get(key)===pending)inFlight.delete(key);}).catch(()=>{});
   return pending;
  }};
 };
}
