// Read-only, bounded evidence for the dedicated pool. Never serialize calldata,
// signed engine transactions, grants, configuration secrets or shared balances
// as costs attributable to PONGIT.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createPublicClient, http, decodeFunctionData, getAbiItem, type Hex} from 'viem';
import {monadTestnet} from 'viem/chains';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';

assert.equal(process.env.PONG_REUSABLE_PUBLICATION_EVIDENCE, 'read-only-private');
assert.equal(process.getuid?.(), 1000);
const m = validateAgentPoolManifest(JSON.parse(await readFile(process.env.PONG_AGENT_POOL_MANIFEST!, 'utf8')),
  (process.env.PONG_HUMAN_APPS ?? '').split(',').filter(Boolean));
assert.equal(m.version, 4); assert.equal(m.enabled, false);
const label = process.env.PONG_PUBLICATION_LABEL!; assert(/^[a-z0-9-]{1,50}$/.test(label));
const span = Number(process.env.PONG_PUBLICATION_BLOCKS ?? 300);
assert(Number.isSafeInteger(span) && span >= 1 && span <= 3000);
let lane: Promise<unknown> = Promise.resolve(), nextAt = 0;
const measured = measuredFetch('monad');
const paced: typeof fetch = (input, init) => {
  const job = lane.then(async () => {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, nextAt - Date.now())));
    nextAt = Date.now() + 400; return measured(input, init);
  }); lane = job.catch(() => {}); return job;
};
const base = createPublicClient({chain: monadTestnet, transport: http(process.env.RPC_URL, {retryCount: 0, timeout: 15000, fetchFn: paced})});
const finishMetrics = await agentMetrics('/diagnostics/reusable', 'publication-evidence');
const file = `/diagnostics/reusable/publication-${label}.json`;
await mkdir(dirname(file), {recursive: true});
const report: any = {at: new Date().toISOString(), pool: m.pool, transactions: [], complete: false,
  scope: 'Exact successful publication fees and payload sizes in a bounded canonical Monad window for the approved agent arenas only. Excludes unrelated publisher spending, reverted publication attempts, operator sponsorship and transfers.'};
await writeFile(file, JSON.stringify(report), {flag: 'wx', mode: 0o600});
const save = async () => { await writeFile(file + '.next', JSON.stringify(report, null, 2), {mode: 0o600}); await rename(file + '.next', file); };
try {
  assert.equal(await base.getChainId(), 10143);
  const end = await base.getBlock(), from = end.number - BigInt(span - 1), first = await base.getBlock({blockNumber: from});
  report.window = {from: String(from), to: String(end.number), endHash: end.hash, startUtc: new Date(Number(first.timestamp) * 1000).toISOString(), endUtc: new Date(Number(end.timestamp) * 1000).toISOString(), seconds: Number(end.timestamp - first.timestamp)};
  const logs = [];
  for (let at = from; at <= end.number; at += 99n)
    logs.push(...await base.getLogs({address: m.hub, event: getAbiItem({abi: hubAbi, name: 'Committed'}),
      args: {app: m.arenas.map(a => a.app)}, fromBlock: at, toBlock: at + 98n > end.number ? end.number : at + 98n}));
  report.commits = logs.length;
  const hashes = [...new Set(logs.map(x => x.transactionHash))]; assert(hashes.length <= 4000);
  for (const hash of hashes) {
    const receipt = await base.getTransactionReceipt({hash}), tx = await base.getTransaction({hash});
    assert.equal(receipt.status, 'success'); assert.equal(receipt.blockHash, tx.blockHash);
    assert.equal(tx.to?.toLowerCase(), m.hub.toLowerCase());
    const decoded = decodeFunctionData({abi: hubAbi, data: tx.input});
    const relevant = logs.filter(x => x.transactionHash === hash);
    assert(relevant.every(x => x.blockHash === receipt.blockHash));
    // Monad charges the transaction gas limit; retain both fields rather than
    // silently presenting EVM execution gas as the fee basis.
    report.transactions.push({hash, block: String(receipt.blockNumber), blockHash: receipt.blockHash,
      publisher: tx.from, method: decoded.functionName, calldataBytes: (tx.input.length - 2) / 2,
      gasLimit: String(tx.gas), gasUsed: String(receipt.gasUsed), effectiveGasPrice: String(receipt.effectiveGasPrice),
      chargedFeeWei: String(tx.gas * receipt.effectiveGasPrice),
      commits: relevant.map(x => ({app: x.args.app, batch: String(x.args.batchIndex)}))});
    await save();
  }
  assert.equal((await base.getBlock({blockNumber: end.number})).hash, end.hash, 'Window reorganized; preserve incomplete evidence');
  report.feeWei = report.transactions.reduce((sum: bigint, x: any) => sum + BigInt(x.chargedFeeWei), 0n).toString();
  report.maxCalldataBytes = Math.max(0, ...report.transactions.map((x: any) => x.calldataBytes));
  report.complete = true;
} catch (e) {
  report.error = String((e as any).shortMessage ?? (e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi, '[omitted]').slice(0, 220);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); await save(); await finishMetrics();
  console.log(JSON.stringify({file, complete: report.complete, commits: report.commits, transactions: report.transactions.length, feeWei: report.feeWei, error: report.error}));
}
