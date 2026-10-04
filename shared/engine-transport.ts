import {createPublicClient,http,webSocket,type Transport} from "viem";
import {engineReadRetryMs} from "./engine-read";
import {measuredFetch,recordRpc} from "./rpc-metrics";
import {EnginePublicationUnavailable,publicationUnavailable} from "./service-error";
import {agentPublicationHealth} from './agent-publication-health';
import {createSendRouter,nodeSocketUrl,type SendRouter} from '@interludelayer-sdk/sdk';
import {boundedEngineSend} from './bounded-engine-send';
const cooldowns=new Map<string,()=>number>();
export const engineCooldownMs=(url:string)=>Math.max(0,cooldowns.get(url)?.()??0);
type EngineGate=<T>(send:()=>Promise<T>)=>Promise<T>;
const gates=new Map<string,EngineGate>();
const publicationPauses=new Map<string,{until:number}>();
const sendRouters=new Map<string,ReturnType<typeof boundedSendRouter>&{users:number}>();
function boundedSendRouter(url:string){
  const clients=new Set<ReturnType<typeof createPublicClient>>();
  const ready=new WeakMap<object,()=>boolean>();let closed=false;
  // A socket blocked by a proxy must not interrupt every resume countdown.
  // Keep the HTTP lane for a full match after a loss; a new player client owns
  // a fresh router. This changes transport only, never retries signed bytes.
  const router=createSendRouter(url,{firstRestMs:600000,maxRestMs:600000,make:(endpoint,via,socket)=>{
    const ws=new URL(nodeSocketUrl(endpoint));
    if(socket)ws.searchParams.set('interlude_send',String(socket));
    const client=createPublicClient({transport:via==='ws'&&typeof WebSocket!=='undefined'
      ?webSocket(ws.toString(),{retryCount:0,timeout:4000,reconnect:false})
      :http(endpoint,{retryCount:0,timeout:4000})});
    if(via==='ws'&&typeof WebSocket!=='undefined'){
      clients.add(client);
      const request=client.request.bind(client);
      const wrapped={...client,request:(args:any)=>boundedEngineSend(
        ()=>(client.transport as any).getRpcClient(),()=>request(args))} as typeof client;
      let connected:{socket:{readyState:number};close:()=>void}|undefined;
      ready.set(wrapped,()=>!closed&&connected?.socket.readyState===1);
      // Establish only the transport while the player verifies its arena.
      // Until it is open, select HTTP before any write is handed to a socket.
      // A lost response after selection still goes through journal recovery.
      void boundedEngineSend(async()=>{
        const rpc=await (client.transport as any).getRpcClient();
        if(closed)rpc.close();return rpc;
      },async()=>{if(!closed)connected=await (client.transport as any).getRpcClient();})
        .catch(()=>{if(!closed)router.lost('ws');});
      return wrapped;
    }
    return client;
  }});
  router.client(); // Optional preconnect; never waits or sends a command.
  const selecting:SendRouter={
    client(){const selected=router.client();return selected.via==='ws'&&!ready.get(selected.client)?.()
      ?{...selected,via:'http'}:selected;},
    delivered:via=>router.delivered(via),lost:via=>router.lost(via),
  };
  return {router:selecting,close:()=>{closed=true;for(const client of clients)(client.transport as any).getRpcClient?.().then((rpc:any)=>rpc.close(),()=>{});clients.clear();}};
}
function transportLoss(error:unknown){
 for(let e=error as any,n=0;e&&n<8;e=e.cause,n++)if(typeof e.code==='number'&&e.code!==-1)return false;
 return !publicationUnavailable(error)&&engineReadRetryMs(error)===0;
}
/** The node's shared request gate, for requests outside the JSON-RPC transport
 * (the relayer's /health read): refused locally while a Retry-After runs, and a
 * 429 it sees extends the same cooldown for every method. Before any transport
 * for the node exists, requests pass through ungated. */
export const engineGate=(url:string):EngineGate=>send=>(gates.get(url)??(next=>next()))(send);

/** A fresh, identified health read may end a publication-only hold early.
 * Never clear an RPC Retry-After or a newer failure that arrived during the read.
 * This only reopens transport: command journals still reconcile exact bytes.
 */
