import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createPublicClient, http, parseTransaction, type Hex } from "viem";
import pg from "pg";
import { json, deploymentId, type Deployment } from "../shared/protocol";
const d: Deployment = JSON.parse(
  await readFile(
    process.env.DEPLOYMENT_FILE || "deployments/local.json",
    "utf8",
  ),
);
const id = process.env.MATCH_ID || "2";
const client = createPublicClient({
  transport: http(
    process.env.ALCHEMY_RPC_URL ||
      process.env.RPC_URL ||
      "http://127.0.0.1:8545",
  ),
});
if ((await client.getChainId()) !== d.chainId) throw new Error("Wrong chain");
const db = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://pong:pong-local-only@127.0.0.1:15432/pong",
});
await db.connect();
try {
  const result = await db.query(
    "SELECT j.* FROM relay_jobs j WHERE j.receipt IS NOT NULL AND j.payload->>'deployment'=$2 AND j.payload->>'contract'='game' AND (j.payload->'args'->>0=$1 OR j.payload->'args'->0->>'matchId'=$1 OR (j.payload->>'functionName'='playerAction' AND j.payload->'args'->>1=$1) OR j.id IN (SELECT job_id FROM rooms WHERE match_id=$1)) ORDER BY j.nonce",
    [id,deploymentId(d)],
  );
  if (!result.rows.length)
    throw new Error("No game receipts in the relayer journal");
  const rows = result.rows.map((row) => {
    const tx = parseTransaction(row.raw_tx as Hex);
    const r = row.receipt;
    return {
      hash: row.tx_hash,
      transition: row.payload.functionName,
      status: r.status,
      gasUsed: BigInt(r.gasUsed),
      gasLimit: tx.gas!,
      effectiveGasPrice: BigInt(r.effectiveGasPrice),
      chargedWei:
        (d.chainId === 10143 ? tx.gas! : BigInt(r.gasUsed)) *
        BigInt(r.effectiveGasPrice),
    };
  });
  await mkdir("artifacts", { recursive: true });
  const report = {
    network:
      d.chainId === 10143
        ? "Monad testnet"
        : "Local Anvil — not a Monad cost estimate",
    matchId: id,
    receipts: rows.length,
    chargedMatchWei: rows.reduce((s, r) => s + r.chargedWei, 0n),
    includes:
      "Game creation, reveals, inputs, keepers and concession submitted by this relayer, including reverted calls. Other direct submitters require their receipts.",
    measuredAt: new Date().toISOString(),
    rows,
  };
  await writeFile(`artifacts/match-cost-${id}.json`, json(report));
  console.log(json({ ...report, rows: undefined }));
} finally {
  await db.end();
}
