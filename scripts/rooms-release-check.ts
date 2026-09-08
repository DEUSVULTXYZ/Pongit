// Read-only promotion gate. Never opens a delegation, signs a grant or sends a transaction.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  http,
  parseAbi,
  zeroHash,
  type Address,
} from "viem";
import { monadTestnet } from "viem/chains";
import { createInterludeClient, memoryStore } from "@interludelayer-sdk/sdk";
import { roomsChaosAbi } from "../shared/abi-PongRoomsTestnet";
import { roomsLifecycleHubAbi } from "../shared/abi-rooms-lifecycle";

const file =
  process.env.INTERLUDE_ROOMS_MANIFEST || "deployments/interlude-rooms.json";
const m = JSON.parse(await readFile(file, "utf8"));
assert.equal(m.rulesVersion, 4);
assert.equal(m.baseChainId, 10143);
const base = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.RPC_URL || "https://testnet-rpc.monad.xyz", {
    retryCount: 0,
    timeout: 12000,
  }),
});
const engine = createInterludeClient({
  app: m.app,
  abi: roomsChaosAbi,
  node: m.node,
  base,
  store: memoryStore(),
  transport: http(m.node, { retryCount: 0, timeout: 8000 }),
});
const expectedEpoch = BigInt(process.env.ROOMS_EXPECTED_EPOCH || "0");
assert(expectedEpoch > 0n, "Set ROOMS_EXPECTED_EPOCH explicitly");
const [status, current, previous] = await Promise.all([
  engine.status(),
  base.readContract({
    address: m.hub,
    abi: roomsLifecycleHubAbi,
    functionName: "delegationOf",
    args: [m.app, zeroHash],
  }),
  base.readContract({
    address: m.hub,
    abi: roomsLifecycleHubAbi,
    functionName: "delegationOf",
    args: [m.previousClassic, zeroHash],
  }),
]);
assert.equal(status.app.toLowerCase(), m.app.toLowerCase());
assert.equal(status.chainId, 4242);
assert.equal(current.status, 1, "Delegation is not active");
assert.equal(current.epoch, expectedEpoch);
assert.equal(
  BigInt(status.epoch),
  expectedEpoch,
  "Hosted engine is on a different epoch",
);
assert(
  current.expiresAt > BigInt(Math.floor(Date.now() / 1000) + 7200),
  "Too little delegation lifetime remains",
);
assert.equal(
  status.pendingDiffs.length,
  0,
  "Unpublished engine changes remain",
);
const oldAbi = parseAbi([
  "function activeCount() view returns(uint256)",
  "function ratingOf(address) view returns(uint32 elo,uint32 played,uint32 wins,uint32 season)",
]);
const [liveActive, publishedActive, oldActive, rules, pinnedBlock] =
  await Promise.all([
    engine.read("activeCount"),
    base.readContract({
      address: m.app,
      abi: roomsChaosAbi,
      functionName: "activeCount",
    }),
    base.readContract({
      address: m.previousClassic,
      abi: oldAbi,
      functionName: "activeCount",
    }),
    engine.read("RULES_VERSION"),
    base.getBlock({ blockNumber: current.baseBlock }),
  ]);
assert.equal(liveActive, 0n);
assert.equal(publishedActive, 0n);
assert.equal(oldActive, 0n);
assert.equal(rules, 4n);
assert(
  previous.lastCommitAt <= pinnedBlock.timestamp,
  "Classic changed after the new engine's pinned base block",
);
const players: Address[] = JSON.parse(process.env.ROOMS_ELO_PLAYERS || "[]");
assert(
  players.length > 0,
  "Supply the existing Classic players to verify ELO inheritance",
);
const ratings = [];
for (const player of players) {
  const [old, next] = await Promise.all([
    base.readContract({
      address: m.previousClassic,
      abi: oldAbi,
      functionName: "ratingOf",
      args: [player],
    }),
    engine.read("ratingOf", [player, 0]),
  ]);
  assert.deepEqual(
    [next.elo, next.played, next.wins],
    old.slice(0, 3),
    `Classic rating mismatch for ${player}`,
  );
  ratings.push({ player, elo: next.elo, played: next.played, wins: next.wins });
}
const report = {
  checkedAt: new Date().toISOString(),
  passed: true,
  app: m.app,
  epoch: String(current.epoch),
  baseBlock: String(current.baseBlock),
  previousLastCommitAt: String(previous.lastCommitAt),
  liveActive: 0,
  publishedActive: 0,
  pendingDiffs: 0,
  ratings,
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/rooms-release-check.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