export async function observeEnginePublication(url:string,app:string,epoch:bigint,load:()=>Promise<unknown>){
  const pause=publicationPauses.get(url),value=await engineGate(url)(load);
  if((value as any)?.chainId!==4242)throw Error('Hosted publication chain is not verified');
  const health=agentPublicationHealth(value,app,epoch);
  if(health.healthy&&pause&&publicationPauses.get(url)===pause)publicationPauses.delete(url);
  return health;
}

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
export function engineTransport(url: string,journal?:EngineTransportJournal,send?:true|SendRouter): Transport {
  // Observer, scoped player and maintenance clients can share a node. Creating
  // another viem client must not clear or bypass that node's existing pause.
  let gate=gates.get(url);
  if(!gate){gate=engineRequestGate(Date.now,remaining=>cooldowns.set(url,remaining));gates.set(url,gate);}
  const requestGate=gate;
  return options => {
    const measured=measuredFetch("interlude");
    const fetchFn:typeof fetch=async(input,init)=>{
      // viem's HTTP deadline ends once headers arrive. Keep an independent
      // abort signal alive while its decoder consumes a stalled response body.
      // An interrupted write stays uncertain in its existing nonce journal.
      const timeout=AbortSignal.timeout(4000);
      const signal=init?.signal?AbortSignal.any([init.signal,timeout]):timeout;
      const response=await measured(input,{...init,signal});
      if(response.status===429){
        // viem's HTTP error does not retain response headers. Preserve the
        // actual Retry-After in its cause instead of falling back to ten seconds.
        const error=Object.assign(new Error("The game node is limiting requests. Waiting to synchronize."),{
          status:429,code:"ENGINE_RATE_LIMIT",source:"interlude_rpc",headers:response.headers,
        });
        await response.body?.cancel().catch(()=>{});
        throw error;
      }
      return response;
    };
    const transport = http(url, {retryCount: 0, timeout: 4000,fetchFn})(options);
    // The SDK router picks the next transport but never owns retries/nonces.
    // After a lost response the exact journaled command must be reconciled by
    // its existing owner before another call can enter this lane.
    let router:SendRouter|undefined,closeSend=()=>{};
    if(send&&journal){
      if(send===true){
        let owner=sendRouters.get(url);
        if(!owner){owner={...boundedSendRouter(url),users:0};sendRouters.set(url,owner);}
        owner.users++;router=owner.router;let released=false;
        closeSend=()=>{if(released)return;released=true;if(--owner.users===0){owner.close();if(sendRouters.get(url)===owner)sendRouters.delete(url);}};
      }else router=send;
    }
    return {...transport,value:{...transport.value,closeSend}, request: async args => {
      const write=["interlude_sendTransaction","eth_sendRawTransaction"].includes(args.method);
      if(write&&Date.now()<(publicationPauses.get(url)?.until??0)){recordRpc({at:Date.now(),target:"interlude",method:"write.blocked",status:503,ms:0,source:"cooldown"});throw new EnginePublicationUnavailable();}
      try{return await requestGate(async()=>{
        if(write)await journal?.beforeSend((args.params as any)?.[0]);
        let result:any;
        if(write&&router){
          const selected=router.client();
          // HTTP retains Retry-After and the common traffic instrumentation.
          const at=Date.now();let status=200;
          try{result=await(selected.via==='http'?transport.request(args):selected.client.request(args as any));router.delivered(selected.via);}
          catch(error){status=engineReadRetryMs(error)?429:0;if(transportLoss(error))router.lost(selected.via);throw error;}
          finally{if(selected.via==='ws')recordRpc({at,target:'interlude',method:args.method,status,ms:Date.now()-at,source:'websocket',requestBytes:new TextEncoder().encode(JSON.stringify(args)).byteLength});}
        }else result=await transport.request(args);
        journal?.received(args.method,result);
        return result;
      });}
      catch(e){if(publicationUnavailable(e)){publicationPauses.set(url,{until:Date.now()+30000});throw new EnginePublicationUnavailable(e);}throw e;}
    }};
  };
}
