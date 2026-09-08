// Private service-test relay. It uses a separately funded key and database.
// Production uses main.ts and its existing relay_jobs nonce owner.
import assert from "node:assert/strict";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import type { Pool } from "pg";
import type { RelayRequest } from "../../shared/protocol";
import { loadRoomsFinance } from "../../relayer/src/rooms-finance-config";
export async function isolatedRoomsRelay(db: Pool) {
  assert.equal(process.env.ROOMS_PRIVATE_FINANCE_TEST, "true");
  const config = await loadRoomsFinance();
  await config.bind(db);
  const key = process.env.ROOMS_TEST_RELAYER_KEY as Hex;
  assert(key, "A private-test relayer key is required");
  const account = privateKeyToAccount(key);
  assert.notEqual(
    account.address.toLowerCase(),
    "0x19b4f7d8262094f2b97c133dc31937ed2a47b1dd",
  );
  const rpc = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
  const base = createPublicClient({
    chain: monadTestnet,
    transport: http(rpc),
  });
  const wallet = createWalletClient({
    chain: monadTestnet,
    account,
    transport: http(rpc),
  });
  const json = (x: unknown) =>
    JSON.stringify(x, (_, v) => (typeof v === "bigint" ? String(v) : v));
  await db.query(
    "CREATE TABLE IF NOT EXISTS test_finance_jobs(id text PRIMARY KEY,payload jsonb NOT NULL,value text NOT NULL,status text NOT NULL,raw text,tx_hash text,error text,created_at timestamptz DEFAULT now())",
  );
  let running = false;
  async function work() {
    if (running) return;
    running = true;
    try {
      const row = (
        await db.query(
          "SELECT * FROM test_finance_jobs WHERE status IN ('queued','sent') ORDER BY created_at LIMIT 1",
        )
      ).rows[0];
      if (!row) return;
      try {
        const call = config.encode(row.payload),
          value = BigInt(row.value);
        if (!row.raw) {
          await base.call({
            account: account.address,
            to: call.address,
            data: call.data,
            value,
          });
          const tx = await wallet.prepareTransactionRequest({
            to: call.address,
            data: call.data,
            value,
          });
          row.raw = await wallet.signTransaction(tx);
          row.tx_hash = keccak256(row.raw);
          await db.query(
            "UPDATE test_finance_jobs SET raw=$2,tx_hash=$3,status='sent' WHERE id=$1",
            [row.id, row.raw, row.tx_hash],
          );
        }
        let receipt = await base
          .getTransactionReceipt({ hash: row.tx_hash })
          .catch(() => null);
        if (!receipt) {
          await base
            .sendRawTransaction({ serializedTransaction: row.raw })
            .catch(() => {});
          receipt = await base
            .waitForTransactionReceipt({ hash: row.tx_hash, timeout: 20000 })
            .catch(() => null);
        }
        if (receipt)
          await db.query(
            "UPDATE test_finance_jobs SET status=$2,error=$3 WHERE id=$1",
            [
              row.id,
              receipt.status === "success" ? "succeeded" : "failed",
              receipt.status === "success" ? null : "Transaction reverted",
            ],
          );
      } catch (e) {
        if (!row.raw)
          await db.query(
            "UPDATE test_finance_jobs SET status='failed',error=$2 WHERE id=$1",
            [row.id, (e as Error).message.slice(0, 200)],
          );
      }
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => void work(), 300);
  const enqueue = async (
    payload: RelayRequest,
    _internal = true,
    value = 0n,
  ) => {
    assert.equal(payload.deployment, "rooms");
    const call = config.encode(payload),
      id = keccak256(
        toHex(
          json({
            to: call.address,
            data: call.data,
            value,
            roomAction: payload.roomAction,
          }),
        ),
      );
    const old = (
      await db.query("SELECT id,status FROM test_finance_jobs WHERE id=$1", [
        id,
      ])
    ).rows[0];
    if (old && old.status !== "failed") return old;
    // Only a fresh explicit request may requeue a preflight failure. Signed reverts
    // keep their receipt; a new signature/nonce creates a new operation.
    if (old) {
      await db.query(
        "UPDATE test_finance_jobs SET status='queued',error=null WHERE id=$1 AND raw IS NULL",
        [id],
      );
      return old;
    }
    await base.call({
      account: account.address,
      to: call.address,
      data: call.data,
      value,
    });
    await db.query(
      "INSERT INTO test_finance_jobs(id,payload,value,status) VALUES($1,$2,$3,'queued') ON CONFLICT DO NOTHING",
      [id, json(payload), String(value)],
    );
    return { id, status: "queued" };
  };
  return {
    config,
    enqueue,
    job: async (id: string) =>
      (
        await db.query(
          "SELECT id,status,tx_hash,error FROM test_finance_jobs WHERE id=$1",
          [id],
        )
      ).rows[0],
    stop: () => clearInterval(timer),
  };
}
