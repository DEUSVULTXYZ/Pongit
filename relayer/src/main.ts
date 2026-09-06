import "dotenv/config";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  fallback,
  parseEther,
  parseGwei,
  keccak256,
  toHex,
  verifyMessage,
  recoverTypedDataAddress,
  decodeEventLog,
  parseTransaction,
  recoverTransactionAddress,
  type Hex,
  type Address,
  type Abi,
} from "viem";
import { monadTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  gameAbi,
  marketAbi,
  vaultAbi,
  tournamentsAbi,
} from "../../shared/abis";
import {
  json,
  encodeRequest,
  domain,
  joinTypes,
  queueMessage,
  cancelQueueMessage,
  type Deployment,
  type RelayRequest,
} from "../../shared/protocol";
import { next } from "../../shared/physics";
import { pool, initializeStore } from "./store";
import { readSponsorCosts } from "./budget";

const deployment: Deployment = JSON.parse(
  await readFile(
    process.env.DEPLOYMENT_FILE || "deployments/testnet.json",
    "utf8",
  ),
);
if (![10143, 31337].includes(deployment.chainId))
  throw new Error("Mainnet is disabled");
if (!process.env.RELAYER_PRIVATE_KEY || !process.env.DATABASE_URL)
  throw new Error("RELAYER_PRIVATE_KEY and DATABASE_URL required");
const origin = process.env.ALLOWED_ORIGIN || "http://localhost:3000";
const rpc =
  process.env.ALCHEMY_RPC_URL ||
  process.env.RPC_URL ||
  "https://testnet-rpc.monad.xyz";
