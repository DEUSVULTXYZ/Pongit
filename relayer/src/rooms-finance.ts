import { readFile } from "node:fs/promises";
import {
  encodeFunctionData,
  parseEther,
  verifyMessage,
  zeroHash,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Pool } from "pg";
import { z } from "zod";
import {createSettlementAudit} from "./rooms-settlement-audit";
import { roomsVaultAbi as vaultAbi } from "../../shared/abi-RoomsVault";
import { marketV4Abi as marketAbi } from "../../shared/abis-v4";
import { roomsChaosAbi } from "../../shared/abi-PongRoomsTestnet";
import { roomsRealtimeAbi } from "../../shared/abi-PongRoomsRealtime";
import { realtimeMarketAbi } from "../../shared/abi-RealtimeMarket";
import { livePressureDomain,livePressureTypes,livePressureCheckpoint,eventsPressureDomain,eventsPressureTypes } from "../../shared/rooms-live-pressure";
import { roomsEventsAbi } from "../../shared/abi-PongChaosEvents";
import { roomsLifecycleHubAbi } from "../../shared/abi-rooms-lifecycle";
import {roomsRoundStatus} from '../../shared/rooms-round-status';
import {sameChaosPause,chaosWindowMoved} from '../../shared/chaos-publication';
import {
  pressureTypes,
  pressureDomain,
  pressureCheckpoint,
  roomsCreditMessage,
} from "../../shared/rooms-pressure";
import type { RelayRequest } from "../../shared/protocol";
import {financeScope,financeAdapterAbi,type RoomsFinanceManifest} from "./rooms-finance-config";
import {deferredKey,FinalizationMemory,nextFinalization,publishedResultReader} from "./rooms-finalization";
import {livePressureEpochUsable} from "./rooms-command-epoch";
const idSchema = z
  .string()
  .regex(/^[0-9]+$/)
  .max(78);
