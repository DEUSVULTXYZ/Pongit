import {http, type Transport} from "viem";
import {engineReadRetryMs} from "./engine-read";
import {measuredFetch,recordRpc} from "./rpc-metrics";
import {EnginePublicationUnavailable,publicationUnavailable} from "./service-error";
const cooldowns=new Map<string,()=>number>();
export const engineCooldownMs=(url:string)=>Math.max(0,cooldowns.get(url)?.()??0);

/** One cooldown for all methods on a node, including SDK reads and writes.
 * Reject locally while throttled. Never queue or replay a signed transaction. */
export function engineRequestGate(now = Date.now,remember?:(remaining:()=>number)=>void) {
  let until = 0;
  remember?.(()=>until-now());
  return async <T>(send: () => Promise<T>): Promise<T> => {
    if (now() < until) {
      const error = new Error("The game node is limiting requests. Waiting to synchronize.");
      Object.assign(error, {status: 429, code:"ENGINE_COOLDOWN",source:"client_cooldown",retryAt:until, headers: {"retry-after": String((until - now()) / 1000)}});
      recordRpc({at:now(),target:"interlude",method:"blocked",status:429,ms:0,source:"cooldown"});
      throw error;
    }
    try { return await send(); }
    catch (error) {
      const delay = engineReadRetryMs(error);
      if (delay) until = Math.max(until, now() + delay);
      throw error;
    }
  };
}

export type EngineTransportJournal = {
  beforeSend:(raw:unknown)=>Promise<void>;
  received:(method:string,result:any)=>void;
};
export function engineTransport(url: string,journal?:EngineTransportJournal): Transport {
  const gate = engineRequestGate(Date.now,remaining=>cooldowns.set(url,remaining));
  let publicationUntil=0;
  return options => {
    const transport = http(url, {retryCount: 0, timeout: 4000,fetchFn:measuredFetch("interlude")})(options);
    return {...transport, request: async args => {
      const write=["interlude_sendTransaction","eth_sendRawTransaction"].includes(args.method);
      if(write&&Date.now()<publicationUntil){recordRpc({at:Date.now(),target:"interlude",method:"write.blocked",status:503,ms:0,source:"cooldown"});throw new EnginePublicationUnavailable();}
      try{return await gate(async()=>{
        if(write)await journal?.beforeSend((args.params as any)?.[0]);
        const result:any=await transport.request(args);
        journal?.received(args.method,result);
        return result;
      });}
      catch(e){if(publicationUnavailable(e)){publicationUntil=Date.now()+30000;throw new EnginePublicationUnavailable(e);}throw e;}
    }};
  };
}
