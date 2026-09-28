// Read-only proof after the sole bounded lifecycle worker has exited.
// No operator key or transaction submission is part of this verifier.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createPublicClient, http, formatEther} from 'viem';
import {monadTestnet} from 'viem/chains';
import {readHubDelegation} from '../shared/rooms-hub';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {reusableAgentPoolAbi} from '../shared/abi-ReusableAgentPool';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';

assert.equal(process.env.PONG_FIVE_RELEASE_AUDIT, 'private-read-only');
const manifest = validateAgentPoolManifest(JSON.parse(await readFile('/metadata/manifest.json', 'utf8')));
assert(!manifest.enabled && manifest.pool.toLowerCase() === '0x384914dc7195b22ad348b57ea2a617e1e8e6b9f3');
const prior = JSON.parse(await readFile('/evidence/five-release-1.json', 'utf8'));
assert(prior.passed && prior.arenas.length === 7 && Date.parse(prior.finishedAt) < prior.deadline);
const report: any = {startedAt: new Date().toISOString(), passed: false, arenas: [],
  scope: 'Canonical receipts, released delegations and finalized roots at one Monad block. No new opening, gameplay or production write.'};
const output = '/evidence/five-release-audit-1.json';
await writeFile(output, JSON.stringify(report), {flag: 'wx'});
const base = createPublicClient({chain: monadTestnet, batch: {multicall: true},
  transport: http(process.env.RPC_URL, {retryCount: 0, timeout: 10000})});
try {
  assert.equal(await base.getChainId(), 10143);
  const block = await base.getBlock();
  const verifier = await base.readContract({address: manifest.pool, abi: reusableAgentPoolAbi,
    functionName: 'verifier', blockNumber: block.number});
  for (const row of prior.arenas) {
    assert(manifest.arenas.some(a => a.app.toLowerCase() === row.app.toLowerCase()));
    const receipt = await base.getTransactionReceipt({hash: row.release.hash});
    assert.equal(receipt.status, 'success'); assert.equal(String(receipt.blockNumber), row.release.block);
    assert.equal(String(receipt.gasUsed), row.release.gasUsed);
    const included = await base.getBlock({blockNumber: receipt.blockNumber});
    assert.equal(included.hash, receipt.blockHash);
    const delegation = await readHubDelegation(base, manifest.hub, row.app, block.number);
    assert.equal(delegation.status, 0, 'Delegation is not released');
    const finalized = await base.readContract({address: verifier, abi: verifierAbi,
      functionName: 'finalizedRoots', args: [row.app, BigInt(row.epoch)], blockNumber: block.number});
    assert.deepEqual(finalized, [row.root[2], row.root[1]]);
    report.arenas.push({app: row.app, epoch: row.epoch, status: delegation.status, batches: row.batches,
      root: finalized, release: row.release, blockHash: receipt.blockHash,
      confirmations: block.number - receipt.blockNumber + 1n,
      feeMON: formatEther(receipt.gasUsed * receipt.effectiveGasPrice)});
  }
  for (const functionName of ['admissions', 'publicAdmissions'] as const)
    assert.equal(await base.readContract({address: manifest.pool, abi: reusableAgentPoolAbi, functionName,
      blockNumber: block.number}), false);
  for (let lane = 0; lane < 5; lane++) {
    const row = await base.readContract({address: manifest.pool, abi: reusableAgentPoolAbi,
      functionName: 'laneRecord', args: [lane], blockNumber: block.number});
    assert.equal(row.ref.id, 0n);
  }
  report.block = {number: block.number, hash: block.hash, timestamp: block.timestamp};
  report.publisher = {address: '0xB28E684815b095aB5Fb324214cfEa63d76F3d691',
    balanceMON: formatEther(await base.getBalance({address: '0xB28E684815b095aB5Fb324214cfEa63d76F3d691', blockNumber: block.number}))};
  report.passed = true;
} catch (e) {report.error = String((e as any)?.shortMessage ?? (e as Error).message).split('\n')[0]; process.exitCode = 1;}
finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, (_, value) => typeof value === 'bigint' ? String(value) : value, 2));
  console.log(JSON.stringify({passed: report.passed, released: report.arenas.length,
    publisher: report.publisher, error: report.error}));
}