const signature = z.string().regex(/^0x[0-9a-fA-F]{130}$/);
type Enqueue = (
  r: RelayRequest,
  internal?: boolean,
  value?: bigint,
) => Promise<any>;
export async function createRoomsFinance(o: {
  db: Pool;
  base: PublicClient;
  manifest: RoomsFinanceManifest;
  enqueue: Enqueue;
}) {
  const { db, base, manifest: m } = o;
  const realtime=m.betting==='realtime';
  const adapterAbi = financeAdapterAbi(m) as typeof import("../../shared/abi-RoomsMarketAdapter").roomsMarketAdapterAbi;
  if (!process.env.ROOMS_PRESSURE_KEY_FILE)
    throw new Error("Pressure signer file required");
  const key = JSON.parse(
    await readFile(process.env.ROOMS_PRESSURE_KEY_FILE, "utf8"),
  );
  const signer = privateKeyToAccount(key.privateKey);
  if (signer.address.toLowerCase() !== m.pressureSigner.toLowerCase())
    throw new Error("Pressure signer mismatch");
  if(m.rulesVersion===6&&await base.readContract({address:m.app,abi:roomsEventsAbi,functionName:'RULES_VERSION'})!==6n)
    throw new Error('Chaos events finance must bind rules 6');
  const [
    actualSigner,
    resultSource,
    vaultModule,
    vaultSealed,
    vaultCount,
    adapterGame,
    marketVault,
  ] = await Promise.all([
    base.readContract({
      address: m.app,
      abi: roomsChaosAbi,
      functionName: "pressureSigner",
    }),
    base.readContract({
      address: m.market,
      abi: marketAbi,
      functionName: "results",
    }),
    base.readContract({
      address: m.vault,
      abi: vaultAbi,
      functionName: "modules",
      args: [m.market],
    }),
    base.readContract({
      address: m.vault,
      abi: vaultAbi,
      functionName: "modulesSealed",
    }),
    base.readContract({
      address: m.vault,
      abi: vaultAbi,
      functionName: "moduleCount",
    }),
    base.readContract({
      address: m.adapter,
      abi: adapterAbi,
      functionName: "game",
    }),
    base.readContract({
      address: m.market,
      abi: marketAbi,
      functionName: "vault",
    }),
  ]);
  if (
    actualSigner.toLowerCase() !== m.pressureSigner.toLowerCase() ||
    resultSource.toLowerCase() !== m.adapter.toLowerCase() ||
    adapterGame.toLowerCase() !== m.app.toLowerCase() ||
    marketVault.toLowerCase() !== m.vault.toLowerCase() ||
    !vaultModule ||
    !vaultSealed ||
    vaultCount !== 1n
  )
    throw new Error("Rooms finance links are not sealed");
  await db.query(`
 CREATE TABLE IF NOT EXISTS il_pressure(app text NOT NULL,id text NOT NULL,rally integer NOT NULL,resume_at text NOT NULL,source_block text NOT NULL,source_hash text NOT NULL,paid_a text NOT NULL,paid_b text NOT NULL,checkpoint text NOT NULL,PRIMARY KEY(app,id,rally));
 CREATE TABLE IF NOT EXISTS il_bettors(app text NOT NULL,id text NOT NULL,player text NOT NULL,PRIMARY KEY(app,id,player));
 ALTER TABLE il_bettors ADD COLUMN IF NOT EXISTS settled boolean NOT NULL DEFAULT false;
 CREATE TABLE IF NOT EXISTS il_market_cursor(app text PRIMARY KEY,block text NOT NULL);
 CREATE TABLE IF NOT EXISTS il_credits(app text NOT NULL,player text NOT NULL,job_id text NOT NULL,PRIMARY KEY(app,player));
 CREATE TABLE IF NOT EXISTS il_payment_receipts(app text NOT NULL,payout_id text NOT NULL,status text NOT NULL,tx_hash text NOT NULL,PRIMARY KEY(app,payout_id));
 CREATE TABLE IF NOT EXISTS il_live_pressure(app text NOT NULL,id text NOT NULL,epoch text NOT NULL,source_block text NOT NULL,source_hash text NOT NULL,paid_a text NOT NULL,paid_b text NOT NULL,checkpoint text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(app,id,epoch,source_block));
 `);
  const app = financeScope(m);
  const hub = await base.readContract({
    address: m.adapter,
    abi: adapterAbi,
    functionName: "hub",
  });
  const settlementAudit=m.settlement ? await createSettlementAudit(db,base,m,hub) : null;
  const enqueue = (
    contract: RelayRequest["contract"],
    functionName: string,
    args: unknown[],
    value = 0n,
    roomAction?: string,
  ) =>
    o.enqueue(
      {
        deployment: "rooms",
        roomApp: m.app,
        ...(m.financeId ? {roomFinance:m.financeId} : {}),
        roomAction,
        contract,
        functionName,
        args,
      },
      true,
      value,
    );
  const readAdapter = (name: string, args: unknown[], blockNumber?: bigint): Promise<any> =>
    base.readContract({
      address: m.adapter,
      abi: adapterAbi,
      functionName: name,
      args,
      blockNumber,
    } as any);
  const readMarket = (
    name: string,
    args: unknown[],
    blockNumber?: bigint,
  ): Promise<any> =>
    base.readContract({
      address: m.market,
      abi: realtime ? realtimeMarketAbi : marketAbi,
      functionName: name,
      args,
      blockNumber,
    } as any);
  const displayReads = new Map<
    string,
    { until: number; value: Promise<any> }
  >();
  const display = (key: string, read: () => Promise<any>) => {
    const old = displayReads.get(key);
    if (old && old.until > Date.now()) return old.value;
    const value = read();
    const entry = { until: Infinity, value };
    displayReads.set(key, entry);
    value.then(
      () => {
        entry.until = Date.now() + 1500;
      },
      () => {
        if (displayReads.get(key) === entry) displayReads.delete(key);
      },
    );
    if (displayReads.size > 128)
      displayReads.delete(displayReads.keys().next().value!);
    return value;
  };
  let lastError = "",
    auditAt = 0,
    working = false;
  const livePressureAt=new Map<string,number>();
  const livePressureDelivered=new Map<string,{a:bigint;b:bigint;checkedAt:number}>();
  // Matches whose market round belongs to an earlier epoch, by the engine epoch
  // in which that was read. matchEpoch never changes once set.
  const livePressureStale=new Map<string,bigint>();
  async function continuousPressure(id:string,s:any,send:(data:Hex)=>Promise<void>,readQueued:()=>Promise<any>,engineEpoch?:bigint){
    const now=Date.now();if(now-(livePressureAt.get(id)||0)<2000)return;
    if(engineEpoch!==undefined&&livePressureStale.get(id)===engineEpoch)return;
    livePressureAt.set(id,now);
    const matchId=BigInt(id),head=await base.getBlockNumber({cacheTime:0}),sourceBlock=head>2n?head-2n:0n;
    const [book,epoch]=await Promise.all([readMarket('books',[matchId]),readAdapter('matchEpoch',[matchId])]);
    if(engineEpoch!==undefined&&!livePressureEpochUsable(epoch,engineEpoch)){
      // A match resumed in a later epoch from Monad's published state keeps its
      // round's epoch, which is the one LivePressure.epoch must carry, and
      // checkPressure accepts only the current epoch. Nothing is signed: the
      // command could only be rejected, and each attempt would hold the single
      // writer ahead of the Chaos guard's tick. Its paddles stay as they are.
      livePressureStale.set(id,engineEpoch);
      while(livePressureStale.size>128)livePressureStale.delete(livePressureStale.keys().next().value!);
      console.warn(JSON.stringify({event:'rooms-chaos-pressure-suspended',app,matchId:id,matchEpoch:String(epoch),engineEpoch:String(engineEpoch),at:new Date().toISOString()}));
      return;
    }
    if(book[2]===0n||epoch===0n){
      const published=await base.readContract({address:m.app,abi:roomsRealtimeAbi,functionName:'getSnapshot',args:[matchId],blockNumber:sourceBlock});
      if(published[2]!==2n||published[12].mode!==1||published[12].seed!==s[12].seed)return;
      if(book[2]===0n)await enqueue('market','open',[id,parseEther('0.005')],parseEther('0.004'));
      if(epoch===0n)await enqueue('game','openRound',[id],0n,`live-market:${id}`);
      return;
    }
    const [block,paid]=await Promise.all([base.getBlock({blockNumber:sourceBlock}),readMarket('pressure',[matchId],sourceBlock)]);
    if(!block.hash)throw new Error('Confirmed betting block unavailable');
    const [paidA,paidB]=paid as [bigint,bigint];
    const cached=livePressureDelivered.get(id);
    if(cached&&now-cached.checkedAt<10000&&paidA===cached.a&&paidB===cached.b)return;
    const queued=await readQueued();
    if(paidA<queued[0]||paidB<queued[1])throw new Error('Betting source changed; retaining the last authenticated paddle sizes');
    if(paidA===queued[0]&&paidB===queued[1]){livePressureDelivered.set(id,{a:paidA,b:paidB,checkedAt:now});return;}
    if(sourceBlock<=queued[2])return;
    const checkpoint=livePressureCheckpoint(m.app,m.market,matchId,epoch,s[12].seed,sourceBlock,block.hash,paidA,paidB);
    if((await base.getBlock({blockNumber:sourceBlock})).hash!==block.hash)throw new Error('Betting source reorganized');
    await db.query('INSERT INTO il_live_pressure(app,id,epoch,source_block,source_hash,paid_a,paid_b,checkpoint) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING',
      [app,id,String(epoch),String(sourceBlock),block.hash,String(paidA),String(paidB),checkpoint]);
    const stored=(await db.query('SELECT checkpoint FROM il_live_pressure WHERE app=$1 AND id=$2 AND epoch=$3 AND source_block=$4',[app,id,String(epoch),String(sourceBlock)])).rows[0];
    if(stored?.checkpoint!==checkpoint)throw new Error('Conflicting confirmed betting source');
    const events=m.rulesVersion===6;
    const rally=events?s[13]?.physics.score.rally:s[12].scoreA+s[12].scoreB;
    if(!Number.isSafeInteger(rally)||rally<(events?1:0))throw Error('Verified rally counter unavailable');
    const p={matchId,epoch,seed:s[12].seed as Hex,rally,paidA,paidB,sourceBlock,checkpoint,expires:BigInt(Math.floor(Date.now()/1000)+25)};
    const signature=await signer.signTypedData({domain:events?eventsPressureDomain(m.app):livePressureDomain(m.app),types:events?eventsPressureTypes:livePressureTypes,primaryType:'LivePressure',message:p});
    await send(encodeFunctionData({abi:events?roomsEventsAbi:roomsRealtimeAbi,functionName:'submitLivePressure',args:[p,signature]}));
    // An executed catch-up may not install this checkpoint. Read the actual queue.
    const applied=await readQueued();livePressureDelivered.set(id,{a:applied[0],b:applied[1],checkedAt:Date.now()});
    lastError='';
  }
  async function pressure(
    id: string,
    s: any,
    send: (data: Hex) => Promise<void>,
    readQueued?:()=>Promise<any>,
    /** The epoch the game node serves; live pressure of another epoch is never signed. */
    engineEpoch?:bigint,
  ) {
    if (Number(s[2]) !== 2 || s[12].mode !== 1) return;
    if(realtime){if(!readQueued)throw new Error('Realtime pressure observer required');return continuousPressure(id,s,send,readQueued,engineEpoch);}
    if(!s[12].awaitingServe)return;
    const state = s[12],
      matchId = BigInt(id),
      rally = state.scoreA + state.scoreB;
    const ready = await readAdapter("checkpointReady", [
      matchId,
      rally,
      state.resumeAt,
    ]);
    if (!ready[0]) {
      const round = await readAdapter("rounds", [matchId, rally]);
      if (round[0] === 0n) {
        // The live engine can be a publication ahead of Monad. Pin the complete
        // published snapshot before requesting a Monad window, including its
        // exact rally/serve identity. A key press only changes its revision.
        const blockNumber=await base.getBlockNumber();
        const published=await base.readContract({address:m.app,abi:roomsChaosAbi,functionName:'getSnapshot',args:[matchId],blockNumber});
        if(!sameChaosPause(matchId,state,published))return;
        const book = await readMarket("books", [matchId]);
        if (book[2] === 0n)
          await enqueue(
            "market",
            "open",
            [id, parseEther("0.005")],
            parseEther("0.004"),
          );
        try{
          await enqueue("game","openRound",[id],0n,`round:${id}:${rally}:${state.resumeAt}`);
        }catch(e){
          // The opponent may concede between the read and the relay preflight,
          // or another keeper may open the same round. Reobserve; do not sign
          // a replacement for a transaction with an uncertain receipt.
          if(!chaosWindowMoved(e))throw e;
        }
      }
      return;
    }
    const sourceBlock: bigint = ready[1],
      block = await base.getBlock({ blockNumber: sourceBlock });
    if (!block.hash) throw new Error("Pressure block unavailable");
    const stored = (
      await db.query(
        "SELECT * FROM il_pressure WHERE app=$1 AND id=$2 AND rally=$3",
        [app, id, rally],
      )
    ).rows[0];
    let frozen = stored;
    if (
      stored &&
      (stored.source_hash !== block.hash ||
        BigInt(stored.resume_at) !== state.resumeAt)
    )
      throw new Error(
        "Pressure source changed; this round needs recovery before play resumes",
      );
    if (!frozen) {
      const [paidA, paidB] = await readMarket(
        "pressure",
        [matchId],
        sourceBlock,
      );
      const checkpoint = pressureCheckpoint(
        m.app,
        m.market,
        matchId,
        rally,
        state.resumeAt,
        sourceBlock,
        block.hash,
        paidA,
        paidB,
      );
      const after = await base.getBlock({ blockNumber: sourceBlock });
      if (after.hash !== block.hash)
        throw new Error("Pressure source reorganized");
      await db.query(
        "INSERT INTO il_pressure VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING",
        [
          app,
          id,
          rally,
          String(state.resumeAt),
          String(sourceBlock),
          block.hash,
          String(paidA),
          String(paidB),
          checkpoint,
        ],
      );
      frozen = (
        await db.query(
          "SELECT * FROM il_pressure WHERE app=$1 AND id=$2 AND rally=$3",
          [app, id, rally],
        )
      ).rows[0];
      if (frozen.checkpoint !== checkpoint)
        throw new Error("Conflicting pressure checkpoint");
    }
    const p = {
      matchId,
      rally,
      resumeAt: BigInt(frozen.resume_at),
      sourceBlock: BigInt(frozen.source_block),
      paidA: BigInt(frozen.paid_a),
      paidB: BigInt(frozen.paid_b),
      checkpoint: frozen.checkpoint as Hex,
      expires: BigInt(Math.floor(Date.now() / 1000) + 25),
    };
    const signature = await signer.signTypedData({
      domain: pressureDomain(m.app),
      types: pressureTypes,
      primaryType: "Pressure",
      message: p,
    });
    await send(
      encodeFunctionData({
        abi: roomsChaosAbi,
        functionName: "submitPressure",
        args: [p, signature],
      }),
    );
  }
  async function audit() {
    if (working || Date.now() - auditAt < 5000) return;
    working = true;
    auditAt = Date.now();
    try {
      const head = await base.getBlockNumber(),
        safe = head > 2n ? head - 2n : 0n;
      const cursor = (
        await db.query("SELECT block FROM il_market_cursor WHERE app=$1", [app])
      ).rows[0];
      const from = cursor ? BigInt(cursor.block) + 1n : BigInt(m.startBlock),
        to = from + 499n < safe ? from + 499n : safe;
      // Discover recent bettors independently of the historical scan. A newly
      // started worker can be thousands of blocks behind; current published
      // matches must not wait for that backlog before becoming payable.
      try {
      if(safe>=BigInt(m.startBlock)&&from+100n<safe){
        const recentFrom=safe>99n&&safe-99n>BigInt(m.startBlock)?safe-99n:BigInt(m.startBlock);
        const recent=await base.getContractEvents({address:m.market,abi:marketAbi,fromBlock:recentFrom,toBlock:safe});
        for(const l of recent)if(l.eventName==='BetPlaced'&&l.args.player&&l.args.matchId!==undefined)
          await db.query('INSERT INTO il_bettors(app,id,player) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[app,String(l.args.matchId),l.args.player.toLowerCase()]);
      }
      } catch {
        console.error(JSON.stringify({at:new Date().toISOString(),code:'MARKET_RECENT_RETRY',app}));
      }
      try {
      if (from <= to) {
        // Public Monad RPCs cap eth_getLogs at 100 blocks. Keep the persisted
        // cursor atomic for the whole page while each read respects that cap.
        const chunks = [];
        for (let start = from; start <= to; start += 100n)
          chunks.push(
            base.getContractEvents({
              address: m.market,
              abi: marketAbi,
              fromBlock: start,
              toBlock: start + 99n < to ? start + 99n : to,
            }),
          );
        const logs = (await Promise.all(chunks)).flat();
        const c = await db.connect();
        try {
          await c.query("BEGIN");
          for (const l of logs) {
            if (
              l.eventName === "BetPlaced" &&
              l.args.player &&
              l.args.matchId !== undefined
            )
              await c.query(
                "INSERT INTO il_bettors(app,id,player) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
                [app, String(l.args.matchId), l.args.player.toLowerCase()],
              );
            if (
              (l.eventName === "PayoutPaid" ||
                l.eventName === "PayoutDeferred") &&
              l.args.payoutId &&
              l.transactionHash
            )
              await c.query(
                "INSERT INTO il_payment_receipts VALUES($1,$2,$3,$4) ON CONFLICT(app,payout_id) DO UPDATE SET status=$3,tx_hash=$4",
                [app, l.args.payoutId, l.eventName, l.transactionHash],
              );
          }
          await c.query(
            "INSERT INTO il_market_cursor VALUES($1,$2) ON CONFLICT(app) DO UPDATE SET block=$2",
            [app, String(to)],
          );
          await c.query("COMMIT");
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      }
      } catch {
        // Preserve the historical cursor and retry it later. Known positions
        // are still checked against their contracts below, without trusting an
        // indexer or a caller-provided amount/destination.
        console.error(JSON.stringify({at:new Date().toISOString(),code:'MARKET_HISTORY_RETRY',app,from:String(from),to:String(to)}));
      }
      const pending = (
        await db.query(
          "SELECT DISTINCT b.id FROM il_bettors b WHERE b.app=$1 AND NOT b.settled ORDER BY b.id LIMIT 20",
          [app],
        )
      ).rows;
      const canFinalize = pending.length
        ? (
            await base.readContract({
              address: hub,
              abi: roomsLifecycleHubAbi,
              functionName: "sessionOf",
              args: [m.app, zeroHash],
            })
          ).status === 0
        : false;
      const early = m.settlement === "early-published-testnet";
      for (const row of pending) {
        const id = BigInt(row.id),
          result = await readAdapter("result", [id]);
        if (result[3] < 3) {
          const publishedHash = early || canFinalize ? await base.readContract({address:m.app,abi:roomsChaosAbi,functionName:"resultHashes",args:[id]}) : zeroHash;
          if (publishedHash !== zeroHash && (early || canFinalize))
            try {
              await enqueue("game", "finalizeResult", [row.id]);
            } catch {
              /* The adapter checks publication, epoch and challenges again at inclusion. */
            }
          continue;
        }
        const bettors = (
          await db.query(
            "SELECT player FROM il_bettors WHERE app=$1 AND id=$2 AND NOT settled",
            [app, row.id],
          )
        ).rows;
        for (const { player } of bettors) {
          const position = await readMarket("positions", [id, player]);
          if (position[2] > 0n && !position[3]) {
            await enqueue("market", "claim", [row.id, player]);
            break;
          }
          if (position[3]) {
            const payoutId = await readMarket("payoutId", [0, id, player]),
              payout = await readMarket("payouts", [payoutId]);
            if (payout[2] === 1 && payout[3] < 6)
              await enqueue(
                "market",
                "retryPayout",
                [payoutId],
                0n,
                `retry:${payoutId}:${payout[3]}`,
              );
            else
              await db.query(
                "UPDATE il_bettors SET settled=true WHERE app=$1 AND id=$2 AND player=$3",
                [app, row.id, player],
              );
          }
          if (position[2] === 0n)
            await db.query(
              "UPDATE il_bettors SET settled=true WHERE app=$1 AND id=$2 AND player=$3",
              [app, row.id, player],
            );
        }
      }
      lastError = "";
    } catch (e) {
      lastError = (e as Error).message;
    } finally {
      working = false;
    }
  }
  async function view(
    id: string,
    player: string,
    side: number,
    shares: bigint,
  ) {
    const matchId = BigInt(id);
    const [book, window, result, position, paid, quote] = await Promise.all([
      display(`book:${id}`, () => readMarket("books", [matchId])),
      display(`window:${id}`, () => readAdapter("bettingWindow", [matchId, 0])),
      display(`result:${id}`, () => readAdapter("result", [matchId])),
      display(`position:${id}:${player}`, () =>
        readMarket("positions", [matchId, player]),
      ),
      display(`pressure:${id}`, () => readMarket("pressure", [matchId])),
      display(`quote:${id}:${side}:${shares}`, () =>
        readMarket("quote", [matchId, side, shares]),
      ).catch(() => null),
    ]);
    const payoutId = position[3]
      ? await display(`payoutId:${id}:${player}`, () =>
          readMarket("payoutId", [0, matchId, player]),
        )
      : null;
    const payout = payoutId
      ? await display(`payout:${payoutId}`, () =>
          readMarket("payouts", [payoutId]),
        )
      : null;
    const terminal = (
      await db.query("SELECT phase FROM il_results WHERE app=$1 AND id=$2", [
        m.app.toLowerCase(),
        id,
      ])
    ).rows[0];
    const payment = (
      await db.query(
        "SELECT status,tx_hash FROM il_payment_receipts WHERE app=$1 AND payout_id=$2",
        [app, payoutId],
      )
    ).rows[0];
    const head = await base.getBlockNumber();
    const claimPreview=realtime&&result[3]>=3 ? await readMarket('claimPreview',[matchId,player]) : null;
    return {
      manifest: m,
      book,
      window,
      result,
      position,
      paid,
      quote,
      payoutId,
      payout,
      payment,
      claimPreview,
      terminal: terminal?.phase >= 3,
      head,
      bridgeError: lastError,
      settlementPolicy: m.settlement || "finalized",
    };
  }
  const publishedResults=publishedResultReader(base,m);
  const captured=new FinalizationMemory();
  let deferredLog='';
  async function beforeRenew(epoch?:bigint){
    if(!m.settlement)return;
    // Capture every new market result before its hub epoch can change, even if
    // the lobby missed an end event. Transfers themselves can finish afterwards.
    // A match Monad still publishes as live cannot be captured in this epoch: it
    // resumes on the next epoch's node and can only end there. Waiting for it
    // would hold the renewal forever, so it is deferred to a later pass (its
    // bettors are paid once its result is published and finalized).
    const rows=(await db.query("SELECT DISTINCT id FROM il_bettors WHERE app=$1 ORDER BY id",[app])).rows;
    // Captured and unmarketed results are not read again; unpublished ones are
    // not read again for this epoch. One failed read skips only its own result.
    const {next,deferred,failed}=await nextFinalization(rows.map(r=>String(r.id)),publishedResults,captured,String(epoch??''));
    const key=deferredKey(deferred);
    if(key!==deferredLog){deferredLog=key;if(key)console.warn(JSON.stringify({event:'rooms-finance-capture-deferred',app,results:deferred,at:new Date().toISOString()}));}
    if(!next){
      if(failed.length)throw new Error(`Could not read ${failed.length} betting result(s) from Monad; retrying before renewal`);
      return;
    }
    if(next.verdict==='ready')await enqueue("game","finalizeResult",[next.id]);
    throw new Error("Waiting for published betting results to be captured before renewal");
  }
  async function route(
    path: string,
    method: string,
    player: string,
    body: any,
    params: URLSearchParams,
  ) {
    if (path === "/interlude/finance" && method === "GET") {
      const [balance, nonce, walletBalance] = await Promise.all([
        base.readContract({
          address: m.vault,
          abi: vaultAbi,
          functionName: "balances",
          args: [player as Address],
        }),
        base.readContract({
          address: m.vault,
          abi: vaultAbi,
          functionName: "nonces",
          args: [player as Address],
        }),
        base.getBalance({ address: player as Address }),
      ]);
      const history = (
        await db.query(
          "SELECT b.id,r.phase,r.ended_at FROM il_bettors b LEFT JOIN il_results r ON r.app=$3 AND r.id=b.id WHERE b.app=$1 AND b.player=$2 ORDER BY r.ended_at DESC NULLS FIRST LIMIT 20",
          [app, player,m.app.toLowerCase()],
        )
      ).rows;
      return {
        manifest: m,
        balance,
        nonce,
        walletBalance,
        marketNonce: await readMarket("nonces", [player]),
        history,
      };
    }
    const match = /^\/interlude\/markets\/([0-9]+)$/.exec(path);
    if (match && method === "GET") {
      if(params.has('round')){
        const id=idSchema.parse(match[1]),rally=z.coerce.number().int().min(0).max(12).parse(params.get('round'));
        return display(`round:${id}:${rally}`,async()=>{
          const head=await base.getBlockNumber({cacheTime:0});
          const window=await readAdapter('bettingWindow',[BigInt(id),0],head);
          return {app:m.app,id,rally,head,observedAt:Date.now(),...(realtime?{stage:window[0]?'open':'closed',label:window[0]?'Betting live':'Bets closed',blocksLeft:0,realtime:true}:roomsRoundStatus(rally,window[1],window[0],head))};
        });
      }
      const side = z.coerce
        .number()
        .int()
        .min(0)
        .max(1)
        .parse(params.get("side") || 0);
      const shares = BigInt(
        idSchema.parse(params.get("shares") || "1000000000000000"),
      );
      return view(idSchema.parse(match[1]), player, side, shares);
    }
    if (method !== "POST") return undefined;
    if (path === "/interlude/finance/buy") {
      const b = body.bet;
      if (!b || String(b.player).toLowerCase() !== player)
        throw new Error("Bet account mismatch");
      const id = idSchema.parse(b.matchId);
      signature.parse(body.signature);
      const job = await enqueue("market", "buy", [
        { ...b, matchId: id },
        body.signature,
      ]);
      await db.query(
        "INSERT INTO il_bettors(app,id,player) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [app, id, player],
      );
      return job;
    }
    if (path === "/interlude/finance/withdraw") {
      if (String(body.player).toLowerCase() !== player)
        throw new Error("Withdrawal account mismatch");
      signature.parse(body.signature);
      return enqueue("vault", "withdraw", [
        player,
        body.recipient,
        body.amount,
        body.nonce,
        body.deadline,
        body.signature,
      ]);
    }
    if (path === "/interlude/finance/retry") {
      const id = idSchema.parse(body.id),
        payoutId = await readMarket("payoutId", [0, BigInt(id), player]);
      const payout = await readMarket("payouts", [payoutId]);
      return enqueue(
        "market",
        "retryPayout",
        [payoutId],
        0n,
        `retry:${payoutId}:${payout[3]}`,
      );
    }
    if (path === "/interlude/finance/credit") {
      const expires = z.number().int().parse(body.expires);
      signature.parse(body.signature);
      if (
        expires < Date.now() / 1000 ||
        expires > Date.now() / 1000 + 300 ||
        !(await verifyMessage({
          address: player as Address,
          message: roomsCreditMessage(player, m.app, expires),
          signature: body.signature as Hex,
        }))
      )
        throw new Error("Invalid credit signature");
      const old = (
        await db.query(
          "SELECT job_id FROM il_credits WHERE app=$1 AND player=$2",
          [app, player],
        )
      ).rows[0];
      if (old) return { id: old.job_id };
      const job = await enqueue(
        "vault",
        "depositFor",
        [player],
        parseEther("0.02"),
      );
      await db.query(
        "INSERT INTO il_credits VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [app, player, job.id],
      );
      return job;
    }
    return undefined;
  }
  return { manifest:m, pressure, beforeRenew, audit:async()=>{await Promise.all([audit(),settlementAudit?.audit()]);}, route, hasBook:async(id:string)=>BigInt((await readMarket("books",[BigInt(id)]))[2])>0n, status: () => [lastError,settlementAudit?.status()].filter(Boolean).join("; ") };
}
