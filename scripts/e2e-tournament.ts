import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  parseEther,
  type Hex,
} from "viem";
import { foundry, monadTestnet } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { DEV_KEY } from "./local-chain";
import {
  domain,
  joinTypes, joinV2Types, queueV2Message,
  enterTypes,
  actionTypes,
  queueMessage,
  json,
} from "../shared/protocol";
import { tournamentsAbi, vaultAbi } from "../shared/abis";
const base = process.env.E2E_API_URL || "http://localhost:4000";
async function api(path: string, body?: unknown) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : json(body),
  });
  const d = await r.json();
  assert(r.ok && !d.error, d.error);
  return d;
}
async function until<T>(read: () => Promise<T>, done: (v: T) => boolean) {
  for (let i = 0; i < 150; i++) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Tournament step timed out");
}
async function relay(contract: string, functionName: string, args: unknown[]) {
  const job = await api("/relay", { contract, functionName, args });
  const done = await until(
    () => api("/jobs/" + job.id),
    (j) => j.status === "succeeded" || j.status === "failed",
  );
  assert.equal(done.status, "succeeded", json(done));
}
const config = await api("/config");
assert([31337,10143].includes(config.chainId), "Test networks only");
if(config.chainId===10143) assert(process.env.E2E_ALLOW_TESTNET==="true" && process.env.ADMIN_PRIVATE_KEY,"Explicit funded testnet operator required");
const targetChain=config.chainId===10143?monadTestnet:foundry;
const rpc=process.env.RPC_URL||"http://127.0.0.1:8545";
assert(
  (await api("/matches")).matches.every(
    (m: { status: number }) => m.status >= 3,
  ),
  "Wait until all other local games have ended",
);
const client = createPublicClient({
  chain: targetChain,
  transport: http(rpc),
  pollingInterval: 100,
});
const wallet = createWalletClient({
  account: privateKeyToAccount((process.env.ADMIN_PRIVATE_KEY||DEV_KEY) as Hex),
  chain: targetChain,
  transport: http(rpc),
});
const players = Array.from({ length: 4 }, () =>
  privateKeyToAccount(generatePrivateKey()),
);
const tid = await client.readContract({
  address: config.tournaments,
  abi: tournamentsAbi,
  functionName: "nextId",
});
const hash = await wallet.writeContract({
  address: config.tournaments,
  abi: tournamentsAbi,
  functionName: "create",
  args: [BigInt(Math.floor(Date.now() / 1000) + 600), 4, 0n],
  value: parseEther("0.01"),
});
await client.waitForTransactionReceipt({ hash });
for (const player of players) {
  const info = await api("/player/" + player.address);
  const m = {
    player: player.address,
    tournamentId: tid,
    nonce: BigInt(info.tournamentNonce),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 120),
  };
  const signature = await player.signTypedData({
    domain: domain("PONG Tournaments", config.chainId, config.tournaments),
    types: enterTypes,
    primaryType: "Enter",
    message: m,
  });
  await relay("tournaments", "enter", [
    tid,
    player.address,
    m.nonce,
    m.deadline,
    signature,
  ]);
}
await relay("tournaments", "start", [tid]);
const matchIds: string[] = [];
for (let round = 0; round < 2; round++) {
  const t = await client.readContract({
    address: config.tournaments,
    abi: tournamentsAbi,
    functionName: "getTournament",
    args: [tid],
  });
  assert.equal(t.round, BigInt(round));
  for (let slot = 0; slot < t.bracket.length / 2; slot++) {
    const pair = [t.bracket[slot * 2], t.bracket[slot * 2 + 1]].map(
      (address) =>
        players.find((p) => p.address.toLowerCase() === address.toLowerCase())!,
    );
    for (const player of pair) {
      const expires = Math.floor(Date.now() / 1000) + 300;
      const signature = await player.signMessage({
        message: config.version===2?queueV2Message(player.address,expires,String(tid),0,config):queueMessage(player.address, expires, String(tid)),
      });
      await api("/queue", {
        player: player.address,
        expires,
        signature,
        tournamentId: String(tid),
      });
    }
    const room = await until(
      () => api("/queue/" + pair[0].address),
      (r) => !!r.id,
    );
    const secrets = [
      toHex(crypto.getRandomValues(new Uint8Array(32))),
      toHex(crypto.getRandomValues(new Uint8Array(32))),
    ];
    for (let i = 0; i < 2; i++) {
      const p = pair[i],
        info = await api("/player/" + p.address);
      const now = Math.floor(Date.now() / 1000);
      const join = {
        player: p.address,
        opponent: pair[1 - i].address,
        roomId: room.id as Hex,
        commitment: keccak256(secrets[i]),
        sessionKey: privateKeyToAccount(generatePrivateKey()).address,
        nonce: BigInt(info.gameNonce),
        deadline: BigInt(now + 120),
        sessionExpiry: BigInt(now + 600),
        maxInputs: 1000,
        tournamentId: tid, mode:0,ranked:true,rulesVersion:2,
      };
      const signature = await p.signTypedData({
        domain: domain("PONG", config.chainId, config.game),
        types: config.version===2?joinV2Types:joinTypes,
        primaryType: "Join",
        message: join,
      });
      await api("/ready", { join, signature });
    }
    const ready = await until(
      () => api("/queue/" + pair[0].address),
      (r) => !!r.match_id,
    );
    const id = ready.match_id;
    matchIds.push(id);
    for (let i = 0; i < 2; i++)
      await relay("game", "reveal", [id, pair[i].address, secrets[i]]);
    await until(
      () =>
        client.readContract({
          address: config.tournaments,
          abi: tournamentsAbi,
          functionName: "roundMatches",
          args: [tid, BigInt(round * 32 + slot)],
        }),
      (value) => value === BigInt(id),
    );
    const p = pair[0],
      info = await api("/player/" + p.address);
    const action = {
      player: p.address,
      matchId: BigInt(id),
      action: 2,
      nonce: BigInt(info.gameNonce),
      deadline: BigInt(Math.floor(Date.now() / 1000) + 120),
    };
    const sig = await p.signTypedData({
      domain: domain("PONG", config.chainId, config.game),
      types: actionTypes,
      primaryType: "GameAction",
      message: action,
    });
    await relay("game", "playerAction", [
      p.address,
      id,
      2,
      action.nonce,
      action.deadline,
      sig,
    ]);
  }
  await relay("tournaments", "advance", [tid]);
  console.log(`Tournament ${tid}: round ${round + 1} settled.`);
}
const final = await client.readContract({
  address: config.tournaments,
  abi: tournamentsAbi,
  functionName: "getTournament",
  args: [tid],
});
assert.equal(final.status, 3);
assert.equal(
  await client.readContract({
    address: config.vault,
    abi: vaultAbi,
    functionName: "balances",
    args: [final.winner],
  }),
  parseEther("0.01"),
);
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/tournament-e2e.json",
  json({
    network: config.chainId===10143?"Monad testnet":"local Anvil",
    tournamentId: tid,
    matchIds,
    winner: final.winner,
    prize: "0.01 MON",
    checks: [
      "four signatures",
      "bracket-constrained matchmaking",
      "automatic attachment",
      "two distinct round advances",
      "winner vault credit",
    ],
    completedAt: new Date().toISOString(),
  }),
);
console.log(
  "PASS: four-player tournament through relayer, three matches, two rounds, exact winner payout.",
);
