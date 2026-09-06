import "dotenv/config";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  encodeFunctionData,
  type Hex,
  type Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { json } from "../shared/protocol";
const rpc =
  process.env.ALCHEMY_RPC_URL ||
  process.env.RPC_URL ||
  "https://testnet-rpc.monad.xyz";
const client = createPublicClient({
  transport: http(rpc),
  pollingInterval: 150,
});
const chainId = await client.getChainId();
if (![10143, 31337].includes(chainId))
  throw new Error("Only test networks allowed");
const key = process.env.BENCHMARK_PRIVATE_KEY as Hex | undefined;
if (!key)
  throw new Error(
    "Set BENCHMARK_PRIVATE_KEY locally. No transaction benchmark has been performed.",
  );
const account = privateKeyToAccount(key);
const count = Number(process.env.BENCHMARK_TXS || 100),
  rate = Number(process.env.BENCHMARK_TPS || 5);
if (
  !Number.isInteger(count) ||
  count < 10 ||
  count > 1000 ||
  !Number.isFinite(rate) ||
  rate < 1 ||
  rate > 20
)
  throw new Error(
    "Use 10–1000 transactions and 1–20 TPS; respect provider rate limits.",
  );
const chain = defineChain({
  id: chainId,
  name: "Benchmark testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const wallet = createWalletClient({ account, chain, transport: http(rpc) });
const artifact = JSON.parse(
  await readFile(
    "contracts/out/BenchmarkProbe.sol/BenchmarkProbe.json",
    "utf8",
  ),
);
const abi = artifact.abi as Abi;
const gasPrice = await client.getGasPrice();
const gasLimit = BigInt(process.env.BENCHMARK_GAS_LIMIT || "200000");
if (gasLimit < 100000n || gasLimit > 500000n) throw new Error("Use a 100000-500000 gas limit");
const ceiling =
  gasLimit * gasPrice * 2n * BigInt(count) + 3000000n * gasPrice * 2n;
const maxSpend = parseEther(process.env.BENCHMARK_MAX_MON || "0.1");
if (
  ceiling > maxSpend ||
  (await client.getBalance({ address: account.address })) < ceiling
)
  throw new Error(
    `Benchmark needs a funded account and a budget above the conservative ceiling: ${ceiling} wei.`,
  );
const deploy = await wallet.deployContract({
  abi,
  bytecode: artifact.bytecode.object,
});
const deployment = await client.waitForTransactionReceipt({ hash: deploy });
const address = deployment.contractAddress!;
const nonce = await client.getTransactionCount({
  address: account.address,
  blockTag: "pending",
});
const observations = new Map<string, number>();
const sent = new Map<string, number>();
const stop = client.watchContractEvent({
  address,
  abi,
  eventName: "Transition",
  poll: true,
  pollingInterval: 150,
  fromBlock: deployment.blockNumber,
  onLogs: (logs) => {
    for (const log of logs)
      observations.set(log.transactionHash!, performance.now());
  },
});
try {
  const rows: {
    hash: Hex;
    seq: number;
    sentAt: number;
    receiptAt?: number;
    eventMs?: number;
    gasUsed?: bigint;
    gasLimit: bigint;
    gasPrice?: bigint;
    block?: bigint;
    index?: number;
    status?: string;
  }[] = [];
  const pending: Promise<void>[] = [];
  const started = performance.now();
  for (let seq = 1; seq <= count; seq++) {
    const target = started + ((seq - 1) * 1000) / rate;
    const delay = target - performance.now();
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    const raw = await wallet.signTransaction({
      to: address,
      data: encodeFunctionData({
        abi,
        functionName: "step",
        args: [BigInt(seq)],
      }),
      nonce: nonce + seq - 1,
      gas: gasLimit,
      maxFeePerGas: gasPrice * 2n,
      maxPriorityFeePerGas: 0n,
      type: "eip1559",
    });
    const before = performance.now();
    const hash = await client.sendRawTransaction({
      serializedTransaction: raw,
    });
    sent.set(hash, before);
    const row = {
      hash,
      seq,
      sentAt: before,
      gasLimit,
    } as (typeof rows)[number];
    rows.push(row);
    pending.push(
      client.waitForTransactionReceipt({ hash, timeout: 120000 }).then((r) => {
        row.receiptAt = performance.now();
        row.gasUsed = r.gasUsed;
        row.gasPrice = r.effectiveGasPrice;
        row.block = r.blockNumber;
        row.index = r.transactionIndex;
        row.status = r.status;
      }),
    );
  }
  await Promise.all(pending);
  for (let i = 0; i < 50 && observations.size < count; i++)
    await new Promise((r) => setTimeout(r, 150));
  for (const row of rows)
    if (observations.has(row.hash))
      row.eventMs = observations.get(row.hash)! - row.sentAt;
  const values = rows
    .flatMap((r) => (r.eventMs === undefined ? [] : [r.eventMs]))
    .sort((a, b) => a - b);
  const percentile = (p: number) =>
    values.length ? values[Math.ceil(values.length * p) - 1] : null;
  const ordered = [...rows]
    .sort((a, b) => Number(a.block! - b.block!) || a.index! - b.index!)
    .every((r, i) => r.seq === i + 1);
  const report = {
    network:
      chainId === 10143 ? "Monad testnet" : "LOCAL ANVIL — not Monad evidence",
    chainId,
    probe: address,
    count,
    targetTps: rate,
    observedEvents: values.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    nonceInclusionOrdered: ordered,
    succeeded: rows.filter((r) => r.status === "success").length,
    submissionToEventDefinition:
      "Monotonic clock before eth_sendRawTransaction until the Transition log reaches the independent event poller (150 ms polling overhead included).",
    observedCompletionTps:
      count / ((Math.max(...rows.map((r) => r.receiptAt!)) - started) / 1000),
    chargedTransitionWei: rows.reduce(
      (sum, r) =>
        sum + (chainId === 10143 ? r.gasLimit : r.gasUsed!) * r.gasPrice!,
      0n,
    ),
    matchExtrapolation:
      "Multiply median transition charge by measured transitions per match; this probe does not include signature verification, ELO, or market gas. Measure real match receipts separately.",
    gasLimitWarning:
      "Monad charges submitted gas limit; see gasLimit on each measured transition. Report gas used and charged gas limit separately.",
    measuredAt: new Date().toISOString(),
    rows,
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile(`artifacts/benchmark-${chainId}.json`, json(report));
  console.log(json({ ...report, rows: undefined }));
} finally {
  stop();
}
