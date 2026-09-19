/** Bounded, payload-free samples. No parameters, grants, cookies or response bodies. */
export type RpcMetric={at:number;target:"interlude"|"monad"|"pongit";method:string;status:number;ms:number;source:"network"|"cooldown"|"cache"|"websocket";requestId?:string};
const samples:RpcMetric[]=[];
let sink:((sample:RpcMetric)=>void)|undefined;
export function recordRpc(sample:RpcMetric){samples.push(sample);if(samples.length>12000)samples.splice(0,2000);sink?.(sample);}
export function rpcSamples(){return samples.slice();}
export function takeRpcSamples(limit=200){return samples.splice(0,limit);}
export function setRpcMetricSink(fn?:typeof sink){sink=fn;}
/** `method` names a request without a JSON-RPC body (a GET such as /health). */
export function measuredFetch(target:RpcMetric["target"],method0="http"):typeof fetch {
 return async(input,init)=>{
  const at=Date.now();let method=method0;
  try{const parsed=JSON.parse(String(init?.body||"{}"));if(typeof parsed.method==="string"&&/^[\w.]{1,80}$/.test(parsed.method))method=parsed.method;}catch{}
  try{const response=await fetch(input,init);recordRpc({at,target,method,status:response.status,ms:Date.now()-at,source:"network",requestId:(response.headers.get("fly-request-id")||response.headers.get("x-request-id")||"").slice(0,160)||undefined});return response;}
  catch(error){recordRpc({at,target,method,status:0,ms:Date.now()-at,source:"network"});throw error;}
 };
}
