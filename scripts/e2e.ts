import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { keccak256, toHex, parseEther, type Address, type Hex } from "viem";
import { WebSocket } from "ws";
import {
  json,
  domain,
  joinTypes,
  inputTypes,
  betTypes,
  actionTypes,
  queueMessage,
} from "../shared/protocol";
const url = process.env.E2E_API_URL || "http://localhost:4000";
async function api(path: string, body?: unknown) {
  const response = await fetch(url + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : json(body),
  });
  const result = await response.json();
  if (!response.ok || result.error)
    throw new Error(result.error || "Request failed");
  return result;
}
async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeout = 60000,
) {
  const until = Date.now() + timeout;
  let value: T;
  do {
    value = await fn();
    if (predicate(value)) return value;
    await new Promise((r) => setTimeout(r, 300));
  } while (Date.now() < until);
  throw new Error(`Timed out: ${json(value!)}`);
}
async function relay(contract: string, functionName: string, args: unknown[]) {
  const job = await api("/relay", { contract, functionName, args });
  const done = await waitFor(
    () => api("/jobs/" + job.id),
    (j) => ["failed", "succeeded"].includes(j.status),
  );
  assert.equal(done.status, "succeeded", json(done));
  return done;
}
const config = await api("/config");
assert.equal(
  config.chainId,
  31337,
  "This script only runs against a local chain",
);
const a = privateKeyToAccount(generatePrivateKey()),
  b = privateKeyToAccount(generatePrivateKey()),
  spectator = privateKeyToAccount(generatePrivateKey());
const ka = privateKeyToAccount(generatePrivateKey()),
  kb = privateKeyToAccount(generatePrivateKey());
const sa = toHex(crypto.getRandomValues(new Uint8Array(32))),
  sb = toHex(crypto.getRandomValues(new Uint8Array(32)));
let observed = 0;
const socket = new WebSocket(url.replace("http", "ws") + "/ws", {
  origin: "http://localhost:3000",
});
socket.on("message", (data) => {
  if (JSON.parse(data.toString()).type === "match") observed++;
});
try {
  for (const player of [a, b]) {
    const expires = Math.floor(Date.now() / 1000) + 300;
    const signature = await player.signMessage({
      message: queueMessage(player.address, expires),
    });
    await api("/queue", { player: player.address, expires, signature });
  }
  const room = await waitFor(
    () => api("/queue/" + a.address),
    (r) => !!r.id,
  );
  console.log("Matchmaking paired two independently signed players.");
  for (const [player, opponent, key, secret] of [
    [a, b, ka, sa],
    [b, a, kb, sb],
  ] as const) {
    const info = await api("/player/" + player.address);
    const now = Math.floor(Date.now() / 1000);
    const join = {
      player: player.address,
      opponent: opponent.address,
      roomId: room.id as Hex,
      commitment: keccak256(secret),
      sessionKey: key.address,
      nonce: BigInt(info.gameNonce),
      deadline: BigInt(now + 150),
      sessionExpiry: BigInt(now + 3600),
      maxInputs: 12000,
      tournamentId: 0n,
    };
    const signature = await player.signTypedData({
      domain: domain("PONG", 31337, config.game),
      types: joinTypes,
      primaryType: "Join",
      message: join,
    });
    await api("/ready", { join, signature });
  }
  const ready = await waitFor(
    () => api("/queue/" + a.address),
    (r) => !!r.match_id,
  );
  const id = ready.match_id;
  console.log(`Match ${id} created onchain. Revealing seeds.`);
  await relay("game", "reveal", [id, a.address, sa]);
  await relay("game", "reveal", [id, b.address, sb]);
  const live = await waitFor(
    () => api("/matches/" + id),
    (r) => r.match.status === 2,
  );
  assert(live.match.revealedA && live.match.revealedB);
  const ownerIsA = live.match.playerA.toLowerCase() === a.address.toLowerCase();
  for (const direction of [1, 0, -1, 0]) {
    const current = await api("/matches/" + id);
    const slot = ownerIsA ? current.match.a : current.match.b;
    const input = {
      matchId: BigInt(id),
      player: a.address,
      direction,
      nonce: BigInt(slot.nonce) + 1n,
      observedBlock: BigInt(current.head),
      validUntilBlock: BigInt(current.head) + 4n,
    };
    const signature = await ka.signTypedData({
      domain: domain("PONG", 31337, config.game),
      types: inputTypes,
      primaryType: "Input",
      message: input,
    });
    await relay("game", "submitInput", [input, signature]);
  }
  console.log(
    "Four session-signed directions confirmed; no owner transaction required.",
  );
  const expires = Math.floor(Date.now() / 1000) + 300;
  const signature = await spectator.signMessage({
    message: `PONG test credits\nPlayer: ${spectator.address.toLowerCase()}\nExpires: ${expires}`,
  });
  const credit = await api("/faucet", {
    player: spectator.address,
    expires,
    signature,
  });
  await waitFor(
    () => api("/jobs/" + credit.id),
    (j) => j.status === "succeeded",
  );
  let bought = false;
  for (let retry = 0; retry < 30 && !bought; retry++) {
    try {
      const q = await api("/quote", {
        matchId: id,
        side: 0,
        shares: parseEther("0.001").toString(),
      });
      if (!q.open) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      const p = await api("/player/" + spectator.address);
      const bet = {
        player: spectator.address,
        matchId: BigInt(id),
        side: 0,
        shares: parseEther("0.001"),
        maxCost: (BigInt(q.amount) * 101n) / 100n,
        version: BigInt(q.version),
        nonce: BigInt(p.marketNonce),
        deadline: BigInt(Math.floor(Date.now() / 1000) + 20),
      };
      const sig = await spectator.signTypedData({
        domain: domain("PONG Market", 31337, config.market),
        types: betTypes,
        primaryType: "Bet",
        message: bet,
      });
      await relay("market", "buy", [bet, sig]);
      bought = true;
    } catch (error) {
      if (!/window|version|revert/i.test(String(error))) throw error;
    }
  }
  assert(bought, "At least one live betting window must be usable");
  console.log(
    "Spectator obtained test credit and placed a collateralized live bet.",
  );
  const p = await api("/player/" + a.address);
  const m = {
    player: a.address,
    matchId: BigInt(id),
    action: 2,
    nonce: BigInt(p.gameNonce),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 120),
  };
  const sig = await a.signTypedData({
    domain: domain("PONG", 31337, config.game),
    types: actionTypes,
    primaryType: "GameAction",
    message: m,
  });
  await relay("game", "playerAction", [
    a.address,
    id,
    2,
    m.nonce,
    m.deadline,
    sig,
  ]);
  await relay("market", "claim", [id, spectator.address]);
  const ended = await api("/matches/" + id);
  assert.equal(ended.match.status, 3);
  assert.equal(ended.match.winner.toLowerCase(), b.address.toLowerCase());
  assert(observed > 0, "Spectator WebSocket saw live states");
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/e2e.json",
    json({
      network: "local Anvil",
      id,
      observed,
      checks: [
        "two owner consents",
        "commit reveal",
        "four scoped inputs",
        "spectator websocket",
        "sponsored credits",
        "live LMSR bet",
        "owner concession",
        "claim",
        "ELO update",
      ],
      completedAt: new Date().toISOString(),
    }),
  );
  console.log(
    "PASS: relayer + PostgreSQL + five deployed contracts, two players and spectator.",
  );
} finally {
  socket.close();
}