const chain = defineChain({
  contracts: deployment.chainId === 10143 ? monadTestnet.contracts : undefined,
  id: deployment.chainId,
  name: "PONG test network",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const publicClient = createPublicClient({
  chain,
  batch: deployment.chainId === 10143 ? { multicall: { wait: 15, batchSize: 16384 } } : undefined,
  transport: fallback([
    http(rpc),
    ...(process.env.RPC_FALLBACK_URL && process.env.RPC_FALLBACK_URL !== rpc
      ? [http(process.env.RPC_FALLBACK_URL)]
      : []),
  ]),
  pollingInterval: 300,
});
if ((await publicClient.getChainId()) !== deployment.chainId)
  throw new Error("RPC chain does not match deployment");
const account = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as Hex);
const wallet = createWalletClient({ account, chain, transport: http(rpc) });
const signingLock = await initializeStore();
signingLock.on("error", () => { console.error("Signing lock lost; stopping to prevent concurrent nonce allocation"); process.exit(1); });
await pool.query(
  "CREATE TABLE IF NOT EXISTS deployment_binding (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), fingerprint text NOT NULL)",
);
const fingerprint = keccak256(
  toHex(
    json({
      chainId: deployment.chainId,
      game: deployment.game,
      vault: deployment.vault,
      market: deployment.market,
      tournaments: deployment.tournaments,
      signer: account.address,
    }),
  ),
);
await pool.query(
  "INSERT INTO deployment_binding(singleton,fingerprint) VALUES(true,$1) ON CONFLICT DO NOTHING",
  [fingerprint],
);
if (
  (await pool.query("SELECT fingerprint FROM deployment_binding")).rows[0]
    .fingerprint !== fingerprint
)
  throw new Error(
    "This journal belongs to another deployment or signer. Use a new database; never rebind queued transactions.",
  );
const dailyBudget = parseEther(process.env.RELAYER_DAILY_BUDGET_MON || "1");
const gasPriceCap = parseGwei(process.env.RELAYER_MAX_GAS_PRICE_GWEI || "200");
const minimumBalance = parseEther(
  process.env.RELAYER_MIN_BALANCE_MON || "0.01",
);
const maxQueue = Number(process.env.RELAYER_QUEUE_LIMIT || 500);
const allowed: Record<string, string[]> = {
  game: [
    "submitInput",
    "reveal",
    "authorizeSession",
    "playerAction",
    "cancelUnstarted",
    "cancelStalled",
  ],
  market: ["buy", "claim"],
  vault: ["withdraw"],
  tournaments: ["enter", "start", "attach", "advance", "cancel", "refund"],
};
const relaySchema = z.object({
  contract: z.enum(["game", "market", "vault", "tournaments"]),
  functionName: z.string().max(40),
  args: z.array(z.unknown()).max(12),
});
const rates = new Map<string, { count: number; until: number }>();
const matches = new Map<string, Awaited<ReturnType<typeof readMatch>>>();
type MatchView = { id: string; match: Awaited<ReturnType<typeof readMatch>>; clock: bigint; head: bigint; observedAt: number };
const matchViews = new Map<string, MatchView>();
const seededMarkets = new Set<string>();
const marketLockouts = new Map<string, bigint>();
let discoveryCursor = 1n;
let matchmakingTail: Promise<unknown> = Promise.resolve();
function serializeMatchmaking<T>(operation: () => Promise<T>): Promise<T> {
  const result = matchmakingTail.then(operation, operation);
  matchmakingTail = result.catch(() => {});
  return result;
}
let ladderCache: { until: number; value: unknown } | undefined;
let head = 0n,
  lastObserved = Date.now(),
  chainHealthy = true,
  lastError = "",
  fundingWarning = "",
  stopping = false;
function readMatch(id: bigint, blockNumber?: bigint) {
  return publicClient.readContract({
    address: deployment.game,
    abi: gameAbi,
    functionName: "getMatch",
    args: [id],
    blockNumber,
  });
}
function jobView(row: any) {
  const duration = (a: any, b: any) => a && b ? Math.max(0, Math.round(new Date(b).getTime() - new Date(a).getTime())) : null;
  return { id: row.id, status: row.status, tx_hash: row.tx_hash, error: row.error,
    timing: { queueMs: duration(row.created_at, row.signed_at), broadcastMs: duration(row.signed_at, row.submitted_at),
      confirmationMs: duration(row.submitted_at, row.confirmed_at), totalMs: duration(row.created_at, row.confirmed_at) } };
}
function matchView(id: string, m: Awaited<ReturnType<typeof readMatch>>, block: bigint, activeBlock: bigint, observedAt: number): MatchView {
  const clock = m.status === 2 && activeBlock >= m.startBlock ? (activeBlock - m.startBlock) * 300000n : m.state.t;
  return { id, match: m, clock, head: block, observedAt };
}
function send(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": origin,
    vary: "Origin",
    "x-content-type-options": "nosniff",
  });
  res.end(json(value));
}
async function body(req: IncomingMessage) {
  let value = "";
  for await (const part of req) {
    value += part;
    if (value.length > 64_000) throw new Error("Request too large");
  }
  return JSON.parse(value || "{}");
}
async function enqueue(payload: RelayRequest, internal = false, value = 0n) {
  if (!internal && !allowed[payload.contract]?.includes(payload.functionName))
    throw new Error("Call not sponsored");
  const encoded = encodeRequest(payload, deployment);
  const round =
    payload.contract === "tournaments" && payload.functionName === "advance"
      ? (
          await publicClient.readContract({
            address: deployment.tournaments,
            abi: tournamentsAbi,
            functionName: "getTournament",
            args: [BigInt(String(payload.args[0]))],
          })
        ).round
      : undefined;
  let id = keccak256(
    toHex(json({ ...payload, round, value: value.toString(), fingerprint })),
  );
  const existing = await pool.query(
    "SELECT id,status,tx_hash,error FROM relay_jobs WHERE id=$1",
    [id],
  );
  if (existing.rows[0]) {
    if (
      existing.rows[0].status !== "failed" ||
      !internal ||
      payload.functionName !== "open"
    )
      return existing.rows[0];
    const pending = await pool.query(
      "SELECT id,status FROM relay_jobs WHERE payload->>'contract'='market' AND payload->>'functionName'='open' AND payload->'args'->>0=$1 AND status IN ('queued','signed','sent') LIMIT 1",
      [String(payload.args[0])],
    );
    if (pending.rows[0]) return pending.rows[0];
    id = keccak256(toHex(`${id}:retry:${head}`));
  }
  const count = await pool.query(
    "SELECT count(*) FROM relay_jobs WHERE status IN ('queued','signed','sent')",
  );
  if (Number(count.rows[0].count) >= maxQueue)
    throw new Error("Queue full; try again later");
  // Reject invalid signatures and already-invalid operations before storing them.
  if (payload.functionName !== "submitInput") await publicClient.call({
    account: account.address,
    to: encoded.address,
    data: encoded.data,
    value,
  });
  await pool.query(
    "INSERT INTO relay_jobs(id,payload) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [id, json({ ...payload, value: value.toString() })],
  );
  return { id, status: "queued" };
}
let sponsorState: { at: number; value: Promise<readonly [bigint, number, bigint]> } | undefined;
function readSponsor() {
  if (!sponsorState || Date.now() - sponsorState.at > 2000) {
    sponsorState = { at: Date.now(), value: Promise.all([
      publicClient.getBalance({ address: account.address }),
      publicClient.getTransactionCount({ address: account.address, blockTag: "pending" }),
      publicClient.getGasPrice(),
    ]) };
    sponsorState.value.catch(() => { sponsorState = undefined; });
  }
  return sponsorState;
}
async function dispatch() {
  const unfinished = await pool.query(
    "SELECT * FROM relay_jobs WHERE status IN ('signed','sent') ORDER BY nonce LIMIT 8",
  );
  await Promise.all(unfinished.rows.map(async (row) => {
    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: row.tx_hash,
      });
      const saved = await pool.query(
        "UPDATE relay_jobs SET status=$2, receipt=$3, error=$4, confirmed_at=now(), updated_at=now() WHERE id=$1 RETURNING *",
        [
          row.id,
          receipt.status === "success" ? "succeeded" : "failed",
          json(receipt),
          receipt.status === "success" ? null : row.payload.functionName === "buy"
            ? "Bet not accepted onchain. The collision window or quote may have changed; request a fresh quote."
            : "Transaction reverted onchain. Refresh the state before trying again.",
        ],
      );
      if (
        receipt.status === "success" &&
        row.payload.functionName === "createMatch"
      ) {
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: gameAbi,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "MatchCreated")
              await pool.query("UPDATE rooms SET match_id=$2 WHERE job_id=$1", [
                row.id,
                decoded.args.matchId.toString(),
              ]);
          } catch {}
        }
      }
      broadcast({
        type: "job",
        ...jobView(saved.rows[0]),
      });
    } catch (error) {
      if ((error as Error).name !== "TransactionReceiptNotFoundError")
        throw error;
      // Re-broadcast precisely the persisted transaction after restart or transport failure.
      if (
        row.status === "signed" ||
        Date.now() - new Date(row.updated_at).getTime() > 5000
      ) {
        try {
          await publicClient.sendRawTransaction({
            serializedTransaction: row.raw_tx,
          });
        } catch (e) {
          if (!/already known|nonce too low/i.test(String(e))) throw e;
        }
        await pool.query(
          "UPDATE relay_jobs SET status='sent',submitted_at=coalesce(submitted_at,now()),updated_at=now() WHERE id=$1",
          [row.id],
        );
      }
    }
  }));
  if (unfinished.rowCount! >= 8) return;
  const pending = await pool.query(
    "SELECT * FROM relay_jobs WHERE status='queued' ORDER BY CASE WHEN payload->>'functionName'='submitInput' THEN 0 ELSE 1 END,created_at LIMIT 1",
  );
  const row = pending.rows[0];
  if (!row) return;
  try {
    const payload = row.payload as RelayRequest & { value: string };
    const encoded = encodeRequest(payload, deployment);
    const value = BigInt(payload.value || "0");
    // Below Monad's reserve threshold, value transfers need a quiet window.
    if (value > 0n && deployment.chainId === 10143) {
      const recent = await pool.query("SELECT max((receipt->>'blockNumber')::numeric) AS block FROM relay_jobs WHERE receipt IS NOT NULL");
      const block = recent.rows[0].block;
      if (unfinished.rowCount || (block && head <= BigInt(block) + 4n)) return;
    }
    const sponsor = readSponsor();
    const [balance, nextNonce, gasPrice] = await sponsor.value;
    if (gasPrice > gasPriceCap) {
      lastError = "Gas price above sponsor ceiling";
      return;
    }
    const estimated = await publicClient.estimateGas({
      account: account.address,
      to: encoded.address,
      data: encoded.data,
      value,
    });
    const gas = (estimated * 115n) / 100n + 1000n;
    const maxFeePerGas =
      gasPrice * 2n > gasPriceCap ? gasPriceCap : gasPrice * 2n;
    const cost = gas * maxFeePerGas + value;
    const { spent, commitments } = await readSponsorCosts(pool, new Date(sponsor.at));
    if (
      spent + cost > dailyBudget ||
      balance < cost + minimumBalance + commitments
    ) {
      fundingWarning = "Test MON sponsorship budget or balance exhausted. Funding or the next UTC budget window is required.";
      return;
    }
    fundingWarning = "";
    const reserved = await pool.query(
      "SELECT max(nonce) AS nonce FROM relay_jobs WHERE raw_tx IS NOT NULL",
    );
    const nonce = Math.max(
      nextNonce,
      reserved.rows[0].nonce === null ? 0 : Number(reserved.rows[0].nonce) + 1,
    );
    const raw = await wallet.signTransaction({
      to: encoded.address,
      data: encoded.data,
      value,
      nonce,
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas: 0n,
      type: "eip1559",
    });
    const txHash = keccak256(raw);
    await pool.query(
      "UPDATE relay_jobs SET status='signed',raw_tx=$2,tx_hash=$3,nonce=$4,cost=$5,signed_at=now(),updated_at=now() WHERE id=$1",
      [row.id, raw, txHash, nonce, cost.toString()],
    );
    await publicClient.sendRawTransaction({ serializedTransaction: raw });
    await pool.query(
      "UPDATE relay_jobs SET status='sent',submitted_at=now(),updated_at=now() WHERE id=$1",
      [row.id],
    );
  } catch (error) {
    // Signed jobs must remain recoverable; never allocate their nonce to a different payload.
    const failed = await pool.query(
      "UPDATE relay_jobs SET status='failed',error=$2,updated_at=now() WHERE id=$1 AND status='queued' RETURNING *",
      [row.id, safeError(error)],
    );
    if (failed.rows[0]) broadcast({ type: "job", ...jobView(failed.rows[0]) });
  }
}
function safeError(error: unknown) {
  return (
    (error as { shortMessage?: string }).shortMessage ||
    (error as Error).message ||
    "Request failed"
  )
    .replace(/https?:\/\/\S+/g, "[RPC]")
    .slice(0, 400);
}
function broadcast(value: unknown) {
  const message = json(value);
  for (const client of ws.clients)
    if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 256000)
      client.send(message);
}
async function refresh() {
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
  if (latest === head) return;
  const observedAt = Date.now();
  const existingIds = [...matches].filter(([, m]) => m.status < 3).map(([id]) => id);
  const [last, activeBlock, states] = await Promise.all([
    publicClient.readContract({ address: deployment.game, abi: gameAbi, functionName: "nextId", blockNumber: latest }),
    publicClient.readContract({ address: deployment.game, abi: gameAbi, functionName: "activeBlock", blockNumber: latest }),
    Promise.all(existingIds.map(id => readMatch(BigInt(id), latest))),
  ]);
  head = latest; lastObserved = observedAt; chainHealthy = true;
  const preloaded = new Map(existingIds.map((id, i) => [id, states[i]]));
  const ids = new Set(
    [...matches].filter(([, m]) => m.status < 3).map(([id]) => id),
  );
  for (let id = last > 20n ? last - 20n : 1n; id < last; id++)
    if (!matches.has(String(id))) ids.add(String(id));
  // Bounded restart discovery also finds active matches older than the recent list.
  for (let n = 0; n < 20 && discoveryCursor < last; n++, discoveryCursor++)
    ids.add(String(discoveryCursor));
  await Promise.all([...ids].filter(id => !preloaded.has(id)).map(async id => preloaded.set(id, await readMatch(BigInt(id), latest))));
  for (const rawId of ids) {
    const id = BigInt(rawId);
    const m = preloaded.get(rawId)!;
    matches.set(id.toString(), m);
    const frame = matchView(rawId, m, latest, activeBlock, observedAt);
    matchViews.set(rawId, frame);
    // Publish the coherent frame before provisioning markets or tournaments.
    broadcast({ type: "match", ...frame });
    if (
      (m.status === 1 || m.status === 2) &&
      !seededMarkets.has(id.toString())
    ) {
      const book = await publicClient.readContract({
        address: deployment.market,
        abi: marketAbi,
        functionName: "books",
        args: [id],
      });
      if (book[2] > 0n) seededMarkets.add(id.toString());
      else {
        const liquidity = parseEther(
          process.env.MARKET_LIQUIDITY_MON || "0.01",
        );
        const seed = (liquidity * 7n) / 10n + 1000000000n;
        try {
          await enqueue(
            {
              contract: "market",
              functionName: "open",
              args: [id.toString(), liquidity.toString()],
            },
            true,
            seed,
          );
        } catch {
          lastError =
            "Market provisioning unavailable; gameplay remains active";
        }
      }
    }
    if (m.tournamentId > 0n && m.status !== 4) {
      const t = await publicClient.readContract({
        address: deployment.tournaments,
        abi: tournamentsAbi,
        functionName: "getTournament",
        args: [m.tournamentId],
      });
      const slot = t.bracket.findIndex(
        (p) => p.toLowerCase() === m.playerA.toLowerCase(),
      );
      if (
        t.status === 2 &&
        slot >= 0 &&
        t.bracket[slot % 2 === 0 ? slot + 1 : slot - 1]?.toLowerCase() ===
          m.playerB.toLowerCase()
      ) {
        const pair = Math.floor(slot / 2);
        const attached = await publicClient.readContract({
          address: deployment.tournaments,
          abi: tournamentsAbi,
          functionName: "roundMatches",
          args: [m.tournamentId, t.round * 32n + BigInt(pair)],
        });
        if (attached !== id) {
          try {
            await enqueue(
              {
                contract: "tournaments",
                functionName: "attach",
                args: [String(m.tournamentId), pair, String(id)],
              },
              true,
            );
          } catch {
            /* An older round or an already occupied slot is enforced onchain. */
          }
        }
      }
    }
    const clock = frame.clock;
    if (
      m.status === 2 &&
      next(m.state).at <= clock
    ) {
      const pending = await pool.query(
        "SELECT id FROM relay_jobs WHERE status IN ('queued','signed','sent') AND payload->>'contract'='game' AND (payload->'args'->>0=$1 OR payload->'args'->0->>'matchId'=$1)",
        [id.toString()],
      );
      if (!pending.rowCount) {
        // Keeper IDs include the current block so a previously completed resolution is not reused.
        const payload = {
          contract: "game",
          functionName: "resolveEvent",
          args: [id.toString()],
          value: "0",
        };
        const jobId = keccak256(toHex(`keeper:${id}:${head}`));
        await pool.query(
          "INSERT INTO relay_jobs(id,payload) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [jobId, json(payload)],
        );
      }
    }
  }
  for (const [id, m] of matches)
    if (m.status >= 3 && BigInt(id) + 20n < last) { matches.delete(id); matchViews.delete(id); }
  broadcast({ type: "head", head, observedAt: lastObserved });
}
async function graphql(query: string, variables: unknown = {}) {
  if (!process.env.INDEXER_GRAPHQL_URL)
    throw new Error("Envio indexer not configured");
  const response = await fetch(process.env.INDEXER_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hasura-admin-secret": process.env.HASURA_ADMIN_SECRET || "",
    },
    body: json({ query, variables }),
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json();
  if (!response.ok || result.errors)
    throw new Error("Envio indexer unavailable");
  return result.data;
}
const server = createServer(async (req, res) => {
  try {
    if (req.headers.origin && req.headers.origin !== origin)
      return send(res, { error: "Origin denied" }, 403);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }
    const path = new URL(req.url || "/", "http://localhost").pathname;
    // Only enable behind a private reverse proxy which overwrites X-Real-IP.
    const ip =
      process.env.TRUST_PROXY === "true"
        ? String(req.headers["x-real-ip"] || req.socket.remoteAddress)
        : req.socket.remoteAddress || "unknown";
    const rate = rates.get(ip);
    if (!rate || rate.until < Date.now())
      rates.set(ip, { count: 1, until: Date.now() + 60000 });
    else if (++rate.count > 600) return send(res, { error: "Rate limit" }, 429);
    if (rates.size > 10000)
      for (const [key, r] of rates) if (r.until < Date.now()) rates.delete(key);
    if (req.method === "GET" && path === "/health") {
      const ok = chainHealthy && Date.now() - lastObserved < 15000;
      return send(
        res,
        { ok, head, queueError: fundingWarning || lastError, network: deployment.chainId },
        ok ? 200 : 503,
      );
    }
    if (req.method === "GET" && path === "/config")
      return send(res, {
        ...deployment,
        relayer: account.address,
        serverTimeMs: Date.now(),
        localDev:
          deployment.chainId === 31337 && process.env.LOCAL_DEV === "true",
      });
    if (req.method === "POST" && path === "/rpc") {
      const request = await body(req);
      const methods = [
        "eth_chainId",
        "eth_getBlockByNumber",
        "eth_blockNumber",
        "eth_getBalance",
        "eth_getTransactionCount",
        "eth_gasPrice",
        "eth_maxPriorityFeePerGas",
        "eth_feeHistory",
        "eth_estimateGas",
        "eth_call",
        "eth_getTransactionReceipt",
        "eth_getTransactionByHash",
        "eth_sendRawTransaction",
      ];
      if (!methods.includes(request.method)) return send(res, { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "RPC method not available" } });
      const targets = [
        deployment.game,
        deployment.market,
        deployment.vault,
        deployment.tournaments,
      ].map((a) => a.toLowerCase());
      if (
        ["eth_call", "eth_estimateGas"].includes(request.method) &&
        !targets.includes(String(request.params?.[0]?.to).toLowerCase())
      )
        throw new Error("Contract not available");
      if (request.method === "eth_sendRawTransaction") {
        const raw = request.params[0] as Hex;
        const tx = parseTransaction(raw);
        if (
          tx.chainId !== deployment.chainId ||
          !targets.includes(String(tx.to).toLowerCase())
        )
          throw new Error("Transaction outside deployment");
        const signer = await recoverTransactionAddress({
          serializedTransaction: raw as Parameters<
            typeof recoverTransactionAddress
          >[0]["serializedTransaction"],
        });
        const role = await publicClient.readContract({
          address: deployment.game,
          abi: gameAbi,
          functionName: "hasRole",
          args: [keccak256(toHex("ADMIN_ROLE")), signer],
        });
        if (!role)
          throw new Error(
            "Direct transaction endpoint is reserved for onchain administrators",
          );
      }
      const result = await publicClient.request({
        method: request.method,
        params: request.params,
      } as never);
      return send(res, { jsonrpc: "2.0", id: request.id, result });
    }
    if (req.method === "POST" && path === "/faucet") {
      const r = z
        .object({
          player: z.string().regex(/^0x[\da-fA-F]{40}$/),
          expires: z.number().int(),
          signature: z.string(),
        })
        .parse(await body(req));
      const message = `PONG test credits\nPlayer: ${r.player.toLowerCase()}\nExpires: ${r.expires}`;
      if (
        r.expires < Date.now() / 1000 ||
        r.expires > Date.now() / 1000 + 305 ||
        !(await verifyMessage({
          address: r.player as Address,
          message,
          signature: r.signature as Hex,
        }))
      )
        throw new Error("Invalid credit request");
      const player = r.player.toLowerCase();
      const existing = await pool.query(
        "SELECT job_id FROM faucets WHERE player=$1",
        [player],
      );
      if (existing.rows[0]) return send(res, { id: existing.rows[0].job_id });
      const job = await enqueue(
        { contract: "vault", functionName: "depositFor", args: [player] },
        true,
        parseEther(process.env.FAUCET_CREDIT_MON || "0.02"),
      );
      await pool.query(
        "INSERT INTO faucets(player,job_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [player, job.id],
      );
      return send(res, job, 202);
    }
    if (req.method === "GET" && path === "/matches")
      return send(res, {
        matches: [...matches].map(([id, m]) => ({ id, ...m })),
        head,
        observedAt: lastObserved,
      });
    if (req.method === "GET" && /^\/matches\/\d+$/.test(path)) {
      const id = BigInt(path.split("/")[2]);
      const cached = matchViews.get(String(id));
      const force = new URL(req.url!, "http://localhost").searchParams.has("fresh");
      if (!force && cached && (cached.match.status >= 3 || Date.now() - cached.observedAt < 2000)) return send(res, cached);
      const block = await publicClient.getBlockNumber({ cacheTime: 0 });
      const observedAt = Date.now();
      const [m, activeBlock] = await Promise.all([readMatch(id, block), publicClient.readContract({
        address: deployment.game, abi: gameAbi, functionName: "activeBlock", blockNumber: block,
      })]);
      return send(res, matchView(String(id), m, block, activeBlock, observedAt));
    }
    if (req.method === "GET" && path.startsWith("/jobs/")) {
      const row = await pool.query(
        "SELECT id,status,tx_hash,error,created_at,signed_at,submitted_at,confirmed_at FROM relay_jobs WHERE id=$1",
        [path.split("/")[2]],
      );
      return send(
        res,
        row.rows[0] ? jobView(row.rows[0]) : { error: "Job not found" },
        row.rowCount ? 200 : 404,
      );
    }
    if (req.method === "GET" && path.startsWith("/player/")) {
      const player = z
        .string()
        .regex(/^0x[\da-fA-F]{40}$/)
        .parse(path.split("/")[2]) as Address;
      const [
        rating,
        balance,
        gameNonce,
        marketNonce,
        vaultNonce,
        tournamentNonce,
        admin,
      ] = await Promise.all([
        publicClient.readContract({
          address: deployment.game,
          abi: gameAbi,
          functionName: "ratingOf",
          args: [player],
        }),
        publicClient.readContract({
          address: deployment.vault,
          abi: vaultAbi,
          functionName: "balances",
          args: [player],
        }),
        ...[
          deployment.game,
          deployment.market,
          deployment.vault,
          deployment.tournaments,
        ].map((address) =>
          publicClient.readContract({
            address,
            abi: vaultAbi,
            functionName: "nonces",
            args: [player],
          }),
        ),
        publicClient.readContract({
          address: deployment.game,
          abi: gameAbi,
          functionName: "hasRole",
          args: [keccak256(toHex("ADMIN_ROLE")), player],
        }),
      ]);
      return send(res, {
        rating,
        balance,
        gameNonce,
        marketNonce,
        vaultNonce,
        tournamentNonce,
        admin,
      });
    }
    if (req.method === "POST" && path === "/relay")
      return send(res, await enqueue(relaySchema.parse(await body(req))), 202);
    if (req.method === "POST" && path === "/queue") {
      return await serializeMatchmaking(async () => {
      const request = z
        .object({
          player: z.string().regex(/^0x[\da-fA-F]{40}$/),
          expires: z.number().int(),
          signature: z.string(),
          tournamentId: z.string().regex(/^\d+$/).default("0"),
        })
        .parse(await body(req));
      if (
        request.expires < Date.now() / 1000 ||
        request.expires > Date.now() / 1000 + 305 ||
        !(await verifyMessage({
          address: request.player as Address,
          message: queueMessage(
            request.player,
            request.expires,
            request.tournamentId,
          ),
          signature: request.signature as Hex,
        }))
      )
        throw new Error("Queue signature expired or invalid");
      if (
        [...matches.values()].filter((m) => m.status === 1 || m.status === 2)
          .length >= 4
      )
        throw new Error("All four arenas are occupied");
      const player = request.player.toLowerCase();
      if (
        [...matches.values()].some(
          (m) =>
            (m.status === 1 || m.status === 2) &&
            (m.playerA.toLowerCase() === player ||
              m.playerB.toLowerCase() === player),
        )
      )
        throw new Error(
          "Finish your active match before joining another queue",
        );
      const existing = await pool.query(
        "SELECT * FROM rooms WHERE (player_a=$1 OR player_b=$1) AND expires>$2 AND match_id IS NULL",
        [player, Math.floor(Date.now() / 1000)],
      );
      if (existing.rows[0]) return send(res, existing.rows[0]);
      await pool.query(
        "UPDATE rooms SET expires=$2 WHERE (player_a=$1 OR player_b=$1) AND match_id IS NOT NULL",
        [player, Math.floor(Date.now() / 1000) - 1],
      );
      let requiredOpponent: string | null = null;
      if (request.tournamentId !== "0") {
        const tournament = await publicClient.readContract({
          address: deployment.tournaments,
          abi: tournamentsAbi,
          functionName: "getTournament",
          args: [BigInt(request.tournamentId)],
        });
        const slot = tournament.bracket.findIndex(
          (p) => p.toLowerCase() === player,
        );
        if (tournament.status !== 2 || slot < 0)
          throw new Error("Not in an active tournament bracket");
        requiredOpponent =
          tournament.bracket[
            slot % 2 === 0 ? slot + 1 : slot - 1
          ].toLowerCase();
      }
      const rating = await publicClient.readContract({
        address: deployment.game,
        abi: gameAbi,
        functionName: "ratingOf",
        args: [player as Address],
      });
      await pool.query(
        "INSERT INTO queue_players(player,elo,expires,tournament_id,ticket) VALUES($1,$2,$3,$4,$5) ON CONFLICT(player) DO UPDATE SET elo=$2,expires=$3,tournament_id=$4,ticket=$5",
        [player, rating.elo, request.expires, request.tournamentId, keccak256(request.signature as Hex)],
      );
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        await db.query("SELECT pg_advisory_xact_lock(701338)");
        const opponent = await db.query(
          "SELECT * FROM queue_players WHERE player<>$1 AND expires>$2 AND tournament_id=$3 AND ($5::text IS NULL OR player=$5) ORDER BY abs(elo-$4),expires LIMIT 1 FOR UPDATE",
          [
            player,
            Math.floor(Date.now() / 1000),
            request.tournamentId,
            rating.elo,
            requiredOpponent,
          ],
        );
        if (opponent.rows[0]) {
          const room = toHex(randomBytes(32));
          await db.query(
            "INSERT INTO rooms(id,player_a,player_b,tournament_id,expires,ticket_a,ticket_b) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              room,
              player,
              opponent.rows[0].player,
              request.tournamentId,
              Math.floor(Date.now() / 1000) + 180,
              keccak256(request.signature as Hex),
              opponent.rows[0].ticket,
            ],
          );
          await db.query("DELETE FROM queue_players WHERE player IN ($1,$2)", [
            player,
            opponent.rows[0].player,
          ]);
        }
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      } finally {
        db.release();
      }
      return send(res, { queued: true });
      });
    }
    if (req.method === "GET" && path.startsWith("/queue/")) {
      const player = path.split("/")[2].toLowerCase();
      const row = await pool.query(
        "SELECT * FROM rooms WHERE (player_a=$1 OR player_b=$1) AND expires>$2 ORDER BY expires DESC LIMIT 1",
        [player, Math.floor(Date.now() / 1000)],
      );
      const waiting = await pool.query("SELECT ticket FROM queue_players WHERE player=$1 AND expires>$2", [player, Math.floor(Date.now()/1000)]);
      return send(res, row.rows[0] || { waiting: !!waiting.rowCount, ticket: waiting.rows[0]?.ticket });
    }
    if (req.method === "POST" && path === "/queue/cancel") {
      return await serializeMatchmaking(async () => {
        const r = z.object({player:z.string().regex(/^0x[\da-fA-F]{40}$/), ticket:z.string().regex(/^0x[\da-fA-F]{64}$/), expires:z.number().int(), signature:z.string()}).parse(await body(req));
        if (r.expires < Date.now()/1000 || r.expires > Date.now()/1000+305 || !(await verifyMessage({address:r.player as Address, message:cancelQueueMessage(r.player,r.ticket,r.expires,deployment.chainId,deployment.game), signature:r.signature as Hex}))) throw new Error("Cancellation signature expired or invalid");
        const player=r.player.toLowerCase();
        const db=await pool.connect();
        try {
          await db.query("BEGIN");
          await db.query("SELECT pg_advisory_xact_lock(701338)");
          const result=await db.query("SELECT * FROM rooms WHERE (player_a=$1 AND ticket_a=$2) OR (player_b=$1 AND ticket_b=$2) FOR UPDATE",[player,r.ticket]);
          const room=result.rows[0];
          if (room?.job_id) {
            await db.query("COMMIT");
            return send(res,{cancelled:false,reason:"submitted",jobId:room.job_id,matchId:room.match_id});
          }
          await db.query("DELETE FROM queue_players WHERE player=$1 AND ticket=$2",[player,r.ticket]);
          if (room) await db.query("DELETE FROM rooms WHERE id=$1 AND job_id IS NULL",[room.id]);
          await db.query("COMMIT");
          return send(res,{cancelled:true});
        } catch (e) {await db.query("ROLLBACK"); throw e;} finally {db.release();}
      });
    }
    if (req.method === "POST" && path === "/ready") {
      return await serializeMatchmaking(async () => {
      const request = await body(req);
      const encoded = encodeRequest(
        {
          contract: "game",
          functionName: "createMatch",
          args: [
            request.join,
            request.signature,
            request.join,
            request.signature,
          ],
        },
        deployment,
      );
      const join = encoded.args[0] as Parameters<
        typeof publicClient.readContract
      >[0] &
        Record<string, unknown>;
      const recovered = await recoverTypedDataAddress({
        domain: domain("PONG", deployment.chainId, deployment.game),
        types: joinTypes,
        primaryType: "Join",
        message: join as never,
        signature: request.signature,
      });
      if (recovered.toLowerCase() !== String(join.player).toLowerCase())
        throw new Error("Invalid join signature");
      const row = await pool.query(
        "SELECT * FROM rooms WHERE id=$1 AND expires>$2",
        [join.roomId, Math.floor(Date.now() / 1000)],
      );
      const room = row.rows[0];
      if (!room) throw new Error("Room expired");
      const player = recovered.toLowerCase();
      if (
        ![room.player_a, room.player_b].includes(player) ||
        String(join.opponent).toLowerCase() !==
          (player === room.player_a ? room.player_b : room.player_a) ||
        String(join.tournamentId) !== room.tournament_id
      )
        throw new Error("Wrong room");
      await pool.query(
        `UPDATE rooms SET ${player === room.player_a ? "join_a" : "join_b"}=$2 WHERE id=$1 AND job_id IS NULL`,
        [room.id, json(request)],
      );
      const ready = (
        await pool.query("SELECT * FROM rooms WHERE id=$1", [room.id])
      ).rows[0];
      if (ready.join_a && ready.join_b && !ready.job_id) {
        const job = await enqueue(
          {
            contract: "game",
            functionName: "createMatch",
            args: [
              ready.join_a.join,
              ready.join_a.signature,
              ready.join_b.join,
              ready.join_b.signature,
            ],
          },
          true,
        );
        await pool.query("UPDATE rooms SET job_id=$2 WHERE id=$1", [
          room.id,
          job.id,
        ]);
      }
      return send(res, { ready: true });
      });
    }
    if (req.method === "POST" && path === "/quote") {
      const r = z
        .object({
          matchId: z.string().regex(/^\d+$/),
          side: z.number().int().min(0).max(1),
          shares: z.string().regex(/^\d+$/),
        })
        .parse(await body(req));
      let lockout = marketLockouts.get(r.matchId);
      if (lockout === undefined) {
        const initialBook = await publicClient.readContract({ address: deployment.market, abi: marketAbi, functionName: "books", args: [BigInt(r.matchId)] });
        if (initialBook[2] > 0n) marketLockouts.set(r.matchId, initialBook[5]);
        lockout = initialBook[5];
      }
      const [amount, window, book, clock, m] = await Promise.all([
        publicClient.readContract({
          address: deployment.market,
          abi: marketAbi,
          functionName: "quote",
          args: [BigInt(r.matchId), r.side, BigInt(r.shares)],
        }),
        publicClient.readContract({
          address: deployment.game,
          abi: gameAbi,
          functionName: "bettingWindow",
          args: [BigInt(r.matchId), lockout],
        }),
        publicClient.readContract({ address: deployment.market, abi: marketAbi, functionName: "books", args: [BigInt(r.matchId)] }),
        publicClient.readContract({ address: deployment.game, abi: gameAbi, functionName: "clock", args: [BigInt(r.matchId)] }),
        readMatch(BigInt(r.matchId)),
      ]);
      return send(res, { amount, open: window[0], version: window[1], book, remainingUs: next(m.state).at - clock - lockout });
    }
    if (req.method === "GET" && path === "/leaderboard") {
      if (ladderCache && ladderCache.until > Date.now())
        return send(res, ladderCache.value);
      const players: any[] = [];
      let after = "";
      for (;;) {
        const data = await graphql(
          "query Players($after:String!){ Player(where:{id:{_gt:$after}},order_by:{id:asc},limit:1000){id address elo played wins season} }",
          { after },
        );
        players.push(...data.Player);
        if (data.Player.length < 1000) break;
        after = data.Player.at(-1).id;
      }
      // Lazy onchain season reset must also be reflected before a player's next match.
      const season = await publicClient.readContract({
        address: deployment.game,
        abi: gameAbi,
        functionName: "currentSeason",
      });
      const value = {
        Player: players
          .map((p) => {
            if (BigInt(p.season) >= season) return p;
            let elo = p.elo;
            for (let i = 0n; i < 16n && BigInt(p.season) + i < season; i++)
              elo = 1000 + Math.trunc((elo - 1000) / 2);
            return { ...p, elo, played: 0, wins: 0, season };
          })
          .sort((a, b) => b.elo - a.elo || a.id.localeCompare(b.id))
          .slice(0, 100),
      };
      ladderCache = { until: Date.now() + 5000, value };
      return send(res, value);
    }
    if (req.method === "GET" && path === "/history") {
      const before =
        new URL(req.url!, "http://localhost").searchParams.get("before") ||
        String(head + 1n);
      if (!/^\d+$/.test(before)) throw new Error("Invalid cursor");
      return send(
        res,
        await graphql(
          "query History($before:numeric!){ Match(where:{block:{_lt:$before}},order_by:{block:desc},limit:100){id playerA playerB tournamentId status winner block} }",
          { before },
        ),
      );
    }
    if (req.method === "GET" && path === "/alerts")
      return send(
        res,
        await graphql(
          "{ Alert(order_by:{block:desc},limit:100){id kind detail block} }",
        ),
      );
    if (req.method === "GET" && /^\/replay\/\d+$/.test(path)) {
      const url = new URL(req.url!, "http://localhost");
      const after = url.searchParams.get("after") || "0";
      return send(
        res,
        await graphql(
          "query Replay($id:String!,$after:numeric!){ Frame(where:{matchId:{_eq:$id},version:{_gt:$after}},order_by:{version:asc},limit:1000){id matchId version state clock block nextAt nextKind} }",
          { id: path.split("/")[2], after },
        ),
      );
    }
    if (req.method === "GET" && path === "/tournaments") {
      const end = await publicClient.readContract({
        address: deployment.tournaments,
        abi: tournamentsAbi,
        functionName: "nextId",
      });
      const items = [];
      for (let id = end > 20n ? end - 20n : 1n; id < end; id++)
        items.push({
          id,
          ...(await publicClient.readContract({
            address: deployment.tournaments,
            abi: tournamentsAbi,
            functionName: "getTournament",
            args: [id],
          })),
        });
      return send(res, { tournaments: items });
    }
    return send(res, { error: "Not found" }, 404);
  } catch (error) {
    console.error("HTTP request failed", req.method, req.url?.split("?")[0], String(error).replace(/https?:\/\/\S+/g, "[RPC]").slice(0, 1800));
    send(res, { error: safeError(error) }, 400);
  }
});
const ws = new WebSocketServer({ server, path: "/ws", maxPayload: 1024 });
ws.on("connection", (socket, req) => {
  if (req.headers.origin !== origin) {
    socket.close(1008, "Origin denied");
    return;
  }
  socket.send(json({ type: "head", head, observedAt: lastObserved }));
});
server.listen(Number(process.env.PORT || 4000), "0.0.0.0", () =>
  console.log(
    `PONG relayer listening on ${process.env.PORT || 4000}; chain ${deployment.chainId}`,
  ),
);
async function loop() {
  let failures = 0;
  while (!stopping) {
    try {
      lastError = "";
      await refresh();
      failures = 0;
    } catch (error) {
      failures++;
      chainHealthy = false;
      lastError = safeError(error);
      console.error(lastError);
    }
    await new Promise((r) => setTimeout(r, failures ? Math.min(10000, 500 * 2 ** Math.min(failures, 5)) : 150));
  }
}
void loop();
async function dispatchLoop() {
  while (!stopping) {
    try { if (chainHealthy) await dispatch(); }
    catch (error) { lastError = safeError(error); console.error(lastError); await new Promise(r => setTimeout(r, 1000)); }
    await new Promise(r => setTimeout(r, 50));
  }
}
void dispatchLoop();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stopping = true;
    ws.close();
    server.close();
    signingLock.release();
    void pool.end().then(() => process.exit(0));
  });
