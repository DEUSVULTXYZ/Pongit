import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool, PoolClient } from "pg";
import { WebSocket } from "ws";
import {
  createPublicClient,
  http,
  parseAbi,
  recoverMessageAddress,
  recoverTypedDataAddress,
  encodeFunctionData,
  decodeFunctionData,
  keccak256,
  toFunctionSelector,
  zeroHash,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {readContract} from 'viem/actions';
import {
  createInterludeClient,
  memoryStore,
  sessionGrantTypedData,
  sendFast,
  type SessionGrant,
} from "@interludelayer-sdk/sdk";
import { monadTestnet } from "viem/chains";
import { z } from "zod";
import { roomsAbi as classicRoomsAbi } from "../../shared/abi-rooms";
import { roomsChaosAbi } from "../../shared/abi-PongRoomsTestnet";
import { roomsRealtimeAbi } from "../../shared/abi-PongRoomsRealtime";
import { roomsCompactAbi } from "../../shared/abi-PongRoomsCompact";
import { roomsEventsAbi } from "../../shared/abi-PongChaosEvents";
import {ChaosBeaconPump,type BeaconRequestState} from '../../shared/chaos-beacon-pump';
import { chaosOfferTypes } from "../../shared/rooms-chaos";
import {createRoomsFinanceDirectory} from "./rooms-finance-directory";
import {loadRoomsFinance,financeAdapterAbi} from "./rooms-finance-config";
import {roomsLifecycle} from "./rooms-lifecycle";
import {reconcileEngineJobs, quarantineTerminalTicks, engineJobIdentity, engineReceiptOutcome, retireRefusedEngineJob, retireClosedEpochJobs, publicCommandResult, ENGINE_REFUSALS_SCHEMA} from "./rooms-engine-recovery";
import {publishedResultReader} from "./rooms-finalization";
import {EngineHaltMonitor,roomsWriteVerdict,type EngineHaltChange} from "./rooms-engine-halt";
import {ENGINE_HALTED_CODE,ENGINE_HALTED_MESSAGE,EngineHalted,readEngineHealth,refusalReason} from "../../shared/engine-halt";
import {roomsRankingCandidates} from "./rooms-ranking";
import {readEngineSnapshot, EngineSnapshotError} from "../../shared/engine-snapshot";
import {engineTransport} from "../../shared/engine-transport";
import {engineReadRetryMs} from "../../shared/engine-read";
import {confirmsRoomAcceptance, expireUnstartedRoomOffer, prepareRoomLaunch, assertRoomLaunchReady} from "../../shared/rooms-acceptance";
import {EngineStream,engineTuple,engineState} from "../../shared/engine-stream";
import {EngineFeed} from "../../shared/engine-feed";
import {engineCooldownMs} from "../../shared/engine-transport";
import {engineCommandTransaction} from "../../shared/engine-gas";
import {CHAOS_GUARD_INTERVAL_MS,CHAOS_GUARD_WRITABLE_MS,ChaosTickOutcomes,chaosGuardBackoffMs,chaosGuardDue,matchCommandInFlight,publicCommandKey} from "./chaos-tick-guard";
import {SessionUnavailable,SessionRejected,serviceError,publicationUnavailable,EnginePublicationUnavailable} from "../../shared/service-error";
import {assertRoomsEngineAvailable,RoomsEngineUnavailable} from "../../shared/rooms-availability";
import {overlayPresence} from "./rooms-presence";
import {recordRpc,measuredFetch} from "../../shared/rpc-metrics";
import {createRpcDiagnostics} from "./rpc-diagnostics";
import {createRoomsPublicationHealth} from './rooms-publication-health';
import {roomsEventsHistory} from './rooms-events-history';
import type {RelayRequest} from "../../shared/protocol";
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
  queue: { player: string; mode?: 0 | 1; elo: number; at: number; seen: number }[];
  invites: Invitation[];
};
type Options = {
  financeConfig?: Awaited<ReturnType<typeof loadRoomsFinance>>;
  enqueue?: (r:RelayRequest,internal?:boolean,value?:bigint)=>Promise<any>;
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
  const events = manifest.rulesVersion === 6;
  const realtime = manifest.rulesVersion === 5 || events;
  const previousRooms=[...new Set([manifest.previousRooms,...(manifest.previousRoomsHistory||[])].filter(Boolean).map((a:string)=>a.toLowerCase()))];
  const chaosEnabled = manifest.rulesVersion === 4 || realtime;
  const roomsAbi: Abi = events ? roomsEventsAbi : manifest.compactControls ? roomsCompactAbi : realtime ? roomsRealtimeAbi : chaosEnabled ? roomsChaosAbi : classicRoomsAbi;
  // Each newly admitted pair can bind two additional arcade keys in this batch.
  const creationBudget=events?38:manifest.compactControls?34:realtime?32:chaosEnabled?30:24,terminalBudget=events?18:realtime?14:chaosEnabled?12:8;
  const modeOf = (v: unknown): 0 | 1 => {
    const mode=z.union([z.literal(0),z.literal(1)]).parse(v ?? 0);
    if(mode === 1 && (!chaosEnabled || process.env.ROOMS_CHAOS_ENABLED !== "true"))
      throw new Error("Chaos is not open in this arena yet.");
    return mode;
  };
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
        fetchFn:measuredFetch("monad"),
      }),
    });
  const client = createInterludeClient({
    app,
    abi: roomsAbi,
    node: manifest.node,
    base,
    store: memoryStore(),
    transport: engineTransport(manifest.node),
  });
  const db = o.db;
  const streamEnabled=process.env.ROOMS_STATE_STREAM_ENABLED==="true";
  const feed=new EngineFeed(client,new EngineStream(manifest.node,app,url=>new WebSocket(url) as any,()=>engineCooldownMs(manifest.node)));
  const watched=new Map<string,()=>void>();
  const pendingPressure=new Map<string,Promise<void>>();
  const beaconPump=new ChaosBeaconPump();
  const beaconState=(s:any):BeaconRequestState=>({playing:s[2]===2n&&s[12].mode===1,request:s[13]?.request??0n,pending:s[13]?.pending??0n});
  const finance = chaosEnabled && o.financeConfig?.entries.some(x=>x.app.toLowerCase()===app) && o.enqueue
    ? await createRoomsFinanceDirectory({db,base,app,entries:o.financeConfig.entries,enqueue:o.enqueue}) : null;
  if(chaosEnabled && process.env.ROOMS_CHAOS_ENABLED === "true" && !finance)throw new Error("Chaos requires its funded financial bridge");
  await db.query(`
 CREATE TABLE IF NOT EXISTS il_lobby(app text PRIMARY KEY,document jsonb NOT NULL);
 CREATE TABLE IF NOT EXISTS il_result_pending(app text NOT NULL,id text NOT NULL,room text NOT NULL,ranked boolean NOT NULL,PRIMARY KEY(app,id));
 CREATE TABLE IF NOT EXISTS il_presence(app text NOT NULL,player text NOT NULL,seen bigint NOT NULL,PRIMARY KEY(app,player));
 CREATE TABLE IF NOT EXISTS il_occupancy(app text NOT NULL,player text NOT NULL,room text NOT NULL,PRIMARY KEY(app,player));
 CREATE TABLE IF NOT EXISTS il_contacts(player text NOT NULL,contact text NOT NULL,PRIMARY KEY(player,contact));
 CREATE TABLE IF NOT EXISTS il_nonces(nonce text PRIMARY KEY,player text NOT NULL,expires bigint NOT NULL,app text NOT NULL);
 CREATE TABLE IF NOT EXISTS il_sessions(token text PRIMARY KEY,player text NOT NULL,signer text NOT NULL,expires bigint NOT NULL,epoch text NOT NULL,app text NOT NULL);
 CREATE TABLE IF NOT EXISTS il_operations(app text NOT NULL,player text NOT NULL,id text NOT NULL,request_hash text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(app,player,id));
 CREATE TABLE IF NOT EXISTS il_results(app text NOT NULL,id text NOT NULL,room text NOT NULL,a text NOT NULL,b text NOT NULL,winner text NOT NULL,phase integer NOT NULL,ranked boolean NOT NULL,score_a integer NOT NULL,score_b integer NOT NULL,hash text NOT NULL,published boolean NOT NULL DEFAULT false,ended_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(app,id));
 CREATE TABLE IF NOT EXISTS il_engine_jobs(app text NOT NULL,id text NOT NULL,nonce bigint NOT NULL,raw text NOT NULL,hash text NOT NULL,status text NOT NULL,PRIMARY KEY(app,id),UNIQUE(app,nonce));
 ALTER TABLE il_engine_jobs ADD COLUMN IF NOT EXISTS epoch bigint NOT NULL DEFAULT 0;
 ALTER TABLE il_engine_jobs ADD COLUMN IF NOT EXISTS signer text;
 ALTER TABLE il_engine_jobs ADD COLUMN IF NOT EXISTS action text;
 ALTER TABLE il_engine_jobs ADD COLUMN IF NOT EXISTS match_id text;
 ALTER TABLE il_engine_jobs ADD COLUMN IF NOT EXISTS resolution jsonb;
 ALTER TABLE il_engine_jobs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
 ALTER TABLE il_engine_jobs DROP CONSTRAINT IF EXISTS il_engine_jobs_app_nonce_key;
 CREATE UNIQUE INDEX IF NOT EXISTS il_engine_jobs_epoch_nonce ON il_engine_jobs(app,epoch,nonce);
 ${ENGINE_REFUSALS_SCHEMA};
 CREATE TABLE IF NOT EXISTS il_offers(app text NOT NULL,id text NOT NULL,room text NOT NULL,offer jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(app,id));
 ALTER TABLE il_results ADD COLUMN IF NOT EXISTS mode integer NOT NULL DEFAULT 0;
 ALTER TABLE il_results ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT true;
 CREATE INDEX IF NOT EXISTS il_results_players ON il_results(a,b,ended_at);
 CREATE TABLE IF NOT EXISTS il_archive_records(app text NOT NULL,id text NOT NULL,hash text NOT NULL,PRIMARY KEY(app,id));
 `);
  await db.query("INSERT INTO il_lobby VALUES($1,$2) ON CONFLICT DO NOTHING", [
    app,
    { rooms: {}, queue: [], invites: [] },
  ]);
  const diagnostics=await createRpcDiagnostics(db,app);
  const replays=events?await roomsEventsHistory(db,app,o.graphql):null;
  const replayEpochs=new Map<string,bigint>(),replayReads=new Map<string,Promise<void>>(),replayLatest=new Map<string,ReturnType<typeof engineState>>();
  function recordReplay(s:ReturnType<typeof engineState>){
    if(!replays||s.phase<2)return;
    const key=`${lastEpoch}:${s.id}`,known=replayEpochs.get(key);
    if(known){replays.record(known,s);return;}
    replayLatest.set(key,s);if(replayReads.has(key))return;
    const read=(async()=>{
      // A result observed after renewal still belongs to its original epoch.
      const epoch=BigInt(await client.read('gameEpoch',[s.id]) as bigint);
      if(epoch<=0n)return;replayEpochs.set(key,epoch);const latest=replayLatest.get(key);if(latest)replays.record(epoch,latest);
      while(replayEpochs.size>128)replayEpochs.delete(replayEpochs.keys().next().value!);
    })().catch(()=>recordRpc({at:Date.now(),target:'pongit',method:'replay.epoch.retry',status:503,ms:0,source:'cache'})).finally(()=>{replayReads.delete(key);replayLatest.delete(key);});
    replayReads.set(key,read);
  }
  let archiveWork:Promise<void>|undefined;
  async function publishArchive(){
    if(!events||!o.enqueue||archiveWork)return;
    const financial=o.financeConfig?.entries.find(m=>m.app.toLowerCase()===app&&m.rulesVersion===6);if(!financial)return;
    archiveWork=(async()=>{
      const rows=(await db.query("SELECT r.id,r.hash FROM il_results r LEFT JOIN il_archive_records h ON h.app=r.app AND h.id=r.id WHERE r.app=$1 AND r.verified AND r.published AND (h.hash IS NULL OR h.hash<>r.hash) ORDER BY r.ended_at LIMIT 8",[app])).rows;
      for(const row of rows){
        const current=await base.readContract({address:financial.adapter,abi:financeAdapterAbi(financial),functionName:'recordedHash',args:[BigInt(row.id)]});
        if(current!==row.hash)await o.enqueue!({deployment:'rooms',roomApp:app,roomFinance:financial.financeId,roomAction:`history:${row.id}:${row.hash}`,contract:'game',functionName:'recordMatch',args:[row.id]},true);
        else await db.query('INSERT INTO il_archive_records VALUES($1,$2,$3) ON CONFLICT(app,id) DO UPDATE SET hash=$3',[app,row.id,row.hash]);
      }
    })().catch(()=>recordRpc({at:Date.now(),target:'pongit',method:'history.publication.retry',status:503,ms:0,source:'cache'})).finally(()=>archiveWork=undefined);
  }
  const publicationHealth=await createRoomsPublicationHealth(db,app);
  let lastPublishedBatch=0,publicationLog='';
  let lifecycle: Awaited<ReturnType<typeof roomsLifecycle>> = null;
  let publicLadder: Promise<any> | undefined, publicLadderAt = 0, publicLadderMode = -1;
  const sockets = new Map<
    WebSocket,
    { req: IncomingMessage; player: string; revision?:string; unavailable?:boolean }
  >();
  let online = false,
    admissionHealthy = false,
    lastEngineSeen = 0,
    lastCheck = 0,
    lastError = "Connecting to the game service",
    lastErrorCode = "ENGINE_CONNECTING",
    cycle = false,
    lastEpoch = -1,
    legacyAt = 0,
    resultAuditAt = 0,
    ratingAt = 0,
    auditOffset = 0;
  const epochs = new Map<string, { value: bigint; at: number }>();
  const epochChecks=new Map<string,Promise<bigint>>();
  const accountRates=new Map<string,{count:number;until:number}>();
  const ratings = new Map<string, { live: any; published: any }>();
  const ratingKey = (p:string,mode=0)=>p+":"+mode;
  const readRating = async(p:Address,mode=0,published=false):Promise<any> =>
    published ? client.readSettled("ratingOf",chaosEnabled?[p,mode]:[p]) : client.read("ratingOf",chaosEnabled?[p,mode]:[p]);
  let legacyResults: any[] = [];
  const current = async () => overlayPresence(db,app,(await db.query("SELECT document FROM il_lobby WHERE app=$1", [app])).rows[0].document as State);
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
    if (!token) throw new SessionRejected("Renew your arcade session to continue.");
    const r = (
      await db.query(
        "SELECT * FROM il_sessions WHERE token=$1 AND app=$2 AND expires>$3",
        [hash(token), app, Math.floor(Date.now() / 1000)],
      )
    ).rows[0];
    if (!r) throw new SessionRejected("Renew your arcade session to continue.");
    if (
      (expected || req.headers["x-pongit-player"])?.toString().toLowerCase() !==
      r.player
    )
      throw new SessionRejected(
        "Renew your arcade session: account changed in another tab.",
      );
    let epoch = epochs.get(r.player);
    if (!epoch || Date.now() - epoch.at > 5000) {
      try{
        let pending=epochChecks.get(r.player);
        if(!pending){pending=readContract(client.base,{address:manifest.hub as Address,abi:parseAbi(['function sessionEpochOf(address) view returns(uint256)']),functionName:'sessionEpochOf',args:[r.player as Address]}).finally(()=>epochChecks.delete(r.player));epochChecks.set(r.player,pending);}
        epoch={value:await pending,at:Date.now()};
      }catch{throw new SessionUnavailable();}
      epochs.set(r.player, epoch);
    }
    if (epoch.value !== BigInt(r.epoch))
      throw new SessionRejected("Arcade session revoked. Reconnect.");
    return r.player as string;
  }
  async function transact<T>(
    fn: (s: State, c: PoolClient) => Promise<T>,
    operation?: { player: string; id: string; request: string },
  ) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const lockAt=Date.now();
      await c.query("SELECT pg_advisory_xact_lock(701339)");
      recordRpc({at:lockAt,target:"pongit",method:"lobby.lock",status:200,ms:Date.now()-lockAt,source:"cache"});
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
      await overlayPresence(c,app,state);
      const previous=json(state);
      const result = await fn(state, c);
      if(json(state)!==previous){
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
      }
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
  function makeRoom(s: State, p: string, kind: RoomKind, mode:0|1=0) {
    const now = Date.now(),
      r: LobbyRoom = {
        id: hex(),
        host: p,
        kind,
        mode,
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
      serverNow: Date.now(),
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
      rating: ratings.get(ratingKey(p,room?.mode || s.queue.find(q=>q.player===p)?.mode || 0)),
      online,
      admission:
        online &&
        admissionHealthy &&
        process.env.ROOMS_ADMISSION_ENABLED === "true" && (lifecycle?.available() ?? true),
      maintenance:lifecycle?.status(),
      error: online ? "" : lastError,
      errorCode: online ? undefined : lastErrorCode,
    };
  }
  let notifying=false;
  async function notify() {
    if(notifying)return;notifying=true;
    try{for (const [socket, info] of sockets) {
      if (socket.readyState !== 1) {
        sockets.delete(socket);
        continue;
      }
      try {
        await authenticate(info.req, info.player);
        const state=await view(info.player);
        const revision=hash(JSON.stringify(state,(key,value)=>key==="seen"||key==="serverNow"?undefined:value));
        if(revision!==info.revision||info.unavailable){info.revision=revision;info.unavailable=false;socket.send(json({ type: "rooms-changed",revision }));}
      } catch(e) {
        if(e instanceof SessionRejected){
          socket.send(json({ type: "rooms-expired",code:e.code }));
          socket.close(1008);sockets.delete(socket);
        }else {info.unavailable=true;socket.send(json({type:"rooms-unavailable",code:"SESSION_UNAVAILABLE",retryAt:Date.now()+5000}));}
      }
    }}finally{notifying=false;}
  }
  let writer:Promise<unknown>=Promise.resolve();
  let closingEpoch: bigint | null = null;
  const writes=new Map<string,Promise<void>>();
  // A halted node keeps serving reads and interlude_session, which has no halt
  // field; only /health and a refused send reveal it (shared/engine-halt.ts).
  const halt=new EngineHaltMonitor();
  // Latest tick outcome per match from every relayer path, for the Chaos guard.
  const tickOutcomes=new ChaosTickOutcomes();
  let guardWritableAt = 0;
  function haltChanged(change:EngineHaltChange){
    if(change==='halted'){
      online=false;admissionHealthy=false;guardWritableAt=0;
      lastError=ENGINE_HALTED_MESSAGE;lastErrorCode=ENGINE_HALTED_CODE;
      console.warn(json({event:'rooms-engine-halted',app,epoch:lastEpoch,...halt.state,at:new Date().toISOString()}));
      void notify();
    }
    if(change==='recovered')console.info(json({event:'rooms-engine-halt-cleared',app,epoch:lastEpoch,at:new Date().toISOString()}));
  }
  async function recordPublicationFailure(e:unknown){
    if(!publicationUnavailable(e))return;
    online=false;admissionHealthy=false;
    lastError=new EnginePublicationUnavailable().message;lastErrorCode='ENGINE_PUBLICATION_UNAVAILABLE';
    // A halt is the more precise cause of the same refusal.
    if(halt.state){lastError=ENGINE_HALTED_MESSAGE;lastErrorCode=ENGINE_HALTED_CODE;}
    const incident=await publicationHealth.fail(e,lastEpoch,lastPublishedBatch);
    const key=json(incident);
    if(key!==publicationLog){publicationLog=key;console.warn(json({event:'rooms-publication-failed',app,...incident,at:new Date().toISOString()}));}
    void notify();
  }
  function publicTick(id:string,cancel=false,pressureData?:Hex){
    const key=publicCommandKey(id,cancel,pressureData?hash(pressureData):undefined),existing=writes.get(key);if(existing)return existing;
    const operation=writer.catch(()=>{}).then(()=>sendPublicTick(id,cancel,pressureData)).catch(async e=>{await recordPublicationFailure(e);throw e;}).finally(()=>writes.delete(key));
    writes.set(key,operation);writer=operation;return operation;
  }
  async function sendPublicTick(id: string, cancel = false, pressureData?:Hex) {
    if (closingEpoch !== null) throw new Error("This arena is closing; no further commands will be submitted");
    // Recovery may only resend the existing immutable pending transaction.
    // Nothing new is signed for a halted node: it would only be refused.
    if(halt.state&&id!=='0')throw new EngineHalted();
    if(publicationHealth.status()&&id!=='0')throw new EnginePublicationUnavailable();
    const requestedData=id==='0'?null:pressureData || encodeFunctionData({
      abi:roomsAbi,functionName:cancel?'cancelMatch':'tick',args:[BigInt(id)],
    });
    // Persist the exact signed bytes before send. A restart resubmits those bytes only.
    let job = (
      await db.query(
        "SELECT * FROM il_engine_jobs WHERE app=$1 AND status='pending' ORDER BY nonce LIMIT 1",
        [app],
      )
    ).rows[0];
    if(job && Number(job.epoch)!==lastEpoch)throw new Error("An engine transaction from another delegation needs recovery before sending");
    if(!job && id==='0')return; // A concurrent receipt observer may have resolved it.
    let fresh = false;
    if (!job) {
      fresh = true;
      const nonce = await client.node.getTransactionCount({
        address: signer.address,
      });
      const data = requestedData!;
      // tick, cancelMatch, submitPressure, submitLivePressure and submitRandomness
      // all sign ENGINE_COMMAND_GAS: 30,000,000, the hosted node's cap. tick,
      // submitLivePressure and submitRandomness advance the Chaos clock first, and a
      // grid state costs 2.5 to 3 M gas per 100 ms of gap (see shared/engine-gas.ts).
      // The others never simulate; gas is free and the limit is only a ceiling.
      const raw = await signer.signTransaction(engineCommandTransaction(app, nonce, data));
      job = { id: hex(), app, nonce, raw, hash: keccak256(raw), epoch:lastEpoch };
      await db.query(
        "INSERT INTO il_engine_jobs(app,id,nonce,raw,hash,status,epoch,signer,action,match_id) VALUES($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9)",
        [app, job.id, nonce, raw, job.hash,lastEpoch,signer.address.toLowerCase(),decodeFunctionData({abi:roomsAbi,data}).functionName,id],
      );
    }
    const identity=await engineJobIdentity(job,roomsAbi,signer.address);
    if(!['tick','cancelMatch','submitPressure','submitLivePressure',...(events?['submitRandomness']:[])].includes(identity.action))throw new Error('Unexpected public command in the engine journal; review required');
    // Bytes signed in this call have never been sent, so they cannot have a
    // receipt yet: skip that read. It saves one node round trip on every new
    // command, which the Chaos guard's timing budget counts. A pending entry
    // recovered from the journal is still checked before it is resent.
    let receipt = fresh ? null : await client.node
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
        if (!receipt) {
          // "this session is over and the node is no longer accepting
          // transactions": the node is halted, whatever interlude_session says.
          haltChanged(halt.refused(e,lastEpoch));
          // A refusal before execution never ran. Retire it only when the node
          // also confirms its nonce unused (rooms-engine-recovery.ts); otherwise
          // it stays pending and only these bytes are ever resent.
          if(await retireRefusedEngineJob({db,app,job,error:e,
            latestNonce:()=>client.node.getTransactionCount({address:signer.address,blockTag:'latest'})}))
            console.warn(json({event:'rooms-engine-command-refused',app,epoch:String(job.epoch),nonce:String(job.nonce),action:identity.action,matchId:identity.matchId,reason:refusalReason(e),at:new Date().toISOString()}));
          throw e;
        }
      }
    }
    const outcome=engineReceiptOutcome(receipt,job.hash);
    if(!outcome)throw new Error('Engine receipt has no execution outcome; the command remains uncertain');
    await db.query(
      "UPDATE il_engine_jobs SET status=$3,resolution=$4,updated_at=now() WHERE app=$1 AND id=$2",
      [app, job.id, outcome,{kind:'receipt',hash:job.hash,blockHash:receipt?.blockHash,status:String(receipt?.status),at:new Date().toISOString()}],
    );
    // Keyed by the match of the command that executed, which may be a recovered
    // entry of another match, never by the command that asked for the send.
    tickOutcomes.record(identity.matchId,identity.action,outcome,Date.now());
    // A recovered entry of another command, reverted or not, is not this
    // command's outcome: its caller re-observes. Only its own revert is reported
    // as one (the Chaos guard used to back off the wrong match here).
    const result=publicCommandResult(outcome,requestedData,identity.data);
    if(result==='reverted')throw new Error("Engine command reverted. The current game state will be checked before retrying.");
    if(outcome==='observed'&&streamEnabled)await feed.receipt(BigInt(identity.matchId),{receipt},identity.action,identity.args||[],signer.address);
    // A recovered tick for another match is not confirmation of this pressure
    // request. Re-observe before chaining a resume or signing a new intention.
    if(result==='reconciled')
      throw new Error('Previous engine command reconciled. The current action will be checked again.');
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
  let historyBusy=false;
  async function auditHistory(){
    if(historyBusy)return;historyBusy=true;
    try{const before=await current();
      for(const r of (await db.query("SELECT * FROM il_result_pending WHERE app=$1 LIMIT 2",[app])).rows){
        const id=r.id,s:any=await readEngineSnapshot(client,BigInt(id));
          if (s[2] >= 3n) {
          ratingAt = 0;
          const resultHash = await client.read("resultHashes", [BigInt(id)]);
          const publishedHash = await client.readSettled("resultHashes", [
            BigInt(id),
          ]);
          const ps = s[12];
          await db.query(
            `INSERT INTO il_results(app,id,room,a,b,winner,phase,ranked,score_a,score_b,hash,published,mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(app,id) DO UPDATE SET winner=EXCLUDED.winner,phase=EXCLUDED.phase,score_a=EXCLUDED.score_a,score_b=EXCLUDED.score_b,hash=EXCLUDED.hash,published=EXCLUDED.published,verified=true`,
            [
              app,
              id,
              r.room,
              s[3].toLowerCase(),
              s[4].toLowerCase(),
              s[6].toLowerCase(),
              Number(s[2]),
              r.ranked,
              ps.scoreA,
              ps.scoreB,
              resultHash,
              resultHash === publishedHash,
              ps.mode || 0,
            ],
          );
          await db.query("DELETE FROM il_result_pending WHERE app=$1 AND id=$2",[app,id]);
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
        // Unpublished rows first, every audit. Such a row records what the node
        // showed before Monad did, and it may never be published as recorded: a
        // halted epoch's last batch (the phase-4 cancel of 2026-09-18) is lost at
        // the forceClose, and the next epoch's node resumes that match from
        // Monad's published state. Its live hash then differs, so the match is
        // restored to its room and the stale row deleted within one audit, not
        // after the rotation has reached it among every older result. Normally the
        // set is empty or a few seconds old.
        const unpublished = (
          await db.query(
            "SELECT id,hash FROM il_results WHERE app=$1 AND NOT published ORDER BY ended_at LIMIT 4",
            [app],
          )
        ).rows;
        results = [...unpublished, ...results.filter((r) => !unpublished.some((u) => u.id === r.id))];
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
                await readEngineSnapshot(client, BigInt(row.id)),
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
        // Rankings are a cached display. A slow provider must not stall room
        // rotation, consent expiry or the next rally's pressure checkpoint.
        ratingAt = Date.now();
        for (let i = 0; i < rated.length; i += 2) {
          const ps = rated.slice(i, i + 2) as Address[];
          await Promise.all(ps.map(async p=>{
            const mode=occupant(before,p)?.mode || before.queue.find(q=>q.player===p)?.mode || 0;
            try {
              const [live,published]=await Promise.all([readRating(p,mode),readRating(p,mode,true)]);
              ratings.set(ratingKey(p,mode),{live,published});
            }catch{/* Keep the last display value; onchain ELO remains authoritative. */}
          }));
        }
      }
    }catch{recordRpc({at:Date.now(),target:"pongit",method:"history.retry",status:503,ms:0,source:"cache"});}
    finally{historyBusy=false;}
  }
  let maintenanceRetryAt = 0;
  // guardWritableAt (declared with the writer) is the time of the last
  // maintenance verdict that commands may be sent. The Chaos guard never decides
  // writability itself; it only follows this verdict.
  async function maintenance() {
    if (cycle || Date.now() < maintenanceRetryAt) return;
    cycle = true;
    lastCheck = Date.now();
    try {
      // /health beside the session read, with its own short timeout. A failed
      // health read is unknown: it neither halts nor clears (EngineHaltMonitor).
      // It is skipped while the node's Retry-After runs, like every other request.
      const [status, health] = await Promise.all([client.status(),
        engineCooldownMs(manifest.node) > 0 ? Promise.resolve(undefined) : readEngineHealth(manifest.node)]);
      lastEngineSeen = Date.now();
      haltChanged(halt.observe(health, status.epoch));
      const delegation = await base.readContract({
        address: manifest.hub,
        abi: interludeHubReadAbi,
        functionName: "sessionOf",
        args: [app, zeroHash],
      });
      // Expiry alone does not invalidate historical results. Their existing
      // audit still checks publication/contestation against Monad separately.
      // Admission restrictions never gate recovery reads or terminal observation.
      // A mismatched app cannot be used as a source of recovery evidence.
      if(status.app.toLowerCase()!==app || status.chainId!==4242)throw new RoomsEngineUnavailable('ENGINE_APP_MISMATCH','The game node serves a different application.');
      let unavailable:{code:string;message:string}|undefined;
      try { assertRoomsEngineAvailable(app,status,delegation,Math.floor(Date.now()/1000)); }
      catch(e) {
        if(!(e instanceof RoomsEngineUnavailable))throw e;
        unavailable={code:e.code,message:e.message};
      }
      // The node serves the hub's active, unexpired epoch.
      const hubVerified=!unavailable;
      lastPublishedBatch=status.committedBatches;
      if(hubVerified&&await publicationHealth.observe(status,delegation)){
        publicationLog='';console.info(json({event:'rooms-publication-recovered',app,epoch:status.epoch,batch:status.committedBatches,at:new Date().toISOString()}));
      }
      const recoveryWritable=hubVerified;
      // A halted node refuses every send, whatever its session reports. No new
      // match, tick, cancel, beacon or checkpoint is attempted; the players see
      // ENGINE_HALTED instead of a live arena whose moves are refused.
      const verdict=roomsWriteVerdict({unavailable,publicationBlocked:!!publicationHealth.status(),halted:!!halt.state,lifecycleStage:lifecycle?.status().stage});
      const writable=verdict.writable;
      if (lastEpoch !== -1 && lastEpoch !== status.epoch) ratings.clear();
      if(lastEpoch!==status.epoch){feed.invalidate();tickOutcomes.clear();}
      lastEpoch = status.epoch;
      online = writable;
      admissionHealthy = writable;
      guardWritableAt = writable ? Date.now() : 0;
      lastCheck = Date.now();
      lastError = verdict.message;lastErrorCode = verdict.code;
      let pendingJob = (
        await db.query(
          "SELECT id,epoch FROM il_engine_jobs WHERE app=$1 AND status='pending' ORDER BY epoch,nonce LIMIT 1",
          [app],
        )
      ).rows[0];
      if(pendingJob && hubVerified && BigInt(pendingJob.epoch) < BigInt(delegation.epoch)){
        // The hub and the node serve a later active epoch, so the earlier one was
        // closed and released: its commands can never be published, and one left
        // pending would stop every command of this epoch ("from another
        // delegation"). The lifecycle does the same at release; this also covers
        // a renewal made outside it.
        const retired=await retireClosedEpochJobs({db,app,closedThrough:BigInt(delegation.epoch)-1n,kind:'epoch-superseded'});
        console.warn(json({event:'rooms-engine-jobs-superseded',app,epoch:String(delegation.epoch),retired,at:new Date().toISOString()}));
        pendingJob=(await db.query("SELECT id,epoch FROM il_engine_jobs WHERE app=$1 AND status='pending' ORDER BY epoch,nonce LIMIT 1",[app])).rows[0];
      }
      if (pendingJob && (writable || recoveryWritable && publicationHealth.claimRetry())) void publicTick("0").catch(()=>{});
      const before = await current();
      if(streamEnabled){
        const ids=new Set(Object.values(before.rooms).filter(r=>r.offer&&!['complete','cancelled'].includes(r.offer.status)).map(r=>r.offer!.id));
        for(const [id,stop] of watched)if(!ids.has(id)){stop();watched.delete(id);}
        for(const id of ids)if(!watched.has(id))watched.set(id,feed.watch(BigInt(id),recordReplay));
      }
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
        let s: any = streamEnabled?engineTuple(await feed.read(BigInt(id))):await readEngineSnapshot(client, BigInt(id));
        if (writable && s[2] === 2n && !s[12].awaitingServe && (streamEnabled?feed.progressAge(BigInt(id))>1500:s[8] - s[12].t > 1500000n)) {
          void publicTick(id).catch(()=>{});
        }
        if (writable && s[2] === 1n && BigInt(Math.floor(Date.now() / 1000)) > s[11]) {
          void publicTick(id, true).catch(()=>{});
        }
        observed.set(id, s);
        recordReplay(engineState(s));
        if(events&&writable&&s[13]){
          // Beacon networking is independent from observation and betting.
          // Sending still uses the single persisted engine writer.
          void beaconPump.offer(`${app}:${lastEpoch}:${id}`,beaconState(s),async()=>
            beaconState(await readEngineSnapshot(client,BigInt(id))),async(request,proof)=>{
              if(!online||closingEpoch!==null)return;
              await publicTick(id,false,encodeFunctionData({abi:roomsEventsAbi,functionName:'submitRandomness',args:[BigInt(id),request,proof]}));
            }).catch(()=>recordRpc({at:Date.now(),target:'pongit',method:'chaos.beacon.retry',status:503,ms:0,source:'cache'}));
        }
        if(writable && finance && s[2]===2n && s[12].mode===1 && (realtime || s[12].awaitingServe)){
          if(!pendingPressure.has(id)){
            const work=finance.pressure(id,s,async data=>{
              await publicTick(id,false,data);
              // A paused rally does not need idle ticks. Resume only after its
              // checkpoint write is confirmed; an uncertain write stops here.
              if(!realtime)await publicTick(id);
            },realtime?()=>client.read('queuedPressure',[BigInt(id)]):undefined).catch(e=>{
              // A financial checkpoint is local to this rally. It must never
              // overwrite the game node's availability or expose raw calldata.
              recordRpc({at:Date.now(),target:"pongit",method:"chaos.checkpoint.retry",status:503,ms:0,source:"cache"});
              console.warn("Chaos checkpoint retry",json({at:new Date().toISOString(),app,matchId:id,rally:s[12].scoreA+s[12].scoreB,reason:String((e as Error).message).split('\n')[0].replace(/https?:\/\/\S+/g,'[rpc]').slice(0,160)}));
            }).finally(()=>pendingPressure.delete(id));
            pendingPressure.set(id,work);
          }
        }
        if(s[2]>=3n){
          ratingAt=0;
          await db.query("INSERT INTO il_result_pending(app,id,room,ranked) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[app,id,r.id,r.offer.ranked]);
        }
      }
      const nodeNow = status;
      let reserved = nodeNow.pendingDiffs.length;
      // Existing unfinished offers reserve their worst-case creation and terminal writes.
      for (const r of Object.values(before.rooms))
        if (r.offer && !["complete", "cancelled"].includes(r.offer.status))
          reserved += observed.get(r.offer.id)?.[2] === 0n ? creationBudget : terminalBudget;
      // Read only when a room is (within a minute) old enough to be deleted in this pass.
      const heldRooms = Object.values(before.rooms).some(r=>Date.now()-r.activity>86400000-60000)
        ? new Set<string>((await db.query("SELECT DISTINCT room FROM il_results WHERE app=$1 AND NOT published",[app])).rows.map(r=>String(r.room)))
        : new Set<string>();
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
              r.offer.accepted = [r.offer.a, r.offer.b];
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
            expireUnstartedRoomOffer(r, snap?.[2], now);
          }
          if (
            (!r.members.length && now - r.activity > 1800000) ||
            (r.offer?.status !== "active" && now - r.activity > 86400000)
          ) {
            r.status = "closed";
            r.members = [];
          }
          // A room whose recorded result is not published yet is never deleted: if
          // that result is lost with a halted epoch, the next epoch resumes the
          // match and the audit restores it into this room (restoreContestedMatch
          // needs the room). Without a room nothing would tick it, and the next
          // renewal would wait on its active match forever.
          if (r.status === "closed" && now - r.activity > 86400000 && !heldRooms.has(r.id))
            delete s.rooms[r.id];
        }
        // Oldest player first, gradually widening the rating band. Blocks apply both ways.
        for (const first of (writable ? [...s.queue].sort((a, b) => a.at - b.at) : [])) {
          if (!s.queue.includes(first)) continue;
          const width = Math.min(
            600,
            100 + 50 * Math.floor((now - first.at) / 15000),
          );
          let second;
          for (const other of s.queue)
            if (
              other !== first && (other.mode || 0) === (first.mode || 0) &&
              Math.abs(
                (ratings.get(ratingKey(first.player, first.mode || 0))?.live.elo || 1000) -
                  (ratings.get(ratingKey(other.player, other.mode || 0))?.live.elo || 1000),
              ) <= width &&
              !(await blocked(c, first.player, other.player))
            ) {
              second = other;
              break;
            }
          if (!second) continue;
          s.queue = s.queue.filter((q) => q !== first && q !== second);
          const r = makeRoom(s, first.player, "ranked", first.mode || 0);
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
            process.env.ROOMS_ADMISSION_ENABLED !== "true" || lifecycle && !lifecycle.available() ||
            active >= 2 ||
            reserved + creationBudget > nodeNow.maxDiffsPerCommit
            || publicationHealth.status()
          ) {
            r.status = "capacity";
            continue;
          }
          const ticket = {
            id: BigInt(hex()),
            room: r.id as Hex,
            a: pair[0].player as Address,
            b: pair[1].player as Address,
            ...(chaosEnabled ? {mode:r.mode || 0}:{}),
            ranked: r.kind === "ranked",
            expires: BigInt(Math.floor(now / 1000) + 20),
            rules: BigInt(manifest.rulesVersion),
            entropy: hex(),
          };
          const signature = await signer.signTypedData({
            domain: {
              name: "PONGIT Rooms",
              version: chaosEnabled ? "2" : "1",
              chainId: 10143,
              verifyingContract: app,
            },
            types: chaosEnabled ? chaosOfferTypes : offerTypes,
            primaryType: "MatchOffer",
            message: ticket as any,
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
          reserved += creationBudget;
        }
        return {};
      });
      await notify();
    } catch (e) {
      if(e instanceof RoomsEngineUnavailable){
        maintenanceRetryAt=Date.now()+e.retryMs;online=false;admissionHealthy=false;guardWritableAt=0;
        lastError=e.message;lastErrorCode=e.code;
        // Availability is not evidence that a previously observed result changed.
        void notify();return;
      }
      if(publicationUnavailable(e)){
        await recordPublicationFailure(e);
        maintenanceRetryAt=Date.now()+30000;online=false;admissionHealthy=false;guardWritableAt=0;
        lastError=new EnginePublicationUnavailable().message;
        lastErrorCode='ENGINE_PUBLICATION_UNAVAILABLE';
        recordRpc({at:Date.now(),target:"interlude",method:"publication.unavailable",status:503,ms:0,source:"cache"});
        void notify();return;
      }
      const retryMs = engineReadRetryMs(e);
      lastErrorCode=retryMs?'ENGINE_RATE_LIMIT':'ENGINE_CHECK_FAILED';
      if (retryMs) {
        maintenanceRetryAt = Date.now() + retryMs;
        console.warn("Rooms node rate limited", json({app, retryMs}));
      }
      if(e instanceof EngineSnapshotError) console.warn("Engine snapshot failed",json({app:e.app,matchId:e.matchId,returnData:e.returnData}));
      if(process.env.ROOMS_PRIVATE_FINANCE_TEST === "true") console.warn("Private coordinator check:",String((e as any).details || (e as any).cause?.details || (e as Error).message).split("\n")[0].slice(0,300));
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
  lifecycle=chaosEnabled&&finance&&o.financeConfig ? await roomsLifecycle({
    db,base,app,hub:manifest.hub,nodeUrl:manifest.node,adapter:finance.manifest.adapter,
    beforeRenew:finance.beforeRenew,engineStatus:()=>client.status(),
    engineActive:async()=>BigInt(await client.read("activeCount",[]) as bigint),
    beforeClose:async(epoch)=>{
      closingEpoch=epoch;
      await writer.catch(()=>{});
      await reconcileEngineJobs({db,app,receipt:hash=>client.node.getTransactionReceipt({hash})});
      await quarantineTerminalTicks({db,app,abi:roomsAbi,signer:signer.address,epoch,
        snapshot:(id,published)=>published?client.readSettled('getSnapshot',[id]):readEngineSnapshot(client,id),
        resultHash:(id,published)=>published?client.readSettled('resultHashes',[id]):client.read('resultHashes',[id])});
    },
    onReady:epoch=>{if(closingEpoch!==epoch)closingEpoch=null;},
    publishedResult:publishedResultReader(base,finance.manifest),
  }) : null;
  if(chaosEnabled && process.env.ROOMS_CHAOS_ENABLED==='true' && !lifecycle && process.env.ROOMS_PRIVATE_FINANCE_TEST!=='true')throw new Error('Chaos requires a configured delegation lifecycle before opening to players');
  let reconciling=false;
  const recoveryTimer=setInterval(()=>{
    if(reconciling)return;reconciling=true;
    void reconcileEngineJobs({db,app,receipt:hash=>client.node.getTransactionReceipt({hash})})
      .catch(()=>{}).finally(()=>{reconciling=false;});
  },5000);
  const historyTimer=setInterval(()=>{void auditHistory();void publishArchive();},5000);
  recoveryTimer.unref();historyTimer.unref();
  const timer = setInterval(() => void maintenance(), 2000);
  const financeTimer = finance ? setInterval(()=>void finance.audit(),5000) : undefined;
  timer.unref();
  // Interim Chaos guard (see chaos-tick-guard.ts). In memory only: it reads the
  // applied-event feed the maintenance loop already watches and sends nothing
  // unless a live rules-6 Chaos match has made no observed progress for
  // CHAOS_GUARD_STALE_MS. It shares publicTick with the maintenance loop, so the
  // same tick coalesces, and it never queues behind another command of the match.
  const guardBlocked = new Map<string, number>();
  function chaosGuard() {
    const now = Date.now();
    const engine = {
      now,
      enabled: events && streamEnabled,
      streamConnected: feed.connected,
      writable: guardWritableAt > 0 && now - guardWritableAt <= CHAOS_GUARD_WRITABLE_MS && now >= maintenanceRetryAt
        && closingEpoch === null && !publicationHealth.status() && !halt.state,
      cooldownMs: engineCooldownMs(manifest.node),
    };
    for (const [id, until] of guardBlocked) if (until <= now || !watched.has(id)) guardBlocked.delete(id);
    tickOutcomes.retain(id => watched.has(id));
    for (const id of watched.keys()) {
      const s = feed.peek(BigInt(id));
      if (!s) continue;
      const due = chaosGuardDue(engine, {
        phase: s.phase, mode: s.state.mode, awaitingServe: s.state.awaitingServe,
        progressAgeMs: feed.progressAge(BigInt(id)),
        inFlight: matchCommandInFlight(writes.keys(), id),
        blockedUntil: guardBlocked.get(id) ?? 0,
        // Any relayer tick of this match that reverted since its last progress:
        // the match is frozen and the guard stays silent until it moves again.
        lastRevertAt: tickOutcomes.lastRevertAt(id),
      });
      if (!due) continue;
      void publicTick(id).catch(e => {
        const backoff = chaosGuardBackoffMs(e);
        if (backoff > 0) guardBlocked.set(id, Date.now() + backoff);
      });
    }
  }
  const guardTimer = events && streamEnabled ? setInterval(chaosGuard, CHAOS_GUARD_INTERVAL_MS) : undefined;
  guardTimer?.unref();
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
            process.env.ROOMS_ADMISSION_ENABLED === "true" && (lifecycle?.available() ?? true),
          maintenance:lifecycle?.status(),
          publication:publicationHealth.status(),
          checkedAt: lastCheck,
          error: lastError,
          errorCode: lastErrorCode || undefined,
          retryAt: !online ? Math.max(maintenanceRetryAt,lastCheck+2000) : undefined,
          stateTransport:streamEnabled?"events":"polling",
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
          mode: room.mode || 0,
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
          (await readContract(client.base,{address:manifest.hub as Address,abi:parseAbi(['function sessionEpochOf(address) view returns(uint256)']),functionName:'sessionEpochOf',args:[grant.granter]})) !== grant.epoch
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
        const mode=Number(new URL(req.url || "/",o.origin).searchParams.get("mode") || 0);
        if(![0,1].includes(mode) || mode === 1 && !chaosEnabled)throw new Error("Ranking mode unavailable");
        if (!publicLadder || publicLadderMode !== mode || Date.now() - publicLadderAt > 10000) {
          publicLadderAt = Date.now(); publicLadderMode=mode;
          publicLadder = (async () => {
        const players = await roomsRankingCandidates(db,
          [app,...previousRooms,...(chaosEnabled && mode===0 && manifest.previousClassic ? [String(manifest.previousClassic).toLowerCase()] : [])],mode);
        const items = [];
        for (const player of players) {
          const [live,published] = await Promise.all([
            online ? readRating(player,mode).catch(()=>null) : Promise.resolve(null),
            readRating(player,mode,true)
          ]);
          if ((live || published).played > 0) items.push({ player, live, published });
        }
        const profiles = await profileNames(players);
        return {
          items: items
            .sort((a, b) => (b.live || b.published).elo - (a.live || a.published).elo)
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
      if(replays&&req.method==='GET'&&path==='/interlude/recent-matches'){
        o.send(res,await replays.recent(p));return true;
      }
      if(replays&&req.method==='GET'&&path==='/interlude/replay'){
        const q=new URL(req.url||'/',o.origin).searchParams,arena=address.parse(q.get('app')) as Address;
        const epoch=z.coerce.bigint().positive().parse(q.get('epoch')),id=z.coerce.bigint().positive().parse(q.get('id')),after=z.coerce.bigint().min(-1n).parse(q.get('after')??'-1');
        o.send(res,await replays.replay(arena,epoch,id,after));return true;
      }
      if(path==="/interlude/state"||path==="/interlude/presence"||path==="/interlude/diagnostics"){
        const now=Date.now();let budget=accountRates.get(p);
        if(!budget||budget.until<=now){budget={count:0,until:now+60000};accountRates.set(p,budget);}
        if(++budget.count>600){res.setHeader("Retry-After",String(Math.ceil((budget.until-now)/1000)));o.send(res,{error:"Please wait before refreshing.",code:"ACCOUNT_RATE_LIMIT",source:"pongit_api",retryAt:budget.until,requestId:randomBytes(8).toString("hex")},429);return true;}
        if(accountRates.size>10000)for(const [key,value]of accountRates)if(value.until<now)accountRates.delete(key);
      }
      if(path.startsWith("/interlude/finance") || path.startsWith("/interlude/markets/")){
        if(!finance)throw new Error("Rooms finance is not available in this deployment");
        const result=await finance.route(path,req.method || "GET",p,req.method==="POST"?await o.body(req):{},new URL(req.url || "/",o.origin).searchParams);
        if(result===undefined)throw new Error("Unknown finance action");
        o.send(res,result,req.method==="POST"?202:200);return true;
      }
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
        // Compatibility with tabs opened before the presence endpoint existed.
        await db.query("INSERT INTO il_presence VALUES($1,$2,$3) ON CONFLICT(app,player) DO UPDATE SET seen=EXCLUDED.seen WHERE il_presence.seen<$4",[app,p,Date.now(),Date.now()-10000]);
        o.send(res, await view(p));
        return true;
      }
      if(path==="/interlude/presence" && req.method==="POST"){
        await db.query("INSERT INTO il_presence VALUES($1,$2,$3) ON CONFLICT(app,player) DO UPDATE SET seen=EXCLUDED.seen WHERE il_presence.seen<$4",[app,p,Date.now(),Date.now()-5000]);
        o.send(res,{ok:true});return true;
      }
      if(path==="/interlude/diagnostics" && req.method==="POST"){
        const now=Date.now(),key="diagnostics:"+p;let budget=accountRates.get(key);
        if(!budget||budget.until<=now){budget={count:0,until:now+60000};accountRates.set(key,budget);}
        if(++budget.count>12){res.setHeader("Retry-After",String(Math.ceil((budget.until-now)/1000)));o.send(res,{error:"Diagnostics refresh limit reached.",code:"ACCOUNT_RATE_LIMIT",source:"pongit_api",retryAt:budget.until,requestId:randomBytes(8).toString("hex")},429);return true;}
        const body=await o.body(req);await diagnostics.accept(body.samples,body.instance);o.send(res,{ok:true});return true;
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
            "SELECT app || ':' || id AS id,a,b,extract(epoch from ended_at)::bigint AS ended FROM il_results WHERE app=ANY($1) AND verified AND phase=3 AND ended_at>now()-interval '30 days' AND (a=$2 OR b=$2)",
            [[app,...previousRooms], p],
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
          mode: room.mode || 0,
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
      const prior=(await db.query("SELECT request_hash,response FROM il_operations WHERE app=$1 AND player=$2 AND id=$3",[app,p,operation])).rows[0];
      if(prior){if(prior.request_hash!==hash(path+json(body)))throw new Error("Operation id already used for another action.");o.send(res,{...prior.response,serverNow:Date.now()});return true;}
      // External evidence is gathered before taking the lobby lock. Revalidate its
      // immutable offer binding and freshness inside the transaction below.
      let evidence:{room:string;id:string;signature:string;snapshot:any;receipt?:any;at:number}|undefined;
      if(["/interlude/offers/ready","/interlude/offers/accept","/interlude/offers/back","/interlude/rooms/leave"].includes(path)){
        const currentRoom=occupant(await current(),p),offer=currentRoom?.offer;
        if(offer && [offer.a,offer.b].includes(p)){
          const snapshot=await readEngineSnapshot(client,BigInt(offer.id)),observedAt=Date.now();
          let receipt;
          if(path.endsWith("accept") && body.receiptHash){const h=z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(body.receiptHash) as Hex;receipt=await client.node.getTransactionReceipt({hash:h});}
          evidence={room:currentRoom!.id,id:offer.id,signature:offer.signature,snapshot,receipt,at:observedAt};
        }
      }
      const verifiedEvidence=(room:LobbyRoom)=>{
        if(!evidence || evidence.room!==room.id || evidence.id!==room.offer?.id || evidence.signature!==room.offer.signature || Date.now()-evidence.at>2000)
          throw new Error("The room changed during synchronization. Refresh and retry.");
        return evidence;
      };
      const data = await transact(
        async (s, c) => {
          if(publicationHealth.status()&&['/interlude/queue','/interlude/rooms','/interlude/invitations','/interlude/offers/ready','/interlude/offers/accept'].includes(path))throw new EnginePublicationUnavailable();
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
            const mode=modeOf(body.mode);
            if (s.queue.some((q) => q.player === p)) return {};
            available(s, p);
            if (
              !online ||
              !admissionHealthy ||
              process.env.ROOMS_ADMISSION_ENABLED !== "true" || lifecycle && !lifecycle.available()
            )
              throw new Error("Matchmaking is not open yet.");
            s.queue.push({
              player: p,
              mode,
              elo: ratings.get(ratingKey(p,mode))?.live.elo || 1000,
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
            const mode=modeOf(body.mode);
            if (path === "/interlude/invitations") {
              const target = address.parse(body.player);
              const existing = s.invites.find(
                (i) =>
                  i.creator === target &&
                  i.recipient === p &&
                  i.status === "pending" &&
                  i.expires > Date.now() &&
                  s.rooms[i.room]?.kind === "duel" && (s.rooms[i.room]?.mode || 0) === mode,
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
              process.env.ROOMS_ADMISSION_ENABLED !== "true" || lifecycle && !lifecycle.available()
            )
              throw new Error("Rooms are not open yet.");
            const r = makeRoom(
              s,
              p,
              path.endsWith("invitations") ? "duel" : "group",
              mode,
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
            path === "/interlude/offers/ready" || path === "/interlude/offers/accept" ||
            path === "/interlude/offers/back"
          ) {
            const offer = r.offer;
            if (
              !offer ||
              offer.id !== String(body.id) ||
              ![offer.a, offer.b].includes(p)
            )
              throw new Error("This duel is no longer available.");
            const proof=verifiedEvidence(r),snap:any=proof.snapshot;
            if(path.endsWith("ready")){
              if(snap[2]>=2n)return {offer,alreadyAccepted:snap[2]===2n};
              prepareRoomLaunch(offer,p,Date.now());
              return {offer};
            }
            if (path.endsWith("accept")) {
              if (snap[2] === 2n) {
                offer.accepted = [offer.a, offer.b];
                return {offer, alreadyAccepted: true};
              }
              if (body.receiptHash) {
                const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(body.receiptHash) as Hex;
                const receipt = proof.receipt;
                if (!confirmsRoomAcceptance(receipt, roomsAbi, app, offer, p, hash))
                  throw new Error("This receipt does not confirm your acceptance of this duel.");
                if (snap[2] === 0n) throw new Error("Waiting for the accepted duel to become readable.");
                if (!offer.accepted.includes(p)) offer.accepted.push(p);
                return {offer, alreadyAccepted: true};
              }
              // Clear pre-update intents when the engine has no such match.
              if (snap[2] === 0n) offer.accepted = [];
              if (offer.status === "cancelled" || snap[2] >= 3n || Number(offer.expires) * 1000 <= Date.now())
                throw new Error("Duel expired. Rejoin the queue for another opponent.");
              // Old tabs bypassed readiness and started both engine agreements
              // immediately. They must load the intro before sending any consent.
              // Receipt reconciliation above remains compatible with an agreement
              // that was already sent; this guard never invents a failed transaction.
              if(body.countdown!==true)throw Error("Refresh PONGIT to load the match countdown, then accept the duel.");
              assertRoomLaunchReady(offer,Date.now());
              return {offer, alreadyAccepted: offer.accepted.includes(p)};
            }
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
          }
          if (path === "/interlude/rooms/leave") {
            if (r.offer && [r.offer.a, r.offer.b].includes(p)) {
              const snap:any=verifiedEvidence(r).snapshot;
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
      o.send(res, {...data,serverNow:Date.now()});
      void notify();
      return true;
    } catch (e) {
      const result=serviceError(e,randomBytes(8).toString("hex"));
      if(result.retryMs)res.setHeader("Retry-After",String(Math.ceil(result.retryMs/1000)));
      o.send(res,result.body,result.status);
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
    status: () => ({ online, admission:online&&admissionHealthy&&(lifecycle?.available()??true), lastError, lastErrorCode, lastCheck, app, epoch:lastEpoch, maintenance:lifecycle?.status(),publication:publicationHealth.status(),halt:halt.state }),
    stop: () => {clearInterval(timer);if(guardTimer)clearInterval(guardTimer);clearInterval(recoveryTimer);clearInterval(historyTimer);if(financeTimer)clearInterval(financeTimer);for(const stop of watched.values())stop();replays?.stop();diagnostics.stop();lifecycle?.stop();},
  };
}
