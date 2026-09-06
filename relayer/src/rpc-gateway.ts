// Private, shared upstream budget for the relayer and Envio. Never publish this port.
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import {chunkedLogs,historyGate} from "./log-ranges";
import { rpcScheduler } from "./rpc-scheduler";

const upstream = process.env.RPC_UPSTREAM || "https://testnet-rpc.monad.xyz";
const secondary=process.env.RPC_UPSTREAM_FALLBACK || "https://testnet-rpc.monad.xyz";
const spacing = Math.max(50, Number(process.env.RPC_SPACING_MS || 60));
const scheduler=rpcScheduler(spacing);
const historicalBatch=historyGate(4);
let waiting = 0;
const inflight = new Map<string, Promise<unknown>>();
const cache = new Map<string, { expires: number; result: unknown }>();
async function request(method: string, params: unknown[]) {
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
      for (let attempt = 0; attempt < 4; attempt++) {
        await scheduler.acquire(["eth_getLogs","eth_getBlockByNumber","eth_getBlockByHash","eth_getTransactionByHash"].includes(method));
        let response:Response;
        try { response = await fetch(attempt>0 && read && secondary!==upstream ? secondary : upstream, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(15000),
        }); } catch { if(attempt===3)throw new Error("RPC transport unavailable");await delay(250*(attempt+1));continue; }
        if(response.status>=500) {await delay(250*(attempt+1));continue;}
        const result = await response.json() as { result?: unknown; error?: { code: number; message: string; data?: unknown } };
        if (response.status === 429 || /limited to|rate limit/i.test(result.error?.message || "")) {
          await delay(1000 * (attempt + 1));
          continue;
        }
        if (result.error) throw result.error;
        if (!response.ok || !("result" in result)) throw new Error("Upstream RPC unavailable");
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
    res.end(JSON.stringify({ ok: true, waiting, queued:scheduler.pending(), requestsPerSecond: 1000 / spacing })); return;
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
