import { decodeFunctionData, keccak256, parseTransaction, recoverTransactionAddress, zeroHash, type Abi, type Address, type Hex } from "viem";
import type { Pool } from "pg";
import { retirableRefusal, refusalReason } from "../../shared/engine-halt";

export type EngineJob = { id: string; app: string; epoch: string; nonce: string; raw: Hex; hash: Hex; status: string };

/** Commands the node refused before executing them. Their row leaves
 * il_engine_jobs, whose unique (app,epoch,nonce) index must admit the next
 * command at the same nonce; the exact bytes, the node's reason and the nonce
 * evidence stay here for review. */
export const ENGINE_REFUSALS_SCHEMA = "CREATE TABLE IF NOT EXISTS il_engine_refusals(app text NOT NULL,id text NOT NULL,epoch bigint NOT NULL,nonce bigint NOT NULL,hash text NOT NULL,raw text NOT NULL,action text,match_id text,signer text,reason text NOT NULL,latest_nonce bigint NOT NULL,refused_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(app,id))";

/** The agent arcade's rule (relayer/src/agents/writer.ts, commit 8a9f17b) for the
 * rooms journal, narrowed to the two refusals that can never be followed by an
 * execution of the same bytes. A pending command is retired only when BOTH hold:
 * - the node's own error is the gas cap ("transaction gas limit is greater than
 *   the cap": these bytes can never run on this node) or a halted node's "this
 *   session is over and the node is no longer accepting transactions";
 * - the node's latest transaction count for the signer equals the command's nonce,
 *   so the command did not run.
 * The generic "rejected before execution" prefix alone never retires: a duplicate
 * resend can be answered that way while the original is still in flight, when the
 * count still equals the nonce, and the original may execute afterwards.
 * Anything else stays pending exactly as before: a lost response, a timeout, a
 * local cooldown or publication gate (they carry no node refusal), a count that
 * moved, or a count that could not be read. The same bytes are then resent, never
 * replaced. A retired command's nonce is free; the next command signs it anew.
 *
 * A node halted for good cannot always answer the count. Its pending command then
 * stays pending until the hub has released the epoch, when retireClosedEpochJobs
 * makes it obsolete; the closing path after a forceClose never waits on it. */
export async function retireRefusedEngineJob(o: {
  db: Pick<Pool, "query">; app: Address; job: EngineJob; error: unknown;
  latestNonce: () => Promise<number | bigint>;
}) {
  if (!retirableRefusal(o.error)) return false;
  let latest: bigint;
  try { latest = BigInt(await o.latestNonce()); } catch { return false; }
  if (latest !== BigInt(o.job.nonce)) return false;
  const r = await o.db.query(
    `WITH gone AS (DELETE FROM il_engine_jobs WHERE app=$1 AND id=$2 AND hash=$3 AND nonce=$4 AND status='pending' RETURNING *)
     INSERT INTO il_engine_refusals(app,id,epoch,nonce,hash,raw,action,match_id,signer,reason,latest_nonce)
     SELECT app,id,epoch,nonce,hash,raw,action,match_id,signer,$5,$6 FROM gone`,
    [o.app, o.job.id, o.job.hash, String(o.job.nonce), refusalReason(o.error) || "refused before execution", String(latest)]);
  return (r.rowCount ?? 0) > 0;
}

/** Once the hub has closed an epoch, none of its commands can be published any
 * more, and resending one on the next epoch's node (same chain id, same signer)
 * could replay it at a colliding nonce. Pending and quarantined commands of that
 * epoch and every earlier one become obsolete; their bytes stay in the journal.
 * Evidence accepted: the hub released the epoch (lifecycle, status None), or the
 * hub and the node both serve a later active epoch (maintenance). */
export async function retireClosedEpochJobs(o: {
  db: Pick<Pool, "query">; app: Address; closedThrough: bigint; kind: "epoch-closed" | "epoch-superseded";
}) {
  const r = await o.db.query(
    "UPDATE il_engine_jobs SET status='obsolete',resolution=COALESCE(resolution,'{}'::jsonb)||jsonb_build_object('previousStatus',status)||$3::jsonb,updated_at=now() WHERE app=$1 AND epoch<=$2 AND status IN ('pending','quarantined')",
    [o.app, String(o.closedThrough), JSON.stringify({ kind: o.kind, closedEpoch: String(o.closedThrough), closedAt: new Date().toISOString() })]);
  return r.rowCount ?? 0;
}

/** How one resolved journal entry answers the command that resolved it. An
 * entry of ANOTHER command (another match, or another action) recovered in its
 * place is never this command's revert or success: the caller re-observes. */
export function publicCommandResult(outcome: "observed" | "failed", requested: Hex | null, executed: Hex): "ok" | "reverted" | "reconciled" {
  if (requested !== null && requested.toLowerCase() !== executed.toLowerCase()) return "reconciled";
  return outcome === "failed" ? "reverted" : "ok";
}

