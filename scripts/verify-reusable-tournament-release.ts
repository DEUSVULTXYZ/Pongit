// Read-only evidence after the existing keeper releases a completed tournament
// arena. This tool has no operator key, transaction signer or admission action.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createPublicClient, decodeFunctionData, http, type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {readHubDelegation} from '../shared/rooms-hub';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';

assert.equal(process.env.PONG_REUSABLE_RELEASE_EVIDENCE, 'read-only-private');
assert.equal(process.getuid?.(), 1000);
const m = validateAgentPoolManifest(JSON.parse(await readFile('/metadata/manifest.json', 'utf8')),
  (process.env.PONG_HUMAN_APPS ?? '').split(',').filter(Boolean));
assert.equal(m.version, 4); assert.equal(m.enabled, false);
const trial = JSON.parse(await readFile('/input/tournament.json', 'utf8'));
const closure = JSON.parse(await readFile('/input/closure.json', 'utf8'));
assert(trial.passed && closure.passed && trial.fixtures.length === 7);
assert.equal(trial.pool.toLowerCase(), m.pool.toLowerCase());
assert.equal(closure.pool.toLowerCase(), m.pool.toLowerCase());
const app = closure.app as Address, epoch = BigInt(closure.epoch);
assert(m.arenas.some(a => a.app.toLowerCase() === app.toLowerCase()));
const metrics = await agentMetrics('/diagnostics/reusable', 'release-evidence');
const base = createPublicClient({chain: monadTestnet,
  transport: http(process.env.RPC_URL, {retryCount: 0, timeout: 15000, fetchFn: measuredFetch('monad')})});
const report: any = {at: new Date().toISOString(), pool: m.pool, app, epoch: String(epoch), passed: false,
  scope: 'Canonical release, sealed root and seven final results. Other delegated arenas are observed on Monad only; this is not simultaneous gameplay, hosted readiness or uninterrupted renewal proof.'};
try {
  assert.equal(await base.getChainId(), 10143);
  const block = await base.getBlock();
  report.block = String(block.number); report.blockHash = block.hash;
  assert(block.timestamp >= BigInt(closure.releaseAt));
  const actions = JSON.parse(await readFile('/input/actions.json', 'utf8'));
  const release = actions.find((a: any) => a.action === 'releaseArena' && a.pool.toLowerCase() === m.pool.toLowerCase());
  assert(release, 'Keeper release receipt required');
  const receipt = await base.getTransactionReceipt({hash: release.hash});
  const tx = await base.getTransaction({hash: release.hash});
  assert.equal(receipt.status, 'success'); assert.equal(tx.to?.toLowerCase(), m.pool.toLowerCase());
  assert.equal(receipt.blockHash, tx.blockHash); assert(receipt.blockNumber <= block.number);
  const decoded = decodeFunctionData({abi: poolAbi, data: tx.input});
  assert.equal(decoded.functionName, 'releaseArena');
  assert.equal(String(decoded.args[0]).toLowerCase(), app.toLowerCase());
  assert.equal((await base.getBlock({blockNumber: receipt.blockNumber})).hash, receipt.blockHash);
  report.release = {hash: release.hash, block: String(receipt.blockNumber), gasUsed: String(receipt.gasUsed),
    chargedFeeWei: String(receipt.gasUsed * receipt.effectiveGasPrice)};
  const read = (address: Address, abi: any, functionName: string, args: readonly unknown[] = []) =>
    base.readContract({address, abi, functionName, args, blockNumber: block.number}) as Promise<any>;
  assert.equal(await read(m.pool, poolAbi, 'publicAdmissions'), false);
  assert.equal(await read(m.tournaments, bookAbi, 'admissions'), false);
  for (const lane of [0, 1]) assert.equal((await read(m.pool, poolAbi, 'laneRecord', [lane])).ref.id, 0n);
  const delegation = await readHubDelegation(base, m.hub, app, block.number);
  report.delegationStatus = delegation.status; assert.equal(delegation.status, 0);
  const root = await read(app, arenaAbi, 'resultCommitment');
  assert.equal(root[0], epoch); assert.equal(Number(root[1]), closure.resultCount); assert.equal(root[2], closure.root);
  const verifier = await read(m.pool, poolAbi, 'verifier') as Address;
  const sealed = await read(verifier, verifierAbi, 'finalizedRoots', [app, epoch]);
  assert.equal(sealed[0], closure.root); assert.equal(Number(sealed[1]), closure.resultCount);
  report.root = closure.root; report.resultCount = closure.resultCount;
  report.results = [];
  for (const row of trial.fixtures) {
    assert.equal(row.app.toLowerCase(), app.toLowerCase()); assert.equal(row.epoch, String(epoch));
    const fixture = await read(m.tournaments, bookAbi, 'fixture', [1n, row.index]);
    assert(fixture.resolved); assert.equal(fixture.ref.arena.toLowerCase(), app.toLowerCase());
    assert.equal(String(fixture.ref.id), row.id); assert.equal(fixture.ref.epoch, epoch);
    assert((await read(m.pool, poolAbi, 'record', [fixture.ref])).captured);
    const result = await read(m.pool, poolAbi, 'result', [fixture.ref]);
    assert.equal(result.hash, row.result.hash); assert.equal(result.finality, true);
    report.results.push({id: row.id, hash: result.hash, finality: result.finality});
  }
  report.otherDelegations = [];
  for (const other of m.arenas.filter(a => a.app.toLowerCase() !== app.toLowerCase())) {
    const d = await readHubDelegation(base, m.hub, other.app, block.number);
    report.otherDelegations.push({app: other.app, status: d.status, epoch: String(d.epoch), expiresAt: String(d.expiresAt)});
    assert.equal(d.status, 1);
  }
  assert.equal((await base.getBlock({blockNumber: block.number})).hash, block.hash);
  report.passed = true;
} catch (e) {
  report.error = String((e as any).shortMessage ?? (e as Error).message).split('\n')[0]
    .replace(/0x[\da-f]{90,}/gi, '[omitted]').slice(0, 220);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); await metrics();
  await writeFile('/diagnostics/reusable/tournament-first-classic-release.json', JSON.stringify(report, null, 2), {flag: 'wx', mode: 0o600});
  console.log(JSON.stringify(report));
}
