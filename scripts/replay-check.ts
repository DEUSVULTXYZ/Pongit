import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  http,
  parseAbiItem,
  decodeAbiParameters,
  type Hex,
} from "viem";
import { contractsFor } from "../shared/protocol";
import { json, type Deployment } from "../shared/protocol";
import { stateComponents as legacyComponents, advance as legacyAdvance } from "../shared/physics";
import { stateComponents as v2Components, advance as v2Advance, resume } from "../shared/physics-v2";
import { stateFromJson } from "../web/lib/api";
const d: Deployment = JSON.parse(
  await readFile(
    process.env.DEPLOYMENT_FILE || "deployments/local.json",
    "utf8",
  ),
);
const gameAbi=contractsFor(d).game;
const stateComponents=(d.version||1)>=2?v2Components:legacyComponents;
const advance=(d.version||1)>=2?v2Advance:legacyAdvance;
const client = createPublicClient({
  transport: http(
    process.env.ALCHEMY_RPC_URL ||
      process.env.RPC_URL ||
      "http://127.0.0.1:8545",
  ),
});
assert.equal(await client.getChainId(), d.chainId);
const id = BigInt(process.env.MATCH_ID || "3"),
  head = await client.getBlockNumber();
const logs: any[] = [];
const handicaps:any[]=[];
for (let from = BigInt(d.startBlock); from <= head; from += 100n)
  logs.push(
    ...(await client.getLogs({
      address: d.game,
      event: parseAbiItem(
        "event Snapshot(uint256 indexed matchId, uint64 version, bytes state, uint64 nextAt, uint8 nextKind, uint64 clock)",
      ),
      args: { matchId: id },
      fromBlock: from,
      toBlock: from + 99n < head ? from + 99n : head,
    })),
  );
assert(logs.length, "Match must have confirmed snapshots");
if((d.version||1)>=2)for(let from=BigInt(d.startBlock);from<=head;from+=100n)handicaps.push(...await client.getLogs({address:d.game,event:parseAbiItem("event HandicapSet(uint256 indexed matchId, int256 halfA, int256 halfB, uint256 paidA, uint256 paidB, uint64 at)"),args:{matchId:id},fromBlock:from,toBlock:from+99n<head?from+99n:head}));
const frames = [];
let after = "0";
for (;;) {
  const data = await fetch(
    `${process.env.E2E_API_URL || "http://localhost:4000"}/replay/${id}?after=${after}`,
  ).then((r) => r.json());
  assert(data.Frame, data.error);
  frames.push(...data.Frame);
  if (data.Frame.length < 1000) break;
  after = String(data.Frame.at(-1).version);
}
assert.equal(
  frames.length,
  logs.length,
  "Envio must contain every chain snapshot",
);
let previous: ReturnType<typeof stateFromJson> | undefined;
let transitions = 0;
for (let i = 0; i < logs.length; i++) {
  const event: { state?: Hex; version?: bigint } = logs[i].args;
  assert.equal(frames[i].state, event.state);
  assert.equal(BigInt(frames[i].version), event.version);
  const [decoded] = decodeAbiParameters(
    [{ type: "tuple", components: stateComponents }],
    event.state as Hex,
  );
  const state = stateFromJson(decoded);
  if (previous) {
    const pressure=handicaps.find(h=>h.transactionHash===logs[i].transactionHash && h.args.at===state.t);
    const predicted=previous.awaitingServe && !state.awaitingServe ? (()=>{assert(pressure,"Serve must have a confirmed handicap event");return resume(previous,state.t,pressure.args.paidA,pressure.args.paidB);})() : advance(previous,state.t,64)[0];
    if(pressure){assert.equal(state.halfA,pressure.args.halfA);assert.equal(state.halfB,pressure.args.halfB);}
    for (const key of ["x", "y", "left", "right", "scoreA", "scoreB"] as const)
      assert.equal(
        predicted[key],
        state[key],
        `Replay transition ${i}: ${key}`,
      );
    transitions++;
  }
  previous = state;
}
const m = await client.readContract({
  address: d.game,
  abi: gameAbi,
  functionName: "getMatch",
  args: [id],
});
assert(m.status >= 3, "Use a completed match");
for(const [key,value] of Object.entries(m.state))assert.equal((previous as any)[key],value,`Final state ${key}`);
const hashes = [...new Set(logs.map((l) => l.transactionHash!))];
const receipts = await Promise.all(
  hashes.map((hash) => client.getTransactionReceipt({ hash })),
);
const transactions = await Promise.all(
  hashes.map((hash) => client.getTransaction({ hash })),
);
const rows = receipts.map((r, i) => ({
  hash: r.transactionHash,
  gasUsed: r.gasUsed,
  gasLimit: transactions[i].gas,
  gasPrice: r.effectiveGasPrice,
  fee:
    (d.chainId === 10143 ? transactions[i].gas : r.gasUsed) *
    r.effectiveGasPrice,
  status: r.status,
}));
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/replay-evidence.json",
  json({
    network: d.chainId === 10143 ? "Monad testnet" : "Local Anvil",
    chainId: d.chainId,
    matchId: id,
    snapshots: logs.length,
    differentialReplayTransitions: transitions,
    confirmedFinalStateMatches: true,
    transitionFees: rows,
    totalTransitionFee: rows.reduce((s, r) => s + r.fee, 0n),
    excludes:
      "Creation, first reveal, market transactions and reverted calls; use match-cost for all game receipts",
    completedAt: new Date().toISOString(),
  }),
);
console.log(
  `PASS: ${logs.length} Envio snapshots equal chain events, ${transitions} replay transitions reconstructed, final state equal to contract.`,
);
