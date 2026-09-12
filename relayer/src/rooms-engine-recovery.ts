import { decodeFunctionData, keccak256, parseTransaction, recoverTransactionAddress, zeroHash, type Abi, type Address, type Hex } from "viem";
import type { Pool } from "pg";

export type EngineJob = { id: string; app: string; epoch: string; nonce: string; raw: Hex; hash: Hex; status: string };

/** Decode the immutable journal, never trust operator-entered action metadata. */
export async function engineJobIdentity(job: EngineJob, abi: Abi, signer: Address) {
  const tx = parseTransaction(job.raw);
  if (keccak256(job.raw) !== job.hash || tx.to?.toLowerCase() !== job.app.toLowerCase() ||
      tx.type !== 'eip1559' || tx.chainId !== 4242 || (tx.value ?? 0n) !== 0n || BigInt(tx.nonce!) !== BigInt(job.nonce) ||
      (await recoverTransactionAddress({ serializedTransaction: job.raw as `0x02${string}` })).toLowerCase() !== signer.toLowerCase())
    throw new Error("Engine journal identity mismatch; manual review required");
  const decoded = decodeFunctionData({ abi, data: tx.data! });
  const first=decoded.args?.[0];
  const matchId=decoded.functionName==='submitPressure' ? (first as {matchId:bigint})?.matchId : first;
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
