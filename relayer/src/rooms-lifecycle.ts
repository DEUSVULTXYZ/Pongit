import { readFile } from "node:fs/promises";
import {
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  zeroHash,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import type { Pool, PoolClient } from "pg";
import { roomsLifecycleHubAbi as hubAbi } from "../../shared/abi-rooms-lifecycle";
import {readHubDelegation} from "../../shared/rooms-hub";
import { roomsMarketAdapterAbi } from "../../shared/abi-RoomsMarketAdapter";
import { requestHostedRenewal } from "./rooms-hosted-renewal";
import { roomsDrainBlocker } from "../../shared/rooms-availability";
import {assertRoomsEngineAvailable} from "../../shared/rooms-availability";
import {retireClosedEpochJobs} from "./rooms-engine-recovery";
import {deferredKey,FinalizationMemory,nextFinalization,type PublishedResultReader} from "./rooms-finalization";
const appAbi = parseAbi([
  "function operator() view returns(address)",
  "function closeEngine()",
  "function renewEngine() payable",
  "function activeCount() view returns(uint256)",
]);
type Stage =
  | "playing"
  | "draining"
  | "challenge"
  | "finalizing"
  | "renewing"
  | "starting";

/** One operator nonce owner. Enable only after the release's renewal rehearsal.
 * Existing player accounts and game-session scopes acquire no new permissions.
 */
export async function roomsLifecycle(o: {
  db: Pool;
  base: PublicClient;
  app: Address;
  hub: Address;
  adapter: Address;
  nodeUrl: string;
  engineStatus: () => Promise<any>;
  engineActive: () => Promise<bigint>;
  /** The closed epoch whose results are being captured. */
  beforeRenew?: (epoch: bigint) => Promise<void>;
  beforeClose?: (epoch: bigint) => Promise<void>;
  onReady?: (epoch: bigint) => void;
  /** Monad reads that decide whether the adapter can finalize a result now. */
  publishedResult: PublishedResultReader;
}) {
  const file = process.env.ROOMS_LIFECYCLE_KEY_FILE;
  if (!file) return null;
  const key = JSON.parse(await readFile(file, "utf8")),
    account = privateKeyToAccount(key.privateKey);
  if (
    (
      await o.base.readContract({
        address: o.app,
        abi: appAbi,
        functionName: "operator",
      })
    ).toLowerCase() !== account.address.toLowerCase()
  )
    throw new Error("Rooms lifecycle operator mismatch");
  const wallet = createWalletClient({
    chain: monadTestnet,
    account,
    transport: http(process.env.RPC_URL),
  });
  await o.db
    .query(`CREATE TABLE IF NOT EXISTS il_lifecycle(app text PRIMARY KEY,stage text NOT NULL,changed_at timestamptz NOT NULL DEFAULT now());
 ALTER TABLE il_lifecycle ADD COLUMN IF NOT EXISTS epoch bigint NOT NULL DEFAULT 0;
 ALTER TABLE il_lifecycle ADD COLUMN IF NOT EXISTS provision_epoch bigint NOT NULL DEFAULT 0;
 ALTER TABLE il_lifecycle ADD COLUMN IF NOT EXISTS provisioning jsonb;
 CREATE TABLE IF NOT EXISTS il_lifecycle_jobs(id text PRIMARY KEY,app text NOT NULL,owner text NOT NULL,nonce bigint NOT NULL,raw text NOT NULL,hash text NOT NULL,status text NOT NULL,UNIQUE(owner,nonce));`);
  await o.db.query(
    "INSERT INTO il_lifecycle(app,stage) VALUES($1,'playing') ON CONFLICT DO NOTHING",
    [o.app],
  );
  let stage = (
      await o.db.query("SELECT stage FROM il_lifecycle WHERE app=$1", [o.app])
    ).rows[0].stage as Stage,
    working = false,
    error = "",
    healthy = false;
  let sessionInfo={epoch:'0',expiresAt:0,releaseAt:0,batch:'0'},reportedError='',reportedDeferred='';
  const finalization=new FinalizationMemory();
  const transition = async (s: Stage) => {
    const previous=stage;
    await o.db.query(
      "UPDATE il_lifecycle SET stage=$2,changed_at=now() WHERE app=$1",
      [o.app, s],
    );
    stage = s;
    console.info(JSON.stringify({event:'rooms-lifecycle-transition',app:o.app,previous,stage:s,at:new Date().toISOString()}));
  };
  async function submit(id: string, to: Address, data: Hex) {
    let job = (
      await o.db.query("SELECT * FROM il_lifecycle_jobs WHERE id=$1", [id])
    ).rows[0];
    if (!job) {
      const pending = (
        await o.db.query(
          "SELECT * FROM il_lifecycle_jobs WHERE owner=$1 AND status='pending' LIMIT 1",
          [account.address.toLowerCase()],
        )
      ).rows[0];
      if (pending)
        throw new Error("An operator transaction is awaiting confirmation");
      const nonce = await o.base.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      });
      if (
        nonce !==
        (await o.base.getTransactionCount({
          address: account.address,
          blockTag: "latest",
        }))
      )
        throw new Error("Operator account is being used elsewhere");
      await o.base.call({ account: account.address, to, data });
      const request = await wallet.prepareTransactionRequest({
        to,
        data,
        nonce,
      });
      request.gas = (request.gas * 12n) / 10n;
      const raw = await wallet.signTransaction(request),
        hash = keccak256(raw);
      job = { id, raw, hash, status: "pending" };
      await o.db.query(
        "INSERT INTO il_lifecycle_jobs VALUES($1,$2,$3,$4,$5,$6,'pending')",
        [id, o.app, account.address.toLowerCase(), nonce, raw, hash],
      );
    }
    if (job.status === "failed")
      throw new Error(
        "Operator transaction reverted; inspect its receipt before recovery",
      );
    if (job.status === "confirmed") return true;
    let r = await o.base
      .getTransactionReceipt({ hash: job.hash })
      .catch(() => null);
    if (!r) {
      await o.base.sendRawTransaction({ serializedTransaction: job.raw });
      return false;
    }
    await o.db.query("UPDATE il_lifecycle_jobs SET status=$2 WHERE id=$1", [
      id,
      r.status === "success" ? "confirmed" : "failed",
    ]);
    if (r.status !== "success")
      throw new Error("Operator transaction reverted");
    return true;
  }
  async function cycle() {
    if (working) return;
    working = true;
    let c: PoolClient | undefined,
      locked = false;
    try {
      c = await o.db.connect();
      locked = (await c.query("SELECT pg_try_advisory_lock(701340) AS ok"))
        .rows[0].ok;
      if (!locked) return;
      const pending = (
        await o.db.query(
          "SELECT * FROM il_lifecycle_jobs WHERE owner=$1 AND status='pending' ORDER BY nonce LIMIT 1",
          [account.address.toLowerCase()],
        )
      ).rows[0];
      if (pending) {
        const r = await o.base
          .getTransactionReceipt({ hash: pending.hash })
          .catch(() => null);
        if (!r) {
          if(process.env.ROOMS_LIFECYCLE_HOLD_WRITES==='true'){
            healthy=false;error='Operator approval required: pending lifecycle transaction preserved without rebroadcast';return;
          }
          await o.base.sendRawTransaction({
            serializedTransaction: pending.raw,
          });
          return;
        }
        await o.db.query("UPDATE il_lifecycle_jobs SET status=$2 WHERE id=$1", [
          pending.id,
          r.status === "success" ? "confirmed" : "failed",
        ]);
        if (r.status !== "success")
          throw new Error("Operator transaction reverted; review required");
      }
      const d = await readHubDelegation(o.base, o.hub, o.app);
      sessionInfo={epoch:String(d.epoch),expiresAt:Number(d.expiresAt)*1000,releaseAt:Number(d.stakeUnlockAt)*1000,batch:String(d.batchIndex)};
      if (d.epoch > 0n)
        await o.db.query("UPDATE il_lifecycle SET epoch=$2 WHERE app=$1", [
          o.app,
          String(d.epoch),
        ]);
      const epoch = (
        await o.db.query("SELECT epoch FROM il_lifecycle WHERE app=$1", [o.app])
      ).rows[0].epoch;
      const now = BigInt(Math.floor(Date.now() / 1000)),
        prefix = `${o.app}:${epoch}`;
      if(d.status===0 && stage!=='playing'){
        // The hub has released the whole epoch. Its raw bytes stay in the journal.
        // This includes commands still pending: after a forceClose of a halted
        // node nobody could confirm or refuse them, and none of them can be
        // published any more. Left pending, the first one would stop every
        // relayer command of the next epoch ("from another delegation").
        await retireClosedEpochJobs({db:o.db,app:o.app,closedThrough:BigInt(epoch),kind:'epoch-closed'});
      }
      healthy = false;
      error = "";
      if(process.env.ROOMS_LIFECYCLE_HOLD_WRITES==='true'){
        error='Operator approval required: lifecycle writes and hosted renewal are held; observation remains active';return;
      }
      if (d.status === 3) {
        error = "Delegation challenged; automatic renewal is suspended";
        return;
      }
      if (d.status === 1) {
        if (stage === "renewing" || stage === "starting") {
          if (stage !== "starting") await transition("starting");
          // The hosted operator serves the same app and must pick up the new epoch.
          const node = await o.engineStatus().catch(() => null);
          if (node && BigInt(node.epoch) === d.epoch) {
            assertRoomsEngineAvailable(o.app,node,d,Number(now));
            await o.engineActive();
            if(BigInt(node.committedBatches)!==d.batchIndex)throw new Error('Hosted publication differs from Monad; awaiting synchronization');
            await transition("playing");
            healthy = true;
            o.onReady?.(d.epoch);
          } else {
            await requestHostedRenewal(o.db, o.app, d.epoch, o.nodeUrl);
            error = `Hosted engine has not confirmed epoch ${d.epoch}; awaiting operator startup`;
          }
          return;
        }
        if (stage === "playing" && d.expiresAt > now + 3600n) {
          healthy = true;
          o.onReady?.(d.epoch);
          return;
        }
        if (stage !== "draining") await transition("draining");
        const row = (
          await o.db.query("SELECT changed_at FROM il_lifecycle WHERE app=$1", [
            o.app,
          ])
        ).rows[0];
        if (Date.now() - new Date(row.changed_at).getTime() < 60000) return;
        // Admission has been stopped for longer than a consent ticket can live.
        const node = await o.engineStatus();
        error = roomsDrainBlocker(d.expiresAt <= now, await o.engineActive(), node.pendingDiffs.length, BigInt(node.epoch) === d.epoch);
        if (error) return;
        await o.beforeClose?.(d.epoch);
        // Fence first, then repeat both live and published drain checks.
        const fencedNode=await o.engineStatus();
        const fencedError=roomsDrainBlocker(d.expiresAt<=now,await o.engineActive(),fencedNode.pendingDiffs.length,BigInt(fencedNode.epoch)===d.epoch);
        if(fencedError)throw new Error(fencedError);
        if(await o.base.readContract({address:o.app,abi:appAbi,functionName:'activeCount'})!==0n)throw new Error('Published match changed during closure preparation');
        if (
          (
            await o.db.query(
              "SELECT 1 FROM il_engine_jobs WHERE app=$1 AND status='pending' LIMIT 1",
              [o.app],
            )
          ).rowCount
        ) {
          error = "An engine transaction remains unconfirmed; reconcile its receipt and nonce before renewal";
          return;
        }
        if (
          await submit(
            prefix + ":close",
            o.app,
            encodeFunctionData({ abi: appAbi, functionName: "closeEngine" }),
          )
        )
          await transition("challenge");
        return;
      }
      if (d.status === 2) {
        if (stage !== "challenge") await transition("challenge");
        if (now < d.stakeUnlockAt) return;
        if (
          await submit(
            prefix + ":release",
            o.hub,
            encodeFunctionData({
              abi: hubAbi,
              functionName: "releaseStake",
              args: [o.app, zeroHash],
            }),
          )
        )
          await transition("finalizing");
        return;
      }
      if (d.status !== 0) return;
      if (stage === "playing")
        throw new Error(
          "Delegation ended outside the lifecycle journal; review before renewal",
        );
      if (stage !== "renewing") {
        if (stage !== "finalizing") await transition("finalizing");
        const results = (
          await o.db.query(
            "SELECT id FROM il_results WHERE app=$1 AND mode=1 AND phase>=3 ORDER BY ended_at",
            [o.app],
          )
        ).rows;
        // il_results records what the node showed. A match the node ended but
        // Monad still publishes as live (the halted epoch's last, unsettled batch)
        // cannot be finalized in this epoch, and it can only end in the next one,
        // which starts from Monad's published state. Submitting it here would fail
        // its simulation forever and hold the renewal it needs, so it is deferred
        // and finalized by a later pass once its result is published.
        // Finalized and unmarketed results are remembered for good, unpublished
        // ones for this epoch's pass, so they are not read again every 10 s
        // (rooms-finalization.ts). A failed read skips only its own result.
        const {next,deferred,failed}=await nextFinalization(results.map(r=>String(r.id)),o.publishedResult,finalization,String(epoch));
        const key=deferredKey(deferred);
        if(key!==reportedDeferred){
          reportedDeferred=key;
          if(key)console.warn(JSON.stringify({event:'rooms-lifecycle-finalization-deferred',app:o.app,epoch:String(epoch),results:deferred,at:new Date().toISOString()}));
        }
        if(next?.verdict==='wait'){
          error=`Result ${next.id} is published with a finish time ahead of Monad; finalizing it shortly`;
          return;
        }
        if(next){
          await submit(
            prefix + ":final:" + next.id,
            o.adapter,
            encodeFunctionData({
              abi: roomsMarketAdapterAbi,
              functionName: "finalizeResult",
              args: [BigInt(next.id)],
            }),
          );
          return;
        }
        // Nothing to submit now, but some results could not be read: retry them
        // before renewing. Each is deferred as 'unreadable' after
        // FINALIZATION_READ_ATTEMPTS failing passes, so none holds renewal forever.
        if(failed.length){
          error=`Could not read ${failed.length} result(s) from Monad (${failed[0].error}); retrying before renewal`;
          return;
        }
        // The operator may hold a drained rehearsal here while inspecting payouts
        // or allowing the previous deployment to finish its last live matches.
        if (process.env.ROOMS_LIFECYCLE_HOLD_RENEW === "true") return;
        await transition("renewing");
      }
      await o.beforeRenew?.(BigInt(epoch));
      await submit(
        prefix + ":renew",
        o.app,
        encodeFunctionData({ abi: appAbi, functionName: "renewEngine" }),
      );
      error = "";
    } catch (e) {
      healthy = false;
      error = (e as Error).message.split("\n")[0].slice(0, 180);
    } finally {
      if(error!==reportedError){reportedError=error;console.warn(JSON.stringify({event:'rooms-lifecycle-diagnostic',app:o.app,stage,error,at:new Date().toISOString()}));}
      if (c) {
        if (locked)
          await c.query("SELECT pg_advisory_unlock(701340)").catch(() => {});
        c.release();
      }
      working = false;
    }
  }
  let inflight: Promise<void> = Promise.resolve();
  const step = () => (working ? inflight : (inflight = cycle()));
  const timer = setInterval(() => void step(), 10000);
  timer.unref();
  void step();
  return {
    available: () => process.env.ROOMS_LIFECYCLE_HOLD_WRITES!=='true' && stage === "playing" && healthy,
    status: () => ({ stage, error, healthy, ...sessionInfo,operatorHold:process.env.ROOMS_LIFECYCLE_HOLD_WRITES==='true' }),
    stop: () => clearInterval(timer),
    cycle: step,
  };
}
