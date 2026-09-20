// Bounded PRIVATE hosted tournament experiment, not the continuous keeper or
// a reviewed publication budget. The persistent engines own all game nonces.
import assert from 'node:assert/strict';
import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {keccak256, type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {retryOperatorContention} from '../shared/operator-contention';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {validateReusableRecord} from '../relayer/src/agents/reusable-runtime';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';

assert.equal(process.getuid?.(), 1000);
assert.equal(process.env.PONG_REUSABLE_AGENT_TOURNAMENT_TEST, 'private-first-classic');
const r = JSON.parse(await readFile('/secrets/deployment.json', 'utf8'));
validateReusableRecord(r, (process.env.PONG_HUMAN_APPS ?? '').split(',').filter(Boolean));
assert.equal(r.arenas.length, 3);
const metrics = await agentMetrics('/diagnostics/reusable', 'qualification-tournament');
const t = await chainTools(r.prefix + ':first-classic-tournament', measuredFetch('monad'));
const db = new Pool({connectionString: process.env.AGENT_DATABASE_URL, max: 2});
const out = 'artifacts/reusable-candidate/tournament-first-classic.json';
await mkdir('artifacts/reusable-candidate', {recursive: true});
let report: any = {startedAt: new Date().toISOString(), pool: r.common.pool, tournament: '1',
  scope: 'One private Classic elimination tournament with actual hosted games and published results. Not a final budget, two-lane or 24-hour verdict.',
  fixtures: [], rotations: [], passed: false};
try { const old = JSON.parse(await readFile(out, 'utf8')); assert.equal(old.pool, report.pool); assert(!old.finishedAt, 'Preserve finished trial'); report = old; }
catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
const save = async () => { await writeFile(out + '.next', JSON.stringify(report, (_, v) => typeof v === 'bigint' ? String(v) : v, 2)); await rename(out + '.next', out); };
const write = (...args: Parameters<typeof t.write>) => retryOperatorContention(() => t.write(...args));
const read = (address: Address, abi: any, functionName: string, args: any[] = []) => t.base.readContract({address, abi, functionName, args}) as Promise<any>;
const wait = () => new Promise(resolve => setTimeout(resolve, 2500));
try {
  await save();
  assert.equal(await read(r.common.pool, poolAbi, 'publicAdmissions'), false);
  for (const arena of r.arenas) assert.equal(keccak256((await t.base.getCode({address: arena.app}))!).toLowerCase(), arena.runtimeHash.toLowerCase());
  const identities = await Promise.all(r.bots.map((bot: any) => read(r.common.catalog, catalogAbi, 'identity', [bot.agent])));
  assert(identities.every(x => x.qualified === 3), 'Eight already qualified bots required');
  const count = await read(r.common.tournaments, bookAbi, 'count');
  assert(count === 0n || count === 1n, 'Do not interfere with later tournaments');
  if (count === 1n) assert((await t.db.query('SELECT id FROM il_lifecycle_jobs WHERE id=$1', [r.prefix + ':first-classic-tournament:begin'])).rowCount, 'Unknown existing tournament');
  assert.equal((await read(r.common.pool, poolAbi, 'laneRecord', [1])).ref.id, 0n, 'No competing challenge qualification');
  if (!await read(r.common.pool, poolAbi, 'admissions')) await write('enable-private-pool', r.common.pool, poolAbi, 'setAdmissions', [true]);
  if (!await read(r.common.tournaments, bookAbi, 'admissions')) await write('enable-private-book', r.common.tournaments, bookAbi, 'setAdmissions', [true]);
  await write('begin', r.common.tournaments, bookAbi, 'begin');
  const deadline = Date.now() + 60 * 60_000;
  while (Date.now() < deadline) {
    const tournament = await read(r.common.tournaments, bookAbi, 'tournament', [1n]);
    assert.equal(tournament.mode, 0); assert.equal(tournament.league, false);
    assert.equal((await read(r.common.pool, poolAbi, 'laneRecord', [1])).ref.id, 0n, 'No competing challenge qualification');
    report.observedAt = new Date().toISOString(); report.status = tournament.status; await save();
    if (tournament.status === 3) {
      // A prior synchronization response may have been lost after execution.
      // Recover its exact immutable fixture result before writing the verdict.
      for (const row of report.fixtures) {
        const f = await read(r.common.tournaments, bookAbi, 'fixture', [1n, row.index]);
        assert.equal(String(f.ref.id), row.id); assert.equal(f.ref.arena.toLowerCase(), row.app.toLowerCase());
        assert(f.resolved && f.published.status === 3); row.resolved = true; row.result = f.published;
      }
      assert.equal(report.fixtures.filter((f: any) => f.resolved).length, 7, 'Every match must have an observed published result');
      report.champion = tournament.champion; report.passed = true; break;
    }
    assert(tournament.status === 1 || tournament.status === 2, 'Tournament requires correction review');
    if (tournament.status === 1) {
      await write('select-' + tournament.cursor + '-' + tournament.catalogRevision, r.common.tournaments, bookAbi, 'select', [1n, 32]);
      await wait(); continue;
    }
    const lane = await read(r.common.pool, poolAbi, 'laneRecord', [0]);
    if (lane.ref.id > 0n) {
      let known = report.fixtures.find((f: any) => f.id === String(lane.ref.id));
      if (!known) {
        assert.equal(lane.tournament, 1n);
        const operation = 'admit-' + lane.fixture;
        assert((await t.db.query('SELECT id FROM il_lifecycle_jobs WHERE id=$1', [r.prefix + ':first-classic-tournament:' + operation])).rowCount, 'Unjournaled fixture');
        const receipt = await write(operation, r.common.pool, poolAbi, 'admitTournament', [1n]);
        known = {index: lane.fixture, app: lane.ref.arena, epoch: String(lane.ref.epoch), id: String(lane.ref.id),
          admissionHash: receipt.transactionHash, recoveredAt: new Date().toISOString(), resolved: false};
        report.fixtures.push(known); await save();
      }
      const entry = await read(r.common.pool, poolAbi, 'record', [lane.ref]);
      known.captured = entry.captured; await save(); await wait(); continue;
    }
    for (const fixture of report.fixtures.filter((f: any) => !f.resolved)) {
      const f = await read(r.common.tournaments, bookAbi, 'fixture', [1n, fixture.index]);
      const entry = await read(r.common.pool, poolAbi, 'record', [f.ref]);
      assert(entry.captured, 'A freed lane must have a captured result');
      const result = await read(r.common.pool, poolAbi, 'result', [f.ref]);
      assert.equal(result.status, 3, 'Cancelled fixture remains failed evidence');
      fixture.result = result;
      await write('synchronize-' + fixture.index, r.common.tournaments, bookAbi, 'synchronize', [1n, fixture.index]);
      fixture.resolved = (await read(r.common.tournaments, bookAbi, 'fixture', [1n, fixture.index])).resolved;
      assert(fixture.resolved); await save();
    }
    const [index] = await read(r.common.tournaments, bookAbi, 'nextFixture', [1n]);
    if (index === 255) { await wait(); continue; }
    assert(index < 7);
    const block = await t.base.getBlock();
    const delegations = await Promise.all(r.arenas.map(async (a: any) => ({app: a.app, d: await readHubDelegation(t.base, r.common.hub, a.app, block.number)})));
    // This short diagnostic retires a used idle arena well before the actual
    // 4,264-batch release already observed. It does not claim a worst-case bound.
    let rotated = false;
    for (const arena of delegations) if (arena.d.status === 1 && arena.d.batchIndex >= 1500n) {
      const receipt = await write('rotate-' + arena.app + '-' + arena.d.epoch, r.common.pool, poolAbi, 'closeReusableArena', [arena.app]);
      report.rotations.push({app: arena.app, epoch: String(arena.d.epoch), batches: String(arena.d.batchIndex), hash: receipt.transactionHash});
      await save(); rotated = true; break;
    }
    if (rotated) continue;
    const active = delegations.filter(x => x.d.status === 1 && x.d.expiresAt > block.timestamp + 420n);
    assert(active.length, 'No actual hosted capacity; do not manufacture a budget or open more arenas');
    const health = (await db.query("SELECT app,detail FROM agent_pool.health WHERE stage='available' AND updated_at>now()-interval '15 seconds'")).rows;
    if (!active.every(a => health.some(h => h.app === a.app.toLowerCase() && String(h.detail.epoch) === String(a.d.epoch)))) { await wait(); continue; }
    const prior = report.fixtures.find((f: any) => f.index === index);
    assert(!prior, 'Do not double-admit a fixture');
    const receipt = await write('admit-' + index, r.common.pool, poolAbi, 'admitTournament', [1n]);
    const f = await read(r.common.tournaments, bookAbi, 'fixture', [1n, index]);
    assert(f.bound && f.ref.id > 0n, 'No match assigned');
    report.fixtures.push({index, app: f.ref.arena, epoch: String(f.ref.epoch), id: String(f.ref.id), admissionHash: receipt.transactionHash,
      admittedAt: new Date().toISOString(), resolved: false}); await save(); await wait();
  }
  assert(report.passed, 'Tournament did not complete within the bounded diagnostic');
  await write('stop-private-book-after-test', r.common.tournaments, bookAbi, 'setAdmissions', [false]);
} catch (e) {
  report.error = String((e as any).shortMessage ?? (e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi, '[omitted]').slice(0, 300); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); await save(); await db.end(); await metrics(); await t.close();
  console.log(JSON.stringify({passed: report.passed, error: report.error, file: out, completedFixtures: report.fixtures.filter((f: any) => f.resolved).length}));
}
