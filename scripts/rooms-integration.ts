// Run only against the isolated rooms coordinator. Identities are ephemeral test keys.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import {
  createInterludeClient,
  memoryStore,
  decodeSession,
  storageKey,
} from "@interludelayer-sdk/sdk";
import { roomsAbi } from "../shared/abi-rooms";
const manifest = JSON.parse(
  await readFile("deployments/interlude-rooms.json", "utf8"),
);
const url = process.env.ROOMS_TEST_API;
assert(
  url?.startsWith("http://rooms-api:"),
  "Use the private test network only",
);
const base = createPublicClient({
  chain: monadTestnet,
  transport: http("https://testnet-rpc.monad.xyz", {
    retryCount: 0,
    timeout: 8000,
  }),
});
const makeClient = (store = memoryStore()) =>
  createInterludeClient({
    app: manifest.app,
    abi: roomsAbi,
    node: manifest.node,
    base,
    store,
    transport: http(manifest.node, { retryCount: 0, timeout: 5000 }),
    fastPath: true,
  });
const engine = makeClient(),
  players: any[] = [],
  checks: string[] = [],
  report: any = {
    app: manifest.app,
    startedAt: new Date().toISOString(),
    checks,
  };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => Promise<any>, label: string, ms = 35000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const v = await fn();
    if (v) return v;
    await wait(400);
  }
  throw Error("Timed out: " + label);
}
async function api(
  p: any,
  path: string,
  body?: any,
  options: { fail?: boolean; header?: string } = {},
) {
  const response = await fetch(url + "/interlude/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin: "https://pongit.xyz",
      "content-type": "application/json",
      ...(p?.cookie
        ? { cookie: p.cookie, "x-pongit-player": options.header || p.address }
        : {}),
    },
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body, (_, v) =>
            typeof v === "bigint" ? v.toString() : v,
          ),
  });
  const r = await response.json();
  if (response.headers.get("set-cookie"))
    p.cookie = response.headers.get("set-cookie")!.split(";")[0];
  if (!options.fail) assert(response.ok, `${path}: ${JSON.stringify(r)}`);
  return { status: response.status, ...r };
}
const action = (
  p: any,
  path: string,
  data: any = {},
  operation = randomUUID(),
) => api(p, path, { ...data, operation });
const state = (p: any) => api(p, "state");
const snapshot = (id: string) => engine.read("getSnapshot", [BigInt(id)]);
async function accept(p: any, o: any) {
  await action(p, "offers/accept", { id: o.id });
  const ticket = {
    id: BigInt(o.id),
    room: o.room,
    a: o.a,
    b: o.b,
    ranked: o.ranked,
    expires: BigInt(o.expires),
    rules: BigInt(o.rules),
    entropy: o.entropy,
  };
  await p.session.send("acceptMatch", [ticket, o.signature]);
}
let presence: ReturnType<typeof setInterval> | undefined;
try {
  await until(
    async () => (await api(null, "config")).online,
    "coordinator online",
    60000,
  );
  assert.equal(
    await engine.read("activeCount"),
    0n,
    "Do not interrupt pre-existing games",
  );
  for (let i = 0; i < 9; i++) {
    const owner = privateKeyToAccount(generatePrivateKey()),
      store = memoryStore(),
      client = makeClient(store);
    const session = await client.openSession({
      wallet: createWalletClient({
        account: owner,
        chain: monadTestnet,
        transport: http(),
      }),
      scope: ["acceptMatch", "input", "tick", "cancelMatch", "concede"],
      expirySeconds: 1800,
      assertDigest: true,
    });
    const p = {
      address: owner.address.toLowerCase(),
      session,
      client,
      cookie: "",
    };
    players.push(p);
    const stored = decodeSession(
      store.get(storageKey(manifest.app, 10143, owner.address)),
    )!;
    const challenge = await api(p, "auth/challenge", { player: p.address });
    const proof = await privateKeyToAccount(stored.privateKey).signMessage({
      message: challenge.message,
    });
    const auth = {
      player: p.address,
      nonce: challenge.nonce,
      signature: proof,
      grant: stored.grant,
      grantSignature: stored.signature,
    };
    await api(p, "auth/session", auth);
    await wait(1300);
    assert.equal(
      (await api(p, "auth/session", auth, { fail: true })).status,
      400,
    );
  }
  const [a, b, c, d, e, f, g, h, i] = players;
  assert.equal(
    (await api(a, "contacts", undefined, { header: b.address, fail: true }))
      .status,
    401,
  );
  checks.push(
    "Nine distinct signed sessions; nonce replay and cross-account cookie rejected",
  );
  presence = setInterval(
    () => void Promise.all(players.map((p) => state(p))).catch(() => {}),
    4000,
  );
  await action(a, "profile", {
    handle: "roomsqa" + Date.now().toString().slice(-8),
    avatar: 0,
  });
  await action(a, "contacts/add", { player: b.address });
  assert.equal((await api(a, "contacts")).contacts.length, 1);
  assert.equal((await api(b, "contacts")).contacts.length, 0);
  await action(a, "contacts/remove", { player: b.address });
  assert.equal((await api(a, "contacts")).contacts.length, 0);
  checks.push("Contact isolation, add/remove, profile save");
  const op = randomUUID();
  const [room, dup] = await Promise.all([
    action(a, "rooms", {}, op),
    action(a, "rooms", {}, op),
  ]);
  assert.equal(room.room, dup.room);
  for (const p of players.slice(1, 8))
    await action(p, "rooms/join", { room: room.room });
  assert.equal(
    (
      await api(
        i,
        "rooms/join",
        { room: room.room, operation: randomUUID() },
        { fail: true },
      )
    ).status,
    400,
  );
  let s = await state(a);
  assert.equal(s.room.members.length, 8);
  assert.equal(
    (await api(a, "queue", { operation: randomUUID() }, { fail: true })).status,
    400,
  );
  checks.push(
    "Idempotent creation, eight seats, full-room rejection, room/queue exclusivity",
  );
  const o = await until(
    async () => (await state(a)).room.offer,
    "first group offer",
  );
  await accept(a, o);
  assert.equal((await snapshot(o.id))[2], 1n);
  await accept(b, o);
  assert.equal((await snapshot(o.id))[2], 2n);
  await a.session.send("concede", [BigInt(o.id)]);
  const rotated = await until(async () => {
    const r = (await state(b)).room;
    return r.offer?.id !== o.id && r.offer?.status === "offered" ? r : null;
  }, "winner stays rotation");
  assert.deepEqual([rotated.offer.a, rotated.offer.b], [b.address, c.address]);
  assert.equal(
    rotated.members.sort((x: any, y: any) => x.position - y.position).at(-1)
      .player,
    a.address,
  );
  await action(a, "rooms/leave");
  assert.equal((await state(b)).room.host, b.address);
  await action(b, "offers/back", { id: rotated.offer.id });
  assert(
    (await state(b)).room.members.find((m: any) => m.player === b.address).away,
  );
  await action(b, "rooms/rejoin");
  checks.push(
    "Both consents required, winner stays, loser to tail, host handover, refusal and rejoin",
  );
  // Leave the group without submitting any next offer; no gameplay is abandoned.
  for (const p of players.slice(1, 8)) await action(p, "rooms/leave");
  const [ia, ib] = await Promise.all([
    action(a, "invitations", { player: b.address }),
    action(b, "invitations", { player: a.address }),
  ]);
  assert.equal(ia.room, ib.room);
  await action(a, "rooms/leave");
  await action(b, "rooms/leave");
  checks.push("Crossed invitations resolve to one room");
  const targeted = await action(a, "invitations", { player: b.address });
  assert.equal(
    (await api(i, "rooms/join", { room: targeted.room, operation: randomUUID() }, { fail: true })).status,
    400,
    "A targeted link cannot be accepted by another account",
  );
  await action(b, "rooms/join", { room: targeted.room });
  const timeoutOffer = await until(async () => (await state(a)).room.offer, "timeout proposal");
  await accept(a, timeoutOffer);
  await until(async () => (await snapshot(timeoutOffer.id))[2] === 4n, "one-sided proposal expires", 30000);
  await until(async () => (await state(b)).room.members.find((m:any) => m.player === b.address).away, "nonresponding player is away");
  await action(a, "rooms/leave");
  await action(b, "rooms/leave");
  checks.push("Targeted link reserved for recipient; one-sided acceptance expires without ELO and marks absent rival away");
  for (const p of [a, b, c, d, e, f]) await action(p, "queue");
  const arenas = await until(async () => {
    const rs = await Promise.all([a, c, e].map(state));
    return rs.filter((s) => s.room?.offer?.status === "offered").length === 2
      ? rs
      : null;
  }, "two arenas and third waiting");
  report.capacity = arenas.map((s: any) => ({
    status: s.room.status,
    offer: s.room.offer?.id,
  }));
  assert(arenas.some((s: any) => s.room.status === "capacity"));
  const offers = arenas
    .filter((s: any) => s.room.offer)
    .map((s: any) => s.room.offer);
  for (const off of offers) {
    await accept(
      players.find((p) => p.address === off.a),
      off,
    );
    await accept(
      players.find((p) => p.address === off.b),
      off,
    );
  }
  assert.equal(await engine.read("activeCount"), 2n);
  const delays: number[] = [];
  for (let n = 0; n < 25; n++)
    await Promise.all(
      offers.map(async (off: any) => {
        const s = await snapshot(off.id),
          p = players.find((p) => p.address === off.a),
          at = performance.now();
        await p.session.send("input", [
          BigInt(off.id),
          n % 2 ? 1 : -1,
          s[9] + 1n,
          s[7] + 150n,
        ]);
        delays.push(performance.now() - at);
      }),
    );
  for (const off of offers) {
    const p = players.find((p) => p.address === off.a);
    await p.session.send("concede", [BigInt(off.id)]);
    const winner = await engine.read("ratingOf", [off.b]);
    assert.equal(winner.elo, 1032);
    assert.equal((await engine.read("ratingOf", [off.a])).elo, 968);
  }
  delays.sort((a, b) => a - b);
  report.inputLatencyMs = {
    count: delays.length,
    p50: delays[Math.floor(delays.length * 0.5)],
    p95: delays[Math.floor(delays.length * 0.95)],
    max: delays.at(-1),
  };
  await until(
    async () => {
      const s = await state(e);
      return s.room?.offer?.status === "offered";
    },
    "third pair admitted",
    45000,
  );
  checks.push(
    "Two simultaneous isolated arenas, sequential commands, exact 1032/968 ELO, queued third admission",
  );
  report.players = players.map((p) => p.address);
  report.finishedAt = new Date().toISOString();
} catch (error) {
  report.failure = (error as Error).message;
  process.exitCode = 1;
  console.error(report.failure);
} finally {
  clearInterval(presence);
  await mkdir("artifacts/interlude-rooms", { recursive: true });
  await writeFile(
    "artifacts/interlude-rooms/integration.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
