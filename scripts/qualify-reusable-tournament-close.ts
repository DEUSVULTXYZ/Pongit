// Close only the now-idle arena of the completed private first tournament.
// Other actual hosted arenas remain open. No new admission or renewal here.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient, keccak256, type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {engineTransport} from '../shared/engine-transport';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {validateReusableRecord} from '../relayer/src/agents/reusable-runtime';

assert.equal(process.env.PONG_REUSABLE_TOURNAMENT_CLOSE, 'private-published-only');
assert.equal(process.getuid?.(), 1000);
const r = JSON.parse(await readFile('/secrets/deployment.json', 'utf8'));
validateReusableRecord(r, (process.env.PONG_HUMAN_APPS ?? '').split(',').filter(Boolean));
const trial = JSON.parse(await readFile('/evidence/tournament.json', 'utf8'));
assert(trial.passed && trial.finishedAt && trial.pool.toLowerCase() === r.common.pool.toLowerCase());
assert.equal(trial.fixtures.length, 7);
const apps = [...new Set<string>(trial.fixtures.map((x: any) => x.app.toLowerCase()))];
assert.equal(apps.length, 1); const app = apps[0] as Address;
const arena = r.arenas.find((x: any) => x.app.toLowerCase() === app); assert(arena);
const t = await chainTools(r.prefix + ':first-classic-close', measuredFetch('monad'));
const db = new Pool({connectionString: process.env.AGENT_DATABASE_URL, max: 2});
const metrics = await agentMetrics('/diagnostics/reusable', 'qualification-close');
try {
  assert.equal(keccak256((await t.base.getCode({address: app}))!).toLowerCase(), arena.runtimeHash.toLowerCase());
  assert.equal(await t.base.readContract({address: r.common.pool, abi: poolAbi, functionName: 'publicAdmissions'}), false);
  assert.equal(await t.base.readContract({address: r.common.tournaments, abi: bookAbi, functionName: 'admissions'}), false);
  for (const lane of [0, 1]) assert.equal((await t.base.readContract({address: r.common.pool, abi: poolAbi, functionName: 'laneRecord', args: [lane]})).ref.id, 0n);
  for (const row of trial.fixtures) {
    const fixture = await t.base.readContract({address: r.common.tournaments, abi: bookAbi, functionName: 'fixture', args: [1n, row.index]});
    assert(fixture.resolved); assert.equal(fixture.ref.arena.toLowerCase(), app); assert.equal(String(fixture.ref.id), row.id);
    assert.equal(fixture.published.hash, row.result.hash);
    assert((await t.base.readContract({address: r.common.pool, abi: poolAbi, functionName: 'record', args: [fixture.ref]})).captured);
  }
  const before = await readHubDelegation(t.base, r.common.hub, app);
  assert(before.status === 1 || before.status === 2); assert.equal(String(before.epoch), trial.fixtures[0].epoch);
  const node = createPublicClient({transport: engineTransport(`https://il-${app.slice(2, 18)}.fly.dev`)});
  const engineRoot = await node.readContract({address: app, abi: arenaAbi, functionName: 'resultCommitment'});
  const publishedRoot = await t.base.readContract({address: app, abi: arenaAbi, functionName: 'resultCommitment'});
  assert.deepEqual(engineRoot, publishedRoot, 'Do not abandon an unpublished result');
  const others = [];
  for (const other of r.arenas.filter((x: any) => x.app.toLowerCase() !== app)) {
    const d = await readHubDelegation(t.base, r.common.hub, other.app);
    assert.equal(d.status, 1);
    const h = (await db.query("SELECT detail FROM agent_pool.health WHERE app=$1 AND stage='available' AND updated_at>now()-interval '20 seconds'", [other.app.toLowerCase()])).rows[0];
    assert(h && h.detail.epoch === String(d.epoch)); others.push({app: other.app, epoch: String(d.epoch)});
  }
  assert.equal(others.length, 2);
  const receipt = await retryOperatorContention(() => t.write('close-published-epoch-' + before.epoch, r.common.pool, poolAbi, 'closeReusableArena', [app]));
  const after = await readHubDelegation(t.base, r.common.hub, app); assert.equal(after.status, 2);
  const report = {at: new Date().toISOString(), pool: r.common.pool, app, epoch: String(after.epoch),
    batches: String(before.batchIndex), resultCount: Number(publishedRoot[1]), root: publishedRoot[2], transaction: receipt.transactionHash,
    releaseAt: String(after.stakeUnlockAt), otherHostedArenas: others, passed: true,
    scope: 'Published private tournament arena closed; two idle hosted arenas remain open. No simultaneous-game or uninterrupted-renewal claim.'};
  await writeFile('/diagnostics/reusable/tournament-first-classic-close.json', JSON.stringify(report, null, 2), {flag: 'wx', mode: 0o600});
  console.log(JSON.stringify(report));
} finally { await metrics(); await db.end(); await t.close(); }
