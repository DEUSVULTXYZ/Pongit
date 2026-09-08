import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool, PoolClient } from "pg";
import type { WebSocket } from "ws";
import {
  createPublicClient,
  http,
  recoverMessageAddress,
  recoverTypedDataAddress,
  encodeFunctionData,
  keccak256,
  toFunctionSelector,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createInterludeClient,
  memoryStore,
  sessionGrantTypedData,
  sendFast,
  type SessionGrant,
} from "@interludelayer-sdk/sdk";
import { monadTestnet } from "viem/chains";
import { z } from "zod";
import { roomsAbi } from "../../shared/abi-rooms";
import { interludeHubReadAbi } from "../../shared/abi-interlude";
import {
  roomAuthMessage,
  offerTypes,
  nextPair,
  rotateMembers,
  type LobbyRoom,
  type LobbyOffer,
  type RoomKind,
} from "../../shared/rooms";

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((s) => s.toLowerCase());
const idSchema = z.string().regex(/^0x[0-9a-f]{64}$/);
const signatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/);
const hex = () => `0x${randomBytes(32).toString("hex")}` as Hex;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const json = (v: unknown) =>
  JSON.stringify(v, (_, v) => (typeof v === "bigint" ? v.toString() : v));
type Invitation = {
  id: string;
  room: string;
  creator: string;
  recipient: string;
  expires: number;
  status: string;
};
type State = {
  rooms: Record<string, LobbyRoom>;
  queue: { player: string; elo: number; at: number; seen: number }[];
  invites: Invitation[];
};
type Options = {
  db: Pool;
  origin: string;
  body: (r: IncomingMessage) => Promise<any>;
  send: (r: ServerResponse, v: unknown, status?: number) => void;
  graphql: (q: string, v?: any) => Promise<any>;
};
export async function createRoomsCoordinator(o: Options) {
  if (!process.env.INTERLUDE_COORDINATOR_KEY) return null;
  const manifest = JSON.parse(
    await readFile(
      process.env.INTERLUDE_ROOMS_MANIFEST ||
        "deployments/interlude-rooms.json",
      "utf8",
    ),
  );
  const signer = privateKeyToAccount(
    process.env.INTERLUDE_COORDINATOR_KEY as Hex,
  );
  if (signer.address.toLowerCase() !== manifest.coordinator.toLowerCase())
    throw new Error("Rooms admission signer mismatch");
  const app = manifest.app.toLowerCase() as Address,
    base = createPublicClient({
      chain: monadTestnet,
      transport: http(process.env.RPC_URL || "https://testnet-rpc.monad.xyz", {
        retryCount: 0,
        timeout: 8000,
      }),
    });
  const client = createInterludeClient({
    app,
    abi: roomsAbi,
    node: manifest.node,
    base,
    store: memoryStore(),
    transport: http(manifest.node, { retryCount: 0, timeout: 4000 }),
  });
  const db = o.db;
  await db.query(`
 CREATE TABLE IF NOT EXISTS il_lobby(app text PRIMARY KEY,document jsonb NOT NULL);
 CREATE TABLE IF NOT EXISTS il_occupancy(app text NOT NULL,player text NOT NULL,room text NOT NULL,PRIMARY KEY(app,player));
 CREATE TABLE IF NOT EXISTS il_contacts(player text NOT NULL,contact text NOT NULL,PRIMARY KEY(player,contact));
 CREATE TABLE IF NOT EXISTS il_nonces(nonce text PRIMARY KEY,player text NOT NULL,expires bigint NOT NULL,app text NOT NULL);
 CREATE TABLE IF NOT EXISTS il_sessions(token text PRIMARY KEY,player text NOT NULL,signer text NOT NULL,expires bigint NOT NULL,epoch text NOT NULL,app text NOT NULL);
 CREATE TABLE IF NOT EXISTS il_operations(app text NOT NULL,player text NOT NULL,id text NOT NULL,request_hash text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(app,player,id));
 CREATE TABLE IF NOT EXISTS il_results(app text NOT NULL,id text NOT NULL,room text NOT NULL,a text NOT NULL,b text NOT NULL,winner text NOT NULL,phase integer NOT NULL,ranked boolean NOT NULL,score_a integer NOT NULL,score_b integer NOT NULL,hash text NOT NULL,published boolean NOT NULL DEFAULT false,ended_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(app,id));
 CREATE TABLE IF NOT EXISTS il_engine_jobs(app text NOT NULL,id text NOT NULL,nonce bigint NOT NULL,raw text NOT NULL,hash text NOT NULL,status text NOT NULL,PRIMARY KEY(app,id),UNIQUE(app,nonce));
 CREATE TABLE IF NOT EXISTS il_offers(app text NOT NULL,id text NOT NULL,room text NOT NULL,offer jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(app,id));
 ALTER TABLE il_results ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT true;
 CREATE INDEX IF NOT EXISTS il_results_players ON il_results(a,b,ended_at);
 `);
  await db.query("INSERT INTO il_lobby VALUES($1,$2) ON CONFLICT DO NOTHING", [
    app,
    { rooms: {}, queue: [], invites: [] },
  ]);
  let publicLadder: Promise<any> | undefined, publicLadderAt = 0;
  const sockets = new Map<
    WebSocket,
    { req: IncomingMessage; player: string }
  >();
  let online = false,
    admissionHealthy = false,
    lastEngineSeen = 0,
    lastCheck = 0,
    lastError = "Connecting to the game service",
    cycle = false,
    lastEpoch = -1,
    legacyAt = 0,
    resultAuditAt = 0,
    ratingAt = 0,
    auditOffset = 0;
  const epochs = new Map<string, { value: bigint; at: number }>();
  const ratings = new Map<string, { live: any; published: any }>();
  let legacyResults: any[] = [];
  const current = async () =>
    (await db.query("SELECT document FROM il_lobby WHERE app=$1", [app]))
      .rows[0].document as State;
  const occupant = (s: State, p: string) =>
    Object.values(s.rooms).find(
      (r) => r.status !== "closed" && r.members.some((m) => m.player === p),
    );
  const cookie = (token: string, age: number) =>
    `pongit_rooms=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${o.origin.startsWith("https:") ? "; Secure" : ""}`;
  async function authenticate(req: IncomingMessage, expected?: string) {
    const token = /(?:^|;\s*)pongit_rooms=([a-f0-9]{64})(?:;|$)/.exec(
      req.headers.cookie || "",
    )?.[1];
    if (!token) throw new Error("Renew your arcade session to continue.");
    const r = (
      await db.query(
        "SELECT * FROM il_sessions WHERE token=$1 AND app=$2 AND expires>$3",
        [hash(token), app, Math.floor(Date.now() / 1000)],
      )
    ).rows[0];
    if (!r) throw new Error("Renew your arcade session to continue.");
    if (
      (expected || req.headers["x-pongit-player"])?.toString().toLowerCase() !==
      r.player
    )
      throw new Error(
        "Renew your arcade session: account changed in another tab.",
      );
    let epoch = epochs.get(r.player);
    if (!epoch || Date.now() - epoch.at > 5000) {
      epoch = { value: await client.epochOf(r.player), at: Date.now() };
      epochs.set(r.player, epoch);
    }
    if (epoch.value !== BigInt(r.epoch))
      throw new Error("Arcade session revoked. Reconnect.");
    return r.player as string;
  }
  async function transact<T>(
    fn: (s: State, c: PoolClient) => Promise<T>,
    operation?: { player: string; id: string; request: string },
  ) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(701339)");
      if (operation) {
        const old = (
          await c.query(
            "SELECT * FROM il_operations WHERE app=$1 AND player=$2 AND id=$3",
            [app, operation.player, operation.id],
          )
        ).rows[0];
        if (old) {
          if (old.request_hash !== hash(operation.request))
            throw new Error("Operation id already used for another action.");
          await c.query("COMMIT");
          return old.response as T;
        }
      }
      const state = (
        await c.query("SELECT document FROM il_lobby WHERE app=$1 FOR UPDATE", [
          app,
        ])
      ).rows[0].document as State;
      const result = await fn(state, c);
      await c.query("DELETE FROM il_occupancy WHERE app=$1", [app]);
      for (const room of Object.values(state.rooms))
        if (room.status !== "closed")
          for (const m of room.members)
            await c.query("INSERT INTO il_occupancy VALUES($1,$2,$3)", [
              app,
              m.player,
              room.id,
            ]);
      for (const q of state.queue)
        await c.query("INSERT INTO il_occupancy VALUES($1,$2,'queue')", [
          app,
          q.player,
        ]);
      for (const room of Object.values(state.rooms))
        if (room.offer)
          await c.query(
            "INSERT INTO il_offers(app,id,room,offer) VALUES($1,$2,$3,$4) ON CONFLICT(app,id) DO UPDATE SET offer=$4",
            [app, room.offer.id, room.id, room.offer],
          );
      await c.query("UPDATE il_lobby SET document=$2 WHERE app=$1", [
        app,
        state,
      ]);
      if (operation)
        await c.query(
          "INSERT INTO il_operations(app,player,id,request_hash,response) VALUES($1,$2,$3,$4,$5)",
          [
            app,
            operation.player,
            operation.id,
            hash(operation.request),
            result ?? {},
          ],
        );
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  function available(s: State, p: string) {
    if (occupant(s, p) || s.queue.some((q) => q.player === p))
      throw new Error("This player is already in a room or matchmaking.");
  }
  function makeRoom(s: State, p: string, kind: RoomKind) {
    const now = Date.now(),
      r: LobbyRoom = {
        id: hex(),
        host: p,
        kind,
        members: [
          { player: p, joined: now, position: 0, away: false, seen: now },
        ],
        status: "waiting",
        created: now,
        activity: now,
      };
    s.rooms[r.id] = r;
    return r;
  }
  async function blocked(c: PoolClient, a: string, b: string) {
    return !!(
      await c.query(
        "SELECT 1 FROM player_blocks WHERE (player=$1 AND blocked=$2) OR (player=$2 AND blocked=$1)",
        [a, b],
      )
    ).rowCount;
  }
  async function invite(
    s: State,
    c: PoolClient,
    r: LobbyRoom,
    p: string,
    target: string,
  ) {
    if (target === p || (await blocked(c, p, target)))
      throw new Error("This player cannot receive your invitation.");
    const now = Date.now(),
      existing = s.invites.find(
        (i) =>
          i.room === r.id &&
          i.recipient === target &&
          i.status === "pending" &&
          i.expires > now,
      );
    if (existing) return existing;
    if (
      s.invites.filter((i) => i.creator === p && i.expires > now).length >= 20
    )
      throw new Error("Invitation limit reached. Try again later.");
    if (
      s.invites.filter(
        (i) => i.creator === p && i.recipient === target && i.expires > now,
      ).length >= 3
    )
      throw new Error("An invitation was already sent to this player.");
    const item: Invitation = {
      id: hex(),
      room: r.id,
      creator: p,
      recipient: target,
      expires: now + 600000,
      status: "pending",
    };
    s.invites.push(item);
    return item;
  }
  async function profileNames(players: string[]) {
    if (!players.length) return [];
    return (
      await db.query(
        "SELECT player,handle,avatar FROM profiles WHERE player=ANY($1)",
        [players],
      )
    ).rows;
  }
  async function view(p: string) {
    const s = await current(),
      room = occupant(s, p);
    const inbox = s.invites.filter(
      (i) =>
        i.recipient === p && i.status === "pending" && i.expires > Date.now(),
    );
    const own = s.invites.filter(
      (i) => i.creator === p && i.expires > Date.now(),
    );
    return {
      player: p,
      room,
      queue: s.queue.find((q) => q.player === p),
      inbox,
      outbox: own,
      profiles: await profileNames([
        ...new Set([
          p,
          ...(room?.members.map((m) => m.player) || []),
          ...inbox.map((i) => i.creator),
        ]),
      ]),
      rating: ratings.get(p),
      online,
      admission:
        online &&
        admissionHealthy &&
        process.env.ROOMS_ADMISSION_ENABLED === "true",
      error: online ? "" : lastError,
    };
  }
  async function notify() {
    for (const [socket, info] of sockets) {
      if (socket.readyState !== 1) {
        sockets.delete(socket);
        continue;
      }
      try {
        await authenticate(info.req, info.player);
        socket.send(json({ type: "rooms-changed" }));
      } catch {
        socket.send(json({ type: "rooms-expired" }));
        socket.close(1008);
        sockets.delete(socket);
      }
    }
  }
  async function publicTick(id: string, cancel = false) {
    // Persist the exact signed bytes before send. A restart resubmits those bytes only.
    let job = (
      await db.query(
        "SELECT * FROM il_engine_jobs WHERE app=$1 AND status='pending' ORDER BY nonce LIMIT 1",
        [app],
      )
    ).rows[0];
    if (!job) {
      const nonce = await client.node.getTransactionCount({
        address: signer.address,
      });
      const data = encodeFunctionData({
        abi: roomsAbi,
        functionName: cancel ? "cancelMatch" : "tick",
        args: [BigInt(id)],
      });
      const raw = await signer.signTransaction({
        chainId: 4242,
        type: "eip1559",
        nonce,
        to: app,
        data,
        value: 0n,
        gas: 15000000n,
        maxFeePerGas: 0n,
        maxPriorityFeePerGas: 0n,
      });
      job = { id: hex(), nonce, raw, hash: keccak256(raw) };
      await db.query(
        "INSERT INTO il_engine_jobs VALUES($1,$2,$3,$4,$5,'pending')",
        [app, job.id, nonce, raw, job.hash],
      );
    }
    let receipt = await client.node
      .getTransactionReceipt({ hash: job.hash })
      .catch(() => null);
    if (!receipt) {
      try {
        const r = await sendFast(client.node, manifest.node, job.raw);
        if (!r) throw new Error("Engine fast path unavailable");
        receipt = r as any;
      } catch (e) {
        receipt = await client.node
          .getTransactionReceipt({ hash: job.hash })
          .catch(() => null);
        if (!receipt) throw e;
      }
    }
    await db.query(
      "UPDATE il_engine_jobs SET status='observed' WHERE app=$1 AND id=$2",
      [app, job.id],
    );
  }
  async function restoreContestedMatch(id: string, snap: any) {
    const saved = (
      await db.query("SELECT * FROM il_offers WHERE app=$1 AND id=$2", [
        app,
        id,
      ])
    ).rows[0];
    if (!saved) return;
    await transact(async (s) => {
      const r = s.rooms[saved.room];
      if (!r) return;
      r.winner = undefined;
      if (snap[2] === 1n || snap[2] === 2n) {
        const players = [snap[3].toLowerCase(), snap[4].toLowerCase()];
        if (r.members.filter((m) => !players.includes(m.player)).length + 2 > 8)
          throw new Error(
            "Room recovery needs operator review before admission resumes.",
          );
        // The contract owns participation. Roll back derived room occupancy to it.
        for (const other of Object.values(s.rooms))
          if (other.id !== r.id) {
            other.members = other.members.filter(
              (m) => !players.includes(m.player),
            );
            if (
              other.offer &&
              players.some((p) => [other.offer!.a, other.offer!.b].includes(p))
            ) {
              other.offer.status = "cancelled";
              other.status = "waiting";
            }
            if (!other.members.some((m) => m.player === other.host))
              other.host =
                [...other.members].sort((a, b) => a.joined - b.joined)[0]
                  ?.player || "";
          }
        s.queue = s.queue.filter((q) => !players.includes(q.player));
        for (const p of players) {
          const member = r.members.find((m) => m.player === p);
          if (member) member.away = false;
          else
            r.members.push({
              player: p,
              joined: Date.now(),
              position: r.members.length,
              seen: 0,
              away: false,
            });
        }
        r.offer = {
          ...saved.offer,
          status: snap[2] === 2n ? "active" : "submitted",
        };
        r.status = snap[2] === 2n ? "playing" : "offer";
      } else if (r.offer?.id === id) {
        r.offer.status = "cancelled";
        r.status = "waiting";
      }
      r.activity = Date.now();
    });
  }
  async function maintenance() {
    if (cycle) return;
    cycle = true;
    try {
      const status = await client.status();
      if (status.app.toLowerCase() !== app || status.chainId !== 4242) {
        online = false;
        throw new Error("Engine deployment mismatch.");
      }
      lastEngineSeen = Date.now();
      const delegation = await base.readContract({
        address: manifest.hub,
        abi: interludeHubReadAbi,
        functionName: "sessionOf",
        args: [app, zeroHash],
      });
      if (
        status.app.toLowerCase() !== app ||
        status.chainId !== 4242 ||
        delegation.status !== 1 ||
        delegation.expiresAt <= BigInt(Math.floor(Date.now() / 1000) + 40) ||
        BigInt(status.epoch) !== delegation.epoch
      ) {
        online = false;
        ratings.clear();
        await db.query(
          "UPDATE il_results SET verified=false,published=false WHERE app=$1",
          [app],
        );
        throw new Error("The game service is unavailable. Please wait.");
      }
      if (lastEpoch !== -1 && lastEpoch !== status.epoch) ratings.clear();
      lastEpoch = status.epoch;
      online = true;
      admissionHealthy = true;
      lastCheck = Date.now();
      lastError = "";
      const pendingJob = (
        await db.query(
          "SELECT id FROM il_engine_jobs WHERE app=$1 AND status='pending' LIMIT 1",
          [app],
        )
      ).rows[0];
      if (pendingJob) await publicTick("0");
      const before = await current();
      const observed = new Map<string, any>();
      for (const r of Object.values(before.rooms)) {
        if (
          !r.offer ||
          r.offer.status === "complete" ||
          (r.offer.status === "cancelled" &&
            Number(r.offer.expires) * 1000 + 30000 < Date.now())
        )
          continue;
        const id = r.offer.id;
        let s = await client.read("getSnapshot", [BigInt(id)]);
        if (s[2] === 2n && s[8] - s[12].t > 500000n) {
          await publicTick(id);
          s = await client.read("getSnapshot", [BigInt(id)]);
        }
        if (s[2] === 1n && BigInt(Math.floor(Date.now() / 1000)) > s[11]) {
          await publicTick(id, true);
          s = await client.read("getSnapshot", [BigInt(id)]);
        }
        observed.set(id, s);
        if (s[2] >= 3n) {
          ratingAt = 0;
          const resultHash = await client.read("resultHashes", [BigInt(id)]);
          const publishedHash = await client.readSettled("resultHashes", [
            BigInt(id),
          ]);
          const ps = s[12];
          await db.query(
            `INSERT INTO il_results(app,id,room,a,b,winner,phase,ranked,score_a,score_b,hash,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(app,id) DO UPDATE SET winner=EXCLUDED.winner,phase=EXCLUDED.phase,score_a=EXCLUDED.score_a,score_b=EXCLUDED.score_b,hash=EXCLUDED.hash,published=EXCLUDED.published,verified=true`,
            [
              app,
              id,
              r.id,
              s[3].toLowerCase(),
              s[4].toLowerCase(),
              s[6].toLowerCase(),
              Number(s[2]),
              r.offer.ranked,
              ps.scoreA,
              ps.scoreB,
              resultHash,
              resultHash === publishedHash,
            ],
          );
        }
      }
      // Reconcile published copies, including results no longer shown by an active room.
      if (Date.now() - resultAuditAt > 15000) {
        let results = (
          await db.query(
            "SELECT id,hash FROM il_results WHERE app=$1 ORDER BY ended_at DESC LIMIT 2 OFFSET $2",
            [app, auditOffset],
          )
        ).rows;
        if (!results.length) {
          auditOffset = 0;
          results = (
            await db.query(
              "SELECT id,hash FROM il_results WHERE app=$1 ORDER BY ended_at DESC LIMIT 2",
              [app],
            )
          ).rows;
        }
        auditOffset += results.length;
        const ids = results.map((r) => BigInt(r.id));
        if (ids.length) {
          const [live, published] = await Promise.all([
            Promise.all(ids.map((id) => client.read("resultHashes", [id]))),
            Promise.all(
              ids.map((id) => client.readSettled("resultHashes", [id])),
            ),
          ]);
          for (let i = 0; i < results.length; i++) {
            const row = results[i];
            if (live[i] !== row.hash) {
              await restoreContestedMatch(
                row.id,
                await client.read("getSnapshot", [BigInt(row.id)]),
              );
              await db.query("DELETE FROM il_results WHERE app=$1 AND id=$2", [
                app,
                row.id,
              ]);
              ratings.clear();
              ratingAt = 0;
            } else
              await db.query(
                "UPDATE il_results SET published=$3,verified=true WHERE app=$1 AND id=$2",
                [app, row.id, published[i] === live[i]],
              );
          }
        }
        resultAuditAt = Date.now();
      }
      const rated = [
        ...new Set([
          ...before.queue.map((q) => q.player),
          ...Object.values(before.rooms).filter(r=>r.status!=="closed").flatMap((r) =>
            r.members.filter(m=>Date.now()-m.seen<30000).map((m) => m.player),
          ),
        ]),
      ];
      if (Date.now() - ratingAt > 15000) {
        for (let i = 0; i < rated.length; i += 2) {
          const ps = rated.slice(i, i + 2) as Address[];
          const [live, published] = await Promise.all([
            Promise.all(ps.map((p) => client.read("ratingOf", [p]))),
            Promise.all(ps.map((p) => client.readSettled("ratingOf", [p]))),
          ]);
          ps.forEach((p, j) =>
            ratings.set(p, { live: live[j], published: published[j] }),
          );
        }
        ratingAt = Date.now();
      }
      const nodeNow = await client.status();
      let reserved = nodeNow.pendingDiffs.length;
      // Existing unfinished offers reserve their worst-case creation and terminal writes.
      for (const r of Object.values(before.rooms))
        if (r.offer && !["complete", "cancelled"].includes(r.offer.status))
          reserved += observed.get(r.offer.id)?.[2] === 0n ? 24 : 8;
      await transact(async (s, c) => {
        const now = Date.now();
        s.queue = s.queue.filter((q) => now - q.seen < 30000);
        s.invites = s.invites.filter((i) => i.expires > now - 600000);
        for (const i of s.invites)
          if (i.expires <= now && i.status === "pending") i.status = "expired";
        for (const r of Object.values(s.rooms)) {
          if (r.offer) {
            const snap = observed.get(r.offer.id);
            if (snap?.[2] === 2n) {
              r.offer.status = "active";
              r.status = "playing";
            }
            if (
              snap &&
              snap[2] >= 3n &&
              !["complete", "cancelled"].includes(r.offer.status)
            ) {
              if (snap[2] === 4n && Number(r.offer.expires) * 1000 < now)
                for (const m of r.members)
                  if (
                    [r.offer.a, r.offer.b].includes(m.player) &&
                    !r.offer.accepted.includes(m.player)
                  )
                    m.away = true;
              r.offer.status = snap[2] === 3n ? "complete" : "cancelled";
              r.status = "waiting";
              r.activity = now;
              if (snap[2] === 3n) {
                r.winner = snap[6].toLowerCase();
                r.members = rotateMembers(
                  r.members,
                  r.offer.a,
                  r.offer.b,
                  r.winner!,
                );
              } else r.winner = undefined;
            }
            if (
              r.offer.status === "offered" &&
              Number(r.offer.expires) * 1000 + 3000 < now &&
              (!snap || snap[2] === 0n)
            ) {
              for (const m of r.members)
                if (
                  [r.offer.a, r.offer.b].includes(m.player) &&
                  !r.offer.accepted.includes(m.player)
                )
                  m.away = true;
              r.offer.status = "cancelled";
              r.status = "waiting";
            }
          }
          if (
            (!r.members.length && now - r.activity > 1800000) ||
            (r.offer?.status !== "active" && now - r.activity > 86400000)
          ) {
            r.status = "closed";
            r.members = [];
          }
          if (r.status === "closed" && now - r.activity > 86400000)
            delete s.rooms[r.id];
        }
        // Oldest player first, gradually widening the rating band. Blocks apply both ways.
        for (const first of [...s.queue].sort((a, b) => a.at - b.at)) {
          if (!s.queue.includes(first)) continue;
          const width = Math.min(
            600,
            100 + 50 * Math.floor((now - first.at) / 15000),
          );
          let second;
          for (const other of s.queue)
            if (
              other !== first &&
              Math.abs(
                (ratings.get(first.player)?.live.elo || 1000) -
                  (ratings.get(other.player)?.live.elo || 1000),
              ) <= width &&
              !(await blocked(c, first.player, other.player))
            ) {
              second = other;
              break;
            }
          if (!second) continue;
          s.queue = s.queue.filter((q) => q !== first && q !== second);
          const r = makeRoom(s, first.player, "ranked");
          r.members.push({
            player: second.player,
            joined: now,
            position: 1,
            away: false,
            seen: second.seen,
          });
        }
        let active = Object.values(s.rooms).filter(
          (r) => r.offer && !["complete", "cancelled"].includes(r.offer.status),
        ).length;
        for (const r of Object.values(s.rooms).sort(
          (a, b) => a.created - b.created,
        )) {
          if (
            r.status === "closed" ||
            (r.offer && !["complete", "cancelled"].includes(r.offer.status))
          )
            continue;
          if (r.offer?.status === "complete" && now - r.activity < 5000)
            continue;
          // A signed ticket remains usable until expiry even after a local Back.
          // Keep watching it and never issue a replacement while it can be submitted.
          if (
            r.offer?.status === "cancelled" &&
            Number(r.offer.expires) * 1000 + 3000 > now
          )
            continue;
          const pair = nextPair(r.members, r.winner, now);
          if (pair.length < 2) continue;
          if (
            !online ||
            !admissionHealthy ||
            process.env.ROOMS_ADMISSION_ENABLED !== "true" ||
            active >= 2 ||
            reserved + 24 > nodeNow.maxDiffsPerCommit
          ) {
            r.status = "capacity";
            continue;
          }
          const ticket = {
            id: BigInt(hex()),
            room: r.id as Hex,
            a: pair[0].player as Address,
            b: pair[1].player as Address,
            ranked: r.kind === "ranked",
            expires: BigInt(Math.floor(now / 1000) + 20),
            rules: 3n,
            entropy: hex(),
          };
          const signature = await signer.signTypedData({
            domain: {
              name: "PONGIT Rooms",
              version: "1",
              chainId: 10143,
              verifyingContract: app,
            },
            types: offerTypes,
            primaryType: "MatchOffer",
            message: ticket,
          });
          r.offer = {
            ...JSON.parse(json(ticket)),
            signature,
            accepted: [],
            status: "offered",
          };
          r.status = "offer";
          r.activity = now;
          active++;
          reserved += 24;
        }
        return {};
      });
      await notify();
    } catch (e) {
      admissionHealthy = false;
      if (Date.now() - lastEngineSeen > 10000) online = false;
      lastError = (e as Error).message
        .split("\n")[0]
        .replace(/https?:\/\/\S+/g, "[engine]")
        .slice(0, 180);
    } finally {
      cycle = false;
    }
  }
  const timer = setInterval(() => void maintenance(), 2000);
  timer.unref();
  void maintenance();
  async function route(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
  ) {
    if (!path.startsWith("/interlude")) return false;
    try {
      if (req.method !== "GET" && req.headers.origin !== o.origin)
        throw new Error("Origin denied");
      const url = new URL(req.url!, o.origin);
      if (path === "/interlude/config" && req.method === "GET") {
        o.send(res, {
          ...manifest,
          online,
          admission:
            online &&
            admissionHealthy &&
            process.env.ROOMS_ADMISSION_ENABLED === "true",
          checkedAt: lastCheck,
          error: lastError,
        });
        return true;
      }
      if (
        /^\/interlude\/rooms\/0x[0-9a-f]{64}$/.test(path) &&
        req.method === "GET"
      ) {
        const room = (await current()).rooms[path.split("/")[3]];
        if (!room || room.status === "closed") throw new Error("Room expired.");
        o.send(res, {
          id: room.id,
          kind: room.kind,
          host: room.host,
          count: room.members.length,
          profiles: await profileNames([room.host]),
        });
        return true;
      }
      if (path === "/interlude/auth/challenge" && req.method === "POST") {
        const p = address.parse((await o.body(req)).player),
          nonce = hex(),
          expires = Math.floor(Date.now() / 1000) + 300;
        await db.query("DELETE FROM il_nonces WHERE expires<$1", [
          Math.floor(Date.now() / 1000),
        ]);
        if (
          Number(
            (
              await db.query("SELECT count(*) FROM il_nonces WHERE player=$1", [
                p,
              ])
            ).rows[0].count,
          ) >= 8
        )
          throw new Error("Please wait before reconnecting.");
        await db.query("INSERT INTO il_nonces VALUES($1,$2,$3,$4)", [
          nonce,
          p,
          expires,
          app,
        ]);
        o.send(res, {
          nonce,
          expires,
          message: roomAuthMessage(p, nonce, expires, app),
        });
        return true;
      }
      if (path === "/interlude/auth/session" && req.method === "POST") {
        const r = z
          .object({
            player: address,
            nonce: idSchema,
            signature: signatureSchema,
            grantSignature: signatureSchema,
            grant: z.object({
              granter: address,
              sessionKey: address,
              expiry: z.coerce.bigint(),
              epoch: z.coerce.bigint(),
              anyFunction: z.literal(false),
              selectors: z
                .array(z.string().regex(/^0x[0-9a-fA-F]{8}$/))
                .min(1)
                .max(12),
            }),
          })
          .parse(await o.body(req));
        const n = (
          await db.query(
            "SELECT * FROM il_nonces WHERE nonce=$1 AND app=$2 AND player=$3 AND expires>$4",
            [r.nonce, app, r.player, Math.floor(Date.now() / 1000)],
          )
        ).rows[0];
        if (!n) throw new Error("Authentication challenge expired.");
        const grant = r.grant as SessionGrant;
        if (
          grant.granter !== r.player ||
          grant.expiry <= BigInt(Math.floor(Date.now() / 1000)) ||
          grant.expiry > BigInt(Math.floor(Date.now() / 1000) + 7200) ||
          !grant.selectors.includes(
            toFunctionSelector("input(uint256,int8,uint256,uint256)"),
          )
        )
          throw new Error("Invalid arcade grant.");
        const allowed = new Set(
          roomsAbi
            .filter(
              (x) =>
                x.type === "function" &&
                [
                  "acceptMatch",
                  "input",
                  "tick",
                  "cancelMatch",
                  "concede",
                ].includes(x.name),
            )
            .map((x) => toFunctionSelector(x as any)),
        );
        if (grant.selectors.some((selector) => !allowed.has(selector)))
          throw new Error("Arcade grant contains an unsupported permission.");
        const owner = await recoverTypedDataAddress({
          ...sessionGrantTypedData(grant, { app, baseChainId: 10143 }),
          signature: r.grantSignature as Hex,
        });
        const sessionKey = await recoverMessageAddress({
          message: roomAuthMessage(r.player, r.nonce, Number(n.expires), app),
          signature: r.signature as Hex,
        });
        if (
          owner.toLowerCase() !== r.player ||
          sessionKey.toLowerCase() !== grant.sessionKey ||
          (await client.epochOf(grant.granter)) !== grant.epoch
        )
          throw new Error("Arcade grant could not be verified.");
        if (
          !(
            await db.query(
              "DELETE FROM il_nonces WHERE nonce=$1 RETURNING nonce",
              [r.nonce],
            )
          ).rowCount
        )
          throw new Error("Authentication already used.");
        const token = randomBytes(32).toString("hex");
        await db.query("INSERT INTO il_sessions VALUES($1,$2,$3,$4,$5,$6)", [
          hash(token),
          r.player,
          grant.sessionKey,
          Number(grant.expiry),
          grant.epoch.toString(),
          app,
        ]);
        res.setHeader(
          "Set-Cookie",
          cookie(token, Number(grant.expiry) - Math.floor(Date.now() / 1000)),
        );
        o.send(res, { player: r.player });
        return true;
      }
      if (path === "/interlude/ladder" && req.method === "GET") {
        if (!publicLadder || Date.now() - publicLadderAt > 10000) {
          publicLadderAt = Date.now();
          publicLadder = (async () => {
        const players = (
          await db.query(
            "SELECT a AS player FROM il_results WHERE app=$1 AND verified AND ranked UNION SELECT b FROM il_results WHERE app=$1 AND verified AND ranked",
            [app],
          )
        ).rows.map((x) => x.player);
        const items = [];
        for (const player of players) {
          const live = await client.read("ratingOf", [player]),
            published = await client.readSettled("ratingOf", [player]);
          items.push({ player, live, published });
        }
        const profiles = await profileNames(players);
        return {
          items: items
            .sort((a, b) => b.live.elo - a.live.elo)
            .map((x) => ({
              ...x,
              ...profiles.find((y) => y.player === x.player),
            })),
        };
          })().catch(error => { publicLadder = undefined; throw error; });
        }
        o.send(res, await publicLadder);
        return true;
      }
      const p = await authenticate(req);
      if (path === "/interlude/auth/session" && req.method === "DELETE") {
        const token = /(?:^|;\s*)pongit_rooms=([a-f0-9]{64})/.exec(
          req.headers.cookie || "",
        )?.[1];
        if (token)
          await db.query("DELETE FROM il_sessions WHERE token=$1", [
            hash(token),
          ]);
        res.setHeader("Set-Cookie", cookie("", 0));
        o.send(res, {});
        return true;
      }
      if (path === "/interlude/state" && req.method === "GET") {
        await transact(async (s) => {
          const room = occupant(s, p);
          if (room) {
            const m = room.members.find((m) => m.player === p)!;
            m.seen = Date.now();
          }
          const q = s.queue.find((q) => q.player === p);
          if (q) q.seen = Date.now();
          return {};
        });
        o.send(res, await view(p));
        return true;
      }
      if (path === "/interlude/contacts" && req.method === "GET") {
        const contacts = (
          await db.query(
            "SELECT c.contact AS player,p.handle,p.avatar FROM il_contacts c LEFT JOIN profiles p ON p.player=c.contact WHERE c.player=$1 ORDER BY p.handle NULLS LAST,c.contact",
            [p],
          )
        ).rows;
        let historyAvailable = true;
        if (Date.now() - legacyAt > 60000) {
          try {
            legacyResults =
              (
                await o.graphql(
                  "query($since:String!){Match(where:{played:{_eq:true},status:{_eq:3},endedAt:{_gte:$since}}){id playerA playerB endedAt}}",
                  { since: String(Math.floor(Date.now() / 1000) - 2592000) },
                )
              ).Match || [];
            legacyAt = Date.now();
          } catch {
            historyAvailable = false;
          }
        }
        const recent = (
          await db.query(
            "SELECT id,a,b,extract(epoch from ended_at)::bigint AS ended FROM il_results WHERE app=$1 AND verified AND phase=3 AND ended_at>now()-interval '30 days' AND (a=$2 OR b=$2)",
            [app, p],
          )
        ).rows;
        const counts = new Map<
          string,
          { player: string; count: number; last: number }
        >();
        for (const m of [
          ...legacyResults.map((x) => ({
            a: x.playerA,
            b: x.playerB,
            ended: Number(x.endedAt),
          })),
          ...recent,
        ]) {
          if (m.a !== p && m.b !== p) continue;
          const rival = m.a === p ? m.b : m.a;
          if (rival === p) continue;
          const old = counts.get(rival) || { player: rival, count: 0, last: 0 };
          old.count++;
          old.last = Math.max(old.last, Number(m.ended));
          counts.set(rival, old);
        }
        const frequent = [...counts.values()]
          .sort((a, b) => b.count - a.count || b.last - a.last)
          .slice(0, 8);
        const profiles = await profileNames(frequent.map((x) => x.player));
        o.send(res, {
          contacts,
          historyAvailable,
          frequent: frequent.map((x) => ({
            ...x,
            ...profiles.find((y) => y.player === x.player),
          })),
        });
        return true;
      }
      if (path.startsWith("/interlude/rooms/") && req.method === "GET") {
        const room = (await current()).rooms[
          idSchema.parse(path.split("/")[3])
        ];
        if (!room || room.status === "closed") throw new Error("Room expired.");
        o.send(res, {
          id: room.id,
          kind: room.kind,
          host: room.host,
          count: room.members.length,
          profiles: await profileNames([room.host]),
          joined: room.members.some((m) => m.player === p),
        });
        return true;
      }
      if (req.method !== "POST") throw new Error("Not found");
      const body = await o.body(req);
      const operation = z.string().uuid().parse(body.operation);
      const data = await transact(
        async (s, c) => {
          if (path === "/interlude/profile") {
            const profile = z
              .object({
                handle: z
                  .string()
                  .toLowerCase()
                  .regex(/^[a-z][a-z0-9_]{2,19}$/),
                avatar: z.number().int().min(0).max(11),
              })
              .parse(body);
            try {
              await c.query(
                "INSERT INTO profiles(player,handle,avatar) VALUES($1,$2,$3) ON CONFLICT(player) DO UPDATE SET handle=$2,avatar=$3,updated_at=now()",
                [p, profile.handle, profile.avatar],
              );
            } catch (e) {
              if ((e as any).code === "23505")
                throw new Error("This username is already taken.");
              throw e;
            }
            return { player: p, ...profile };
          }
          if (
            path === "/interlude/contacts/add" ||
            path === "/interlude/contacts/remove"
          ) {
            const contact = address.parse(body.player);
            if (contact === p) throw new Error("Choose another player.");
            if (path.endsWith("add"))
              await c.query(
                "INSERT INTO il_contacts VALUES($1,$2) ON CONFLICT DO NOTHING",
                [p, contact],
              );
            else
              await c.query(
                "DELETE FROM il_contacts WHERE player=$1 AND contact=$2",
                [p, contact],
              );
            return {};
          }
          if (path === "/interlude/queue") {
            if (s.queue.some((q) => q.player === p)) return {};
            available(s, p);
            if (
              !online ||
              !admissionHealthy ||
              process.env.ROOMS_ADMISSION_ENABLED !== "true"
            )
              throw new Error("Matchmaking is not open yet.");
            s.queue.push({
              player: p,
              elo: ratings.get(p)?.live.elo || 1000,
              at: Date.now(),
              seen: Date.now(),
            });
            return {};
          }
          if (path === "/interlude/queue/cancel") {
            if (occupant(s, p))
              throw new Error(
                "An opponent has already been found. Use Back on the duel.",
              );
            s.queue = s.queue.filter((q) => q.player !== p);
            return {};
          }
          if (
            path === "/interlude/rooms" ||
            path === "/interlude/invitations"
          ) {
            if (path === "/interlude/invitations") {
              const target = address.parse(body.player);
              const existing = s.invites.find(
                (i) =>
                  i.creator === target &&
                  i.recipient === p &&
                  i.status === "pending" &&
                  i.expires > Date.now() &&
                  s.rooms[i.room]?.kind === "duel",
              );
              if (existing) {
                available(s, p);
                if (await blocked(c, p, target))
                  throw new Error("This invitation is unavailable.");
                const r = s.rooms[existing.room];
                r.members.push({
                  player: p,
                  joined: Date.now(),
                  position: 1,
                  away: false,
                  seen: Date.now(),
                });
                existing.status = "accepted";
                r.activity = Date.now();
                return { room: r.id };
              }
            }
            available(s, p);
            if (
              !online ||
              !admissionHealthy ||
              process.env.ROOMS_ADMISSION_ENABLED !== "true"
            )
              throw new Error("Rooms are not open yet.");
            const r = makeRoom(
              s,
              p,
              path.endsWith("invitations") ? "duel" : "group",
            );
            const recipients = z
              .array(address)
              .max(7)
              .parse(
                path.endsWith("invitations")
                  ? [body.player]
                  : body.players || [],
              );
            for (const target of new Set(recipients))
              await invite(s, c, r, p, target);
            return { room: r.id };
          }
          if (path === "/interlude/invitations/decline") {
            const i = s.invites.find(
              (i) =>
                i.id === idSchema.parse(body.id) &&
                i.recipient === p &&
                i.status === "pending",
            );
            if (!i) throw new Error("Invitation expired.");
            i.status = "declined";
            return {};
          }
          if (path === "/interlude/rooms/join") {
            const r = s.rooms[idSchema.parse(body.room)];
            if (!r || r.status === "closed") throw new Error("Room expired.");
            if (r.members.some((m) => m.player === p)) return { room: r.id };
            available(s, p);
            if (
              r.kind !== "group" &&
              !s.invites.some(
                (i) =>
                  i.room === r.id &&
                  i.recipient === p &&
                  i.status === "pending" &&
                  i.expires > Date.now(),
              )
            )
              throw new Error(
                "This invitation is reserved for another player.",
              );
            if (r.members.length >= (r.kind === "group" ? 8 : 2))
              throw new Error("Room full.");
            for (const m of r.members)
              if (await blocked(c, p, m.player))
                throw new Error("This room is unavailable.");
            r.members.push({
              player: p,
              joined: Date.now(),
              position: Math.max(-1, ...r.members.map((m) => m.position)) + 1,
              away: false,
              seen: Date.now(),
            });
            if (!r.host) r.host = p;
            r.activity = Date.now();
            for (const i of s.invites)
              if (
                i.room === r.id &&
                i.recipient === p &&
                i.status === "pending"
              )
                i.status = "accepted";
            return {
              room: r.id,
              acceptFirstDuel:
                r.members.length === 2 &&
                (!r.offer || r.offer.status === "offered"),
            };
          }
          const r = occupant(s, p);
          if (!r) throw new Error("Join a room first.");
          const me = r.members.find((m) => m.player === p)!;
          if (path === "/interlude/rooms/invite") {
            await invite(s, c, r, p, address.parse(body.player));
            return {};
          }
          if (path === "/interlude/rooms/rejoin") {
            me.away = false;
            me.seen = Date.now();
            me.position = Math.max(0, ...r.members.map((m) => m.position)) + 1;
            r.activity = Date.now();
            return {};
          }
          if (
            path === "/interlude/offers/accept" ||
            path === "/interlude/offers/back"
          ) {
            const offer = r.offer;
            if (
              !offer ||
              offer.id !== String(body.id) ||
              ![offer.a, offer.b].includes(p)
            )
              throw new Error("This duel is no longer available.");
            const snap = await client.read("getSnapshot", [BigInt(offer.id)]);
            if (snap[2] === 2n || offer.status === "active")
              throw new Error("The match has started. Resume or concede.");
            if (path.endsWith("back")) {
              if (snap[2] === 1n)
                throw new Error(
                  "Acceptance already submitted. Cancel it on the engine first.",
                );
              me.away = true;
              offer.status = "cancelled";
              r.status = "waiting";
              return {};
            }
            if (Number(offer.expires) * 1000 <= Date.now())
              throw new Error("Duel expired.");
            if (!offer.accepted.includes(p)) offer.accepted.push(p);
            return { offer };
          }
          if (path === "/interlude/rooms/leave") {
            if (r.offer && [r.offer.a, r.offer.b].includes(p)) {
              const snap = await client.read("getSnapshot", [
                BigInt(r.offer.id),
              ]);
              if (snap[2] === 2n)
                throw new Error("Concede your active match before leaving.");
              if (snap[2] === 1n)
                throw new Error(
                  "Cancel your submitted acceptance before leaving.",
                );
              if (r.offer.status === "offered") r.offer.status = "cancelled";
            }
            r.members = r.members.filter((m) => m.player !== p);
            r.activity = Date.now();
            if (r.host === p)
              r.host =
                [...r.members].sort((a, b) => a.joined - b.joined)[0]?.player ||
                "";
            return {};
          }
          throw new Error("Not found");
        },
        { player: p, id: operation, request: path + json(body) },
      );
      o.send(res, data);
      void notify();
      return true;
    } catch (e) {
      const message = (e as Error).message.split("\n")[0];
      o.send(
        res,
        { error: message },
        message.includes("Renew") || message.includes("revoked") ? 401 : 400,
      );
      return true;
    }
  }
  async function subscribe(
    socket: WebSocket,
    req: IncomingMessage,
    player: string,
  ) {
    const actual = await authenticate(req, address.parse(player));
    sockets.set(socket, { req, player: actual });
    socket.once("close", () => sockets.delete(socket));
    socket.send(json({ type: "rooms-changed" }));
  }
  return {
    route,
    subscribe,
    status: () => ({ online, lastError, lastCheck }),
    stop: () => clearInterval(timer),
  };
}
