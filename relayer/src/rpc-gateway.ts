// Private, shared upstream budget for the relayer and Envio. Never publish this port.
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import {chunkedLogs,historyGate} from "./log-ranges";
import { historicalRpcRequest, pinnedRpcRequest, rpcScheduler } from "./rpc-scheduler";

const upstream = process.env.RPC_UPSTREAM || "https://testnet-rpc.monad.xyz";
const secondary=process.env.RPC_UPSTREAM_FALLBACK || "https://testnet-rpc.monad.xyz";
// Providers throttle per IP. The floor stops a misconfiguration from flooding
// them; RPC_SPACING_MS below it is ignored. 25 ms allows 40 requests/second.
const spacing = Math.max(25, Number(process.env.RPC_SPACING_MS || 60));
// Each provider has its own rate budget. Block-pinned reads use whichever is less
// loaded; everything else keeps the primary-first behaviour below unchanged.
const spread=secondary!==upstream;
type Upstream="primary"|"secondary";
const upstreams:Record<Upstream,string>={primary:upstream,secondary};
const schedulers={primary:rpcScheduler(spacing),secondary:spread?rpcScheduler(Math.max(25,Number(process.env.RPC_SECONDARY_SPACING_MS||spacing))):undefined};
const schedulerOf=(u:Upstream)=>u==="secondary"&&schedulers.secondary?schedulers.secondary:schedulers.primary;
const historicalBatch=historyGate(4);
let waiting = 0;
// Answers and throttling per provider since start. A rising throttled count
// means that provider's spacing is above what it accepts and should be raised.
const stats:Record<Upstream,{served:number;throttled:number}>={primary:{served:0,throttled:0},secondary:{served:0,throttled:0}};
let observedHead:bigint|undefined;
const inflight = new Map<string, Promise<unknown>>();
const cache = new Map<string, { expires: number; result: unknown }>();
// A block-pinned read has one correct answer. Start with the less loaded provider
// and ask the other when one throttles, fails or has not got that block. A real
// execution error is the same on both and is returned at once, unchanged.
async function spreadRead(method:string,params:unknown[],historical:boolean):Promise<unknown>{
 const load=(u:Upstream)=>{const p=schedulerOf(u).pending();return p.interactive+p.history;};
 const first:Upstream=load("secondary")<=load("primary")?"secondary":"primary";
 const order:Upstream[]=[first,first==="primary"?"secondary":"primary"];
 for(let attempt=0;attempt<4;attempt++){
  const target=order[attempt%2];
  if(attempt>=2)await delay(500*(attempt-1));
  await schedulerOf(target).acquire(historical);
  let response:Response;
  try{response=await fetch(upstreams[target],{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(15000)});}catch{continue;}
  if(response.status>=500)continue;
  if(response.status===429){stats[target].throttled++;continue;}
  const result=await response.json().catch(()=>null) as {result?:unknown;error?:{code:number;message:string;data?:unknown}}|null;
  if(!result)continue;
  const message=result.error?.message||"";
  if(/limited to|rate limit/i.test(message)){stats[target].throttled++;continue;}
  if(result.error&&result.error.code!==3&&!/revert/i.test(message)&&/header not found|unknown block|block not found|missing trie node/i.test(message))continue;
  if(result.error)throw result.error;
  if(!response.ok||!("result" in result))continue;
  stats[target].served++;return result.result;
 }
 throw new Error("Upstream RPC unavailable; retry shortly");
}
async function request(method: string, params: unknown[]):Promise<unknown> {
  if(method==="eth_getLogs" && process.env.RPC_CHUNK_LOGS==="true") {
    const filter=params[0] as any;
    if(!filter?.blockHash && /^0x[\da-f]+$/i.test(filter?.fromBlock) && /^0x[\da-f]+$/i.test(filter?.toBlock) && BigInt(filter.toBlock)-BigInt(filter.fromBlock)>=100n)
      return historicalBatch(()=>chunkedLogs(filter,p=>request(method,[p]) as Promise<any[]>,100,2000));
  }
  const key = JSON.stringify([method, params]);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  // Coalesce reads only: transaction submission is always forwarded.
  const read = !method.startsWith("eth_send");
  if (read && inflight.has(key)) return inflight.get(key);
  if (waiting >= 200) throw new Error("RPC busy; retry shortly");
  const operation = (async () => {
    waiting++;
    try {
      if(read&&spread&&pinnedRpcRequest(method,params))return await spreadRead(method,params,historicalRpcRequest(method,params,observedHead));
      for (let attempt = 0; attempt < 4; attempt++) {
        const target:Upstream=attempt>0 && (read || method==='eth_sendRawTransaction') && spread ? "secondary" : "primary";
        await schedulerOf(target).acquire(historicalRpcRequest(method, params,observedHead));
        let response:Response;
        try { response = await fetch(upstreams[target], {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(15000),
        }); } catch { if(attempt===3)throw new Error("RPC transport unavailable");await delay(250*(attempt+1));continue; }
        if(response.status>=500) {await delay(250*(attempt+1));continue;}
        // Some providers return plain text for HTTP 429. Do not parse it as JSON.
        if(response.status===429){stats[target].throttled++;await delay(1000*(attempt+1));continue;}
        const result = await response.json() as { result?: unknown; error?: { code: number; message: string; data?: unknown } };
        if (/limited to|rate limit/i.test(result.error?.message || "")) {
          stats[target].throttled++;
          await delay(1000 * (attempt + 1));
          continue;
        }
        // A node can cache an insufficient-balance rejection even after a top-up.
        // Broadcasting the identical signed bytes elsewhere preserves its hash
        // and nonce; this never creates a second transaction or changes a fee.
        if(result.error && method==='eth_sendRawTransaction' && attempt===0 && secondary!==upstream && /insufficient balance|insufficient funds/i.test(result.error.message))continue;
        if (result.error) throw result.error;
        if (!response.ok || !("result" in result)) throw new Error("Upstream RPC unavailable");
        stats[target].served++;
        const height=method==='eth_blockNumber'?result.result:
          method==='eth_getBlockByNumber'&&params[0]==='latest'?(result.result as any)?.number:undefined;
        if(typeof height==='string'&&/^0x[\da-f]+$/i.test(height))observedHead=BigInt(height);
        const ttl = method === "eth_chainId" ? 3600000 : method === "eth_gasPrice" ? 3000 : method === "eth_blockNumber" ? 150 : 0;
        if (ttl) cache.set(key, { expires: Date.now() + ttl, result: result.result });
        return result.result;
      }
      throw new Error("Upstream RPC rate limit; retry shortly");
    } finally { waiting--; }
  })();
  if (read) inflight.set(key, operation);
  try { return await operation; } finally { if (read) inflight.delete(key); }
}
createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.method === "GET" && req.url === "/health") {
    res.end(JSON.stringify({ ok: true, waiting, queued:schedulers.primary.pending(), requestsPerSecond: 1000 / spacing,
      throttled: stats.primary.throttled+stats.secondary.throttled,
      upstreams: {primary:{queued:schedulers.primary.pending(),...stats.primary},secondary:schedulers.secondary?{queued:schedulers.secondary.pending(),...stats.secondary}:null} })); return;
  }
  let id: unknown = null;
  try {
    let data = "";
    for await (const part of req) { data += part; if (data.length > 1000000) throw new Error("Request too large"); }
    const input = JSON.parse(data); id = input.id;
    if (Array.isArray(input) || typeof input.method !== "string" || !/^(eth_|net_|web3_)/.test(input.method)) throw new Error("Unsupported request");
    const result = await request(input.method, input.params || []);
    res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
  } catch (e) {
    const error = e as { code?: number; message?: string; data?: unknown };
    res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: error.code || -32000, message: error.message || "RPC unavailable", data: error.data } }));
  }
}).listen(Number(process.env.RPC_PORT || 8545), "0.0.0.0", () => console.log("Private RPC gateway listening; shared upstream request budget enabled"));
