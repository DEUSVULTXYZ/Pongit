// Private VPS-only restart probe. Never writes a key or bearer cookie to disk.
import assert from "node:assert/strict";
import { readFile, writeFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import {
  createInterludeClient,
  memoryStore,
  decodeSession,
  storageKey,
} from "@interludelayer-sdk/sdk";
import { roomsAbi } from "../shared/abi-rooms";
const url = process.env.ROOMS_TEST_API;
assert.equal(url, "http://rooms-api:4000");
const m = JSON.parse(
    await readFile("deployments/interlude-rooms.json", "utf8"),
  ),
  owner = privateKeyToAccount(generatePrivateKey()),
  store = memoryStore();
const base = createPublicClient({
  chain: monadTestnet,
  transport: http("http://rooms-rpc:8545"),
});
const client = createInterludeClient({
  app: m.app,
  abi: roomsAbi,
  node: m.node,
  base,
  store,
  fastPath: true,
});
await client.openSession({
  wallet: createWalletClient({
    account: owner,
    chain: monadTestnet,
    transport: http(),
  }),
  scope: ["acceptMatch", "input", "tick", "cancelMatch", "concede"],
  expirySeconds: 1800,
});
const saved = decodeSession(
  store.get(storageKey(m.app, 10143, owner.address)),
)!;
let cookie = "";
async function api(path: string, body?: unknown) {
  const res = await fetch(url + "/interlude/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      origin: "https://pongit.xyz",
      "content-type": "application/json",
      "x-pongit-player": owner.address.toLowerCase(),
      cookie,
    },
    body: body
      ? JSON.stringify(body, (_, v) =>
          typeof v === "bigint" ? v.toString() : v,
        )
      : undefined,
  });
  const value = await res.json();
  assert(res.ok, value.error);
  if (res.headers.has("set-cookie"))
    cookie = res.headers.get("set-cookie")!.split(";")[0];
  return value;
}
const challenge = await api("auth/challenge", { player: owner.address });
await api("auth/session", {
  player: owner.address,
  nonce: challenge.nonce,
  signature: await privateKeyToAccount(saved.privateKey).signMessage({
    message: challenge.message,
  }),
  grant: saved.grant,
  grantSignature: saved.signature,
});
const operation = randomUUID(),
  created = await api("rooms", { operation }),
  started = Date.now();
await writeFile("artifacts/interlude-rooms/restart-requested", String(started));
while (true) {
  const signal = await stat("artifacts/interlude-rooms/restart-complete").catch(
    () => null,
  );
  if (signal && signal.mtimeMs >= started) break;
  if (Date.now() - started > 90000)
    throw Error("Coordinator restart was not signalled");
  await new Promise((r) => setTimeout(r, 500));
}
assert.equal((await api("rooms", { operation })).room, created.room);
assert.equal((await api("state")).room.id, created.room);
await api("rooms/leave", { operation: randomUUID() });
const report = {
  checkedAt: new Date().toISOString(),
  app: m.app,
  checks: [
    "Authenticated cookie survives coordinator restart",
    "Same operation UUID returns the original room after restart",
    "Room participation restored without a new grant or duplicate creation",
  ],
};
await writeFile(
  "artifacts/interlude-rooms/restart.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
