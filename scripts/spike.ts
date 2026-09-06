import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { createPublicClient, http } from "viem";

const url =
  process.env.ALCHEMY_RPC_URL ||
  process.env.RPC_URL ||
  "https://testnet-rpc.monad.xyz";
const client = createPublicClient({
  transport: http(url, { retryCount: 2 }),
  pollingInterval: 300,
});
const chainId = await client.getChainId();
const head = await client.getBlockNumber();
const blocks: {
  number: bigint;
  timestamp: bigint;
  gasLimit: bigint;
  hash: string;
}[] = [];
for (let i = 0n; i < 40n; i++) {
  const block = await client.getBlock({ blockNumber: head - i });
  blocks.push({
    number: block.number,
    timestamp: block.timestamp,
    gasLimit: block.gasLimit,
    hash: block.hash,
  });
  await new Promise((resolve) => setTimeout(resolve, 60));
}
const span = blocks[0].timestamp - blocks.at(-1)!.timestamp;
const report = {
  measuredAt: new Date().toISOString(),
  chainId,
  sampleSize: blocks.length,
  approximateBlockMs: (Number(span) * 1000) / (blocks.length - 1),
  repeatedTimestamps: blocks
    .slice(1)
    .filter((b, i) => b.timestamp === blocks[i].timestamp).length,
  clockDecision:
    "Virtual block clock; 300 milliseconds per block, immutable per match. Client timestamps never backdate inputs.",
  transactionBenchmark:
    "NOT MEASURED. Run scripts/benchmark.ts with a funded testnet account after contract deployment.",
  blocks,
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/network-spike.json",
  JSON.stringify(
    report,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ),
);
console.log(JSON.stringify({ ...report, blocks: undefined }, null, 2));