/** Decode the immutable journal, never trust operator-entered action metadata. */
export async function engineJobIdentity(job: EngineJob, abi: Abi, signer: Address) {
  const tx = parseTransaction(job.raw);
  if (keccak256(job.raw) !== job.hash || tx.to?.toLowerCase() !== job.app.toLowerCase() ||
      tx.type !== 'eip1559' || tx.chainId !== 4242 || (tx.value ?? 0n) !== 0n || BigInt(tx.nonce!) !== BigInt(job.nonce) ||
      (await recoverTransactionAddress({ serializedTransaction: job.raw as `0x02${string}` })).toLowerCase() !== signer.toLowerCase())
    throw new Error("Engine journal identity mismatch; manual review required");
  const decoded = decodeFunctionData({ abi, data: tx.data! });
  const first=decoded.args?.[0];
  const matchId=['submitPressure','submitLivePressure'].includes(decoded.functionName) ? (first as {matchId:bigint})?.matchId : first;
  return { action: decoded.functionName, matchId: String(matchId), signer: signer.toLowerCase(), data:tx.data!, args:decoded.args };
}

/** Only the exact hash and a recognized execution status resolve a sent command. */
export function engineReceiptOutcome(receipt:any,hash:Hex):'observed'|'failed'|null {
  if(!receipt)return null;
  if(receipt.transactionHash?.toLowerCase()!==hash.toLowerCase())throw new Error('Engine receipt hash mismatch');
  const status=String(receipt.status);
  if(['success','0x1','1'].includes(status))return 'observed';
  if(['reverted','0x0','0'].includes(status))return 'failed';
  return null;
}

/** Missing receipts remain uncertain. Only an observed receipt resolves execution. */
export async function reconcileEngineJobs(o: {
  db: Pick<Pool, "query">; app: Address;
  receipt: (hash: Hex) => Promise<any>;
}) {
  const jobs = (await o.db.query("SELECT * FROM il_engine_jobs WHERE app=$1 AND status IN ('pending','quarantined') ORDER BY epoch,nonce", [o.app])).rows;
  for (const job of jobs) {
    let receipt;
    try { receipt = await o.receipt(job.hash); } catch { continue; }
    const outcome=engineReceiptOutcome(receipt,job.hash);
    if(!outcome)continue;
    const status=String(receipt.status);
    await o.db.query("UPDATE il_engine_jobs SET status=$3,resolution=$4,updated_at=now() WHERE app=$1 AND id=$2 AND status IN ('pending','quarantined')",
      [o.app, job.id, outcome,
        { kind: "receipt", hash: job.hash, blockHash: receipt.blockHash, status, at: new Date().toISOString() }]);
  }
}

/** Called only behind the writer fence after drain checks. No transaction is sent.
 * A terminal published tick is no longer needed, but remains quarantined until
 * the hub proves the entire epoch closed. Never reuse its nonce in that epoch.
 */
export async function quarantineTerminalTicks(o: {
  db: Pick<Pool, "query">; app: Address; abi: Abi; signer: Address; epoch: bigint;
  snapshot: (id: bigint, published: boolean) => Promise<any>;
  resultHash: (id: bigint, published: boolean) => Promise<unknown>;
}) {
  const jobs = (await o.db.query("SELECT * FROM il_engine_jobs WHERE app=$1 AND status='pending' ORDER BY nonce", [o.app])).rows as EngineJob[];
  for (const job of jobs) {
    if (BigInt(job.epoch) !== o.epoch) throw new Error("Unresolved command belongs to another epoch; review required");
    const identity = await engineJobIdentity(job, o.abi, o.signer);
    if (identity.action !== "tick") throw new Error("Uncertain non-tick command requires explicit recovery");
    const id = BigInt(identity.matchId);
    const [live, settled, liveHash, settledHash] = await Promise.all([
      o.snapshot(id, false), o.snapshot(id, true), o.resultHash(id, false), o.resultHash(id, true),
    ]);
    if (live[2] !== 3n || settled[2] !== 3n || liveHash === zeroHash || liveHash !== settledHash ||
        live[6].toLowerCase() !== settled[6].toLowerCase() || live[12].scoreA !== settled[12].scoreA || live[12].scoreB !== settled[12].scoreB)
      throw new Error("Uncertain tick has no matching terminal published result; recovery waits");
    await o.db.query("UPDATE il_engine_jobs SET status='quarantined',signer=$3,action=$4,match_id=$5,resolution=$6,updated_at=now() WHERE app=$1 AND id=$2 AND status='pending'",
      [o.app, job.id, identity.signer, identity.action, identity.matchId,
        { kind: "terminal-published", epoch: String(o.epoch), resultHash: liveHash, winner: live[6], score: [live[12].scoreA, live[12].scoreB], at: new Date().toISOString() }]);
  }
}
