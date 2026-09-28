// Close only the finished private trial. Preserve every published root and the
// original operator journal. No forced close, new opening or production write.
import assert from 'node:assert/strict';
import {readFile, writeFile, rename} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient, http, type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';

assert.equal(process.env.PONG_FIVE_RELEASE, 'finished-private-only');
assert.equal(process.getuid?.(), 1000);
const deadline = Date.parse(process.env.PONG_FIVE_RELEASE_DEADLINE ?? '');
assert(deadline > Date.now() && deadline < Date.now() + 80 * 60000);
const r = JSON.parse(await readFile('/secrets/deployment.json', 'utf8'));
assert(r.maxMatches === 5 && !r.continuation);
assert.equal(r.common.pool.toLowerCase(), '0x384914dc7195b22ad348b57ea2a617e1e8e6b9f3');
const audit = JSON.parse(await readFile('/evidence/five-canonical-1.json', 'utf8'));
assert(audit.complete && audit.pool === r.common.pool);
const backup = JSON.parse(await readFile('/backup/off-vps.json', 'utf8'));
assert(backup.verified && backup.files === 3);
const file = '/evidence/five-release-1.json';
const report: any = {startedAt: new Date().toISOString(), deadline, pool: r.common.pool, backup,
  arenas: [], passed: false, scope: 'Normal release of the seven completed private delegations. No new delegation, forced closure, changed deadline or production intervention.'};
await writeFile(file, JSON.stringify(report), {flag: 'wx'});
const save = async () => {
  await writeFile(file + '.next', JSON.stringify(report, (_, v) => typeof v === 'bigint' ? String(v) : v, 2));
  await rename(file + '.next', file);
};
const t = await chainTools(r.prefix + ':five-release-1', measuredFetch('monad'));
const finishMetrics = await agentMetrics('/diagnostics/reusable', 'release-qualification');
const db = new Pool({connectionString: process.env.AGENT_DATABASE_URL, max: 1});
const read = (address: Address, abi: any, functionName: string, args: any[] = []) =>
  t.base.readContract({address, abi, functionName, args}) as Promise<any>;
const write = (id: string, method: string, app: Address) => retryOperatorContention(() =>
  t.write(id, r.common.pool, poolAbi, method, [app]));
const wait = () => new Promise(resolve => setTimeout(resolve, 15000));
try {
  for (const gate of ['admissions', 'publicAdmissions']) assert.equal(await read(r.common.pool, poolAbi, gate), false);
  for (let lane = 0; lane < 5; lane++) assert.equal((await read(r.common.pool, poolAbi, 'laneRecord', [lane])).ref.id, 0n);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM agent_pool.engine_jobs WHERE status='pending'")).rows[0].n, 0);
  // Verify every source before closing any. Stopped writers cannot add a match
  // between this read and closure; the private gates also stay closed.
  for (let index = 0; index < 7; index++) {
    const app = r.arenas[index].app, d = await readHubDelegation(t.base, r.common.hub, app);
    assert.equal(d.status, 1); assert.equal(d.epoch, index === 0 ? 2n : 1n); assert(d.batchIndex < 2000n);
    const root = await read(app, arenaAbi, 'resultCommitment'); assert(root[1] > 0);
    const live = createPublicClient({transport: http(`https://il-${app.slice(2, 18).toLowerCase()}.fly.dev`,
      {retryCount: 0, timeout: 5000, fetchFn: measuredFetch('interlude')})});
    assert.equal(await live.getChainId(), 4242);
    assert.deepEqual(await live.readContract({address: app, abi: arenaAbi, functionName: 'resultCommitment'}), root,
      'Unpublished result root must be recovered before closure');
    const [published] = await read(r.common.verifier, verifierAbi, 'currentRoot', [app, d.epoch]);
    assert.equal(published.count, root[1]); assert.equal(published.hash, root[2]);
    report.arenas.push({app, epoch: d.epoch, batches: d.batchIndex, root});
  }
  await save();
  for (const row of report.arenas) {
    assert(Date.now() < deadline);
    const receipt = await write('close-' + row.app, 'closeReusableArena', row.app);
    const d = await readHubDelegation(t.base, r.common.hub, row.app);
    assert.equal(d.status, 2); assert.equal(d.epoch, row.epoch);
    row.close = {hash: receipt.transactionHash, block: receipt.blockNumber, gasUsed: receipt.gasUsed};
    row.releaseAt = d.stakeUnlockAt; await save();
  }
  while (Date.now() < deadline && report.arenas.some((a: any) => !a.release)) {
    const block = await t.base.getBlock();
    for (const row of report.arenas.filter((a: any) => !a.release && a.releaseAt <= block.timestamp)) {
      const d = await readHubDelegation(t.base, r.common.hub, row.app, block.number);
      assert.equal(d.status, 2); assert.equal(d.epoch, row.epoch);
      const receipt = await write('release-' + row.app, 'releaseArena', row.app);
      assert.equal((await readHubDelegation(t.base, r.common.hub, row.app)).status, 0);
      assert.deepEqual(await read(r.common.verifier, verifierAbi, 'finalizedRoots', [row.app, row.epoch]),
        [row.root[2], row.root[1]], 'Finalized root differs from the published evidence');
      row.release = {hash: receipt.transactionHash, block: receipt.blockNumber, gasUsed: receipt.gasUsed};
      await save();
    }
    if (report.arenas.some((a: any) => !a.release)) await wait();
  }
  assert(report.arenas.length === 7 && report.arenas.every((a: any) => a.release), 'Original release deadline reached');
  report.passed = true;
} catch (e) {
  report.error = String((e as any)?.shortMessage ?? (e as Error).message).split('\n')[0]
    .replace(/0x[\da-f]{64,}/gi, '[omitted]').slice(0, 240);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); await save(); await db.end(); await t.close(); await finishMetrics();
  console.log(JSON.stringify({passed: report.passed, released: report.arenas.filter((a: any) => a.release).length, error: report.error}));
}
