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
const gate = process.env.PONG_REUSABLE_AGENT_TOURNAMENT_TEST;
assert(gate === 'private-first-classic' || gate === 'private-selected-tournament');
const idText = process.env.PONG_REUSABLE_TOURNAMENT_ID ?? '1';
assert(/^[1-4]$/.test(idText), 'Only the four explicitly approved qualification tournaments');
const id = BigInt(idText), mode = Number((id - 1n) % 2n), league = id >= 3n;
assert(gate !== 'private-first-classic' || id === 1n);
const expectedFixtures = league ? 28 : 7;
const trial = id === 1n ? 'first-classic-tournament' : `tournament-${idText}`;
const allowSecondLane = process.env.PONG_REUSABLE_TOURNAMENT_PARALLEL === 'qualified-challenge';
const r = JSON.parse(await readFile('/secrets/deployment.json', 'utf8'));
validateReusableRecord(r, (process.env.PONG_HUMAN_APPS ?? '').split(',').filter(Boolean));
assert.equal(r.arenas.length, 3);
const metrics = await agentMetrics('/diagnostics/reusable', 'qualification-tournament');
const t = await chainTools(r.prefix + ':' + trial, measuredFetch('monad'));
const db = new Pool({connectionString: process.env.AGENT_DATABASE_URL, max: 2});
const originalOut = `artifacts/reusable-candidate/tournament-${id === 1n ? 'first-classic' : idText}.json`;
const attempt = process.env.PONG_REUSABLE_TOURNAMENT_ATTEMPT;
assert(!attempt || /^resume[1-9][0-9]*$/.test(attempt), 'Use a separate, explicit recovery report');
const out = attempt ? originalOut.replace(/\.json$/, `-${attempt}.json`) : originalOut;
await mkdir('artifacts/reusable-candidate', {recursive: true});
let report: any = {startedAt: new Date().toISOString(), pool: r.common.pool, tournament: idText, mode, league,
  scope: 'One private tournament with actual hosted games and published results. Not a final budget, two-lane or 24-hour verdict.',
  fixtures: [], rotations: [], passed: false};
if (attempt) {
  const original = JSON.parse(await readFile(originalOut, 'utf8'));
  assert.equal(original.pool, r.common.pool); assert.equal(original.tournament, idText);
  assert(original.finishedAt && original.passed === false, 'Only resume a preserved failed trial');
  report.resumedFrom = {file: originalOut, startedAt: original.startedAt, finishedAt: original.finishedAt, passed: false};
  report.scope += ' Separate recovery attempt; the original failure and elapsed time remain unchanged.';
}
try { const old = JSON.parse(await readFile(out, 'utf8')); assert.equal(old.pool, report.pool); assert.equal(old.tournament, idText); assert(!old.finishedAt, 'Preserve finished trial'); report = old; }
catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
const save = async () => { await writeFile(out + '.next', JSON.stringify(report, (_, v) => typeof v === 'bigint' ? String(v) : v, 2)); await rename(out + '.next', out); };
const write = (...args: Parameters<typeof t.write>) => retryOperatorContention(() => t.write(...args));
const read = (address: Address, abi: any, functionName: string, args: any[] = []) => t.base.readContract({address, abi, functionName, args}) as Promise<any>;
const wait = () => new Promise(resolve => setTimeout(resolve, 2500));
// Restarting the process must not extend a trial or reopen an expired one.
const deadline = Date.parse(report.startedAt) + (league ? 240 : 75) * 60_000;
try {
  await save();
  assert(Number.isFinite(deadline) && deadline > Date.now(), 'Original trial deadline expired');
  assert.equal(await read(r.common.pool, poolAbi, 'publicAdmissions'), false);
  for (const arena of r.arenas) assert.equal(keccak256((await t.base.getCode({address: arena.app}))!).toLowerCase(), arena.runtimeHash.toLowerCase());
  const identities = await Promise.all(r.bots.map((bot: any) => read(r.common.catalog, catalogAbi, 'identity', [bot.agent])));
  assert(identities.every(x => x.qualified === 3), 'Eight already qualified bots required');
  const count = await read(r.common.tournaments, bookAbi, 'count');
  assert(count === id - 1n || count === id, 'Do not skip or interfere with another tournament');
  if (count === id) assert((await t.db.query('SELECT id FROM il_lifecycle_jobs WHERE id=$1', [r.prefix + ':' + trial + ':begin'])).rowCount, 'Unknown existing tournament');
  if (count === id - 1n && id > 1n) {
    assert.equal((await read(r.common.tournaments, bookAbi, 'tournament', [id - 1n])).status, 3, 'Previous tournament must be complete');
    assert((await t.base.getBlock()).timestamp >= await read(r.common.tournaments, bookAbi, 'nextAt'), 'Respect the one-minute interval');
  }
  if (!allowSecondLane) assert.equal((await read(r.common.pool, poolAbi, 'laneRecord', [1])).ref.id, 0n, 'No competing challenge qualification');
  if (!await read(r.common.pool, poolAbi, 'admissions')) await write('enable-private-pool', r.common.pool, poolAbi, 'setAdmissions', [true]);
  if (!await read(r.common.tournaments, bookAbi, 'admissions')) await write('enable-private-book', r.common.tournaments, bookAbi, 'setAdmissions', [true]);
  await write('begin', r.common.tournaments, bookAbi, 'begin');
  // The persistent controller may have finished and captured a fixture while
  // this process was down. Recover it from the book and the original admission
  // operation even when lane 0 has already been freed.
  for (let index = 0; index < expectedFixtures; index++) {
    const f = await read(r.common.tournaments, bookAbi, 'fixture', [id, index]);
    if (!f.bound) continue;
    const known = report.fixtures.find((row: any) => row.index === index);
    if (known) {
      assert.equal(known.id, String(f.ref.id)); assert.equal(known.epoch, String(f.ref.epoch));
      assert.equal(known.app.toLowerCase(), f.ref.arena.toLowerCase()); continue;
    }
    const operation = 'admit-' + index;
    assert((await t.db.query('SELECT id FROM il_lifecycle_jobs WHERE id=$1', [r.prefix + ':' + trial + ':' + operation])).rowCount, 'Unjournaled bound fixture');
    const receipt = await write(operation, r.common.pool, poolAbi, 'admitTournament', [id]);
    report.fixtures.push({index, app: f.ref.arena, epoch: String(f.ref.epoch), id: String(f.ref.id),
      admissionHash: receipt.transactionHash, recoveredAt: new Date().toISOString(), resolved: false});
    await save();
  }
  while (Date.now() < deadline) {
    const tournament = await read(r.common.tournaments, bookAbi, 'tournament', [id]);
    assert.equal(tournament.mode, mode); assert.equal(tournament.league, league);
    if (!allowSecondLane) assert.equal((await read(r.common.pool, poolAbi, 'laneRecord', [1])).ref.id, 0n, 'No competing challenge qualification');
    report.observedAt = new Date().toISOString(); report.status = tournament.status; await save();
    if (tournament.status === 3) {
      // A prior synchronization response may have been lost after execution.
      // Recover its exact immutable fixture result before writing the verdict.
      for (const row of report.fixtures) {
        const f = await read(r.common.tournaments, bookAbi, 'fixture', [id, row.index]);
        assert.equal(String(f.ref.id), row.id); assert.equal(f.ref.arena.toLowerCase(), row.app.toLowerCase());
        assert.equal(String(f.ref.epoch), row.epoch);
        assert(f.resolved && f.published.status === 3);
        assert((await read(r.common.pool, poolAbi, 'record', [f.ref])).captured);
        row.captured = true; row.resolved = true; row.administrative = f.administrative; row.result = f.published;
      }
      assert.equal(new Set(report.fixtures.map((f: any) => f.index)).size, expectedFixtures);
      assert.equal(report.fixtures.filter((f: any) => f.resolved).length, expectedFixtures, 'Every match must have an observed published result');
      report.champion = tournament.champion;
      if (league) report.standings = await read(r.common.tournaments, bookAbi, 'standings', [id]);
      report.resultsVerified = true; break;
    }
    assert(tournament.status === 1 || tournament.status === 2, 'Tournament requires correction review');
    if (tournament.status === 1) {
      await write('select-' + tournament.cursor + '-' + tournament.catalogRevision, r.common.tournaments, bookAbi, 'select', [id, 32]);
      await wait(); continue;
    }
    const lane = await read(r.common.pool, poolAbi, 'laneRecord', [0]);
    if (lane.ref.id > 0n) {
      let known = report.fixtures.find((f: any) => f.id === String(lane.ref.id));
      if (!known) {
        assert.equal(lane.tournament, id);
        const operation = 'admit-' + lane.fixture;
        assert((await t.db.query('SELECT id FROM il_lifecycle_jobs WHERE id=$1', [r.prefix + ':' + trial + ':' + operation])).rowCount, 'Unjournaled fixture');
        const receipt = await write(operation, r.common.pool, poolAbi, 'admitTournament', [id]);
        known = {index: lane.fixture, app: lane.ref.arena, epoch: String(lane.ref.epoch), id: String(lane.ref.id),
          admissionHash: receipt.transactionHash, recoveredAt: new Date().toISOString(), resolved: false};
        report.fixtures.push(known); await save();
      }
      const entry = await read(r.common.pool, poolAbi, 'record', [lane.ref]);
      known.captured = entry.captured; await save(); await wait(); continue;
    }
    for (const fixture of report.fixtures.filter((f: any) => !f.resolved)) {
      const f = await read(r.common.tournaments, bookAbi, 'fixture', [id, fixture.index]);
      const entry = await read(r.common.pool, poolAbi, 'record', [f.ref]);
      assert(entry.captured, 'A freed lane must have a captured result');
      const result = await read(r.common.pool, poolAbi, 'result', [f.ref]);
      assert.equal(result.status, 3, 'Cancelled fixture remains failed evidence');
      fixture.result = result; fixture.captured = true;
      await write('synchronize-' + fixture.index, r.common.tournaments, bookAbi, 'synchronize', [id, fixture.index]);
      fixture.resolved = (await read(r.common.tournaments, bookAbi, 'fixture', [id, fixture.index])).resolved;
      assert(fixture.resolved); await save();
    }
    const [index] = await read(r.common.tournaments, bookAbi, 'nextFixture', [id]);
    if (index === 255) { await wait(); continue; }
    assert(index < expectedFixtures);
    const block = await t.base.getBlock();
    const delegations = await Promise.all(r.arenas.map(async (a: any) => ({app: a.app, d: await readHubDelegation(t.base, r.common.hub, a.app, block.number)})));
    // This short diagnostic retires a used idle arena well before the actual
    // 4,264-batch release already observed. It does not claim a worst-case bound.
    let rotated = false;
    const secondLane = await read(r.common.pool, poolAbi, 'laneRecord', [1]);
    for (const arena of delegations) if (arena.d.status === 1 && arena.d.batchIndex >= 1500n
      && !(secondLane.ref.id > 0n && secondLane.ref.arena.toLowerCase() === arena.app.toLowerCase())) {
      const receipt = await write('rotate-' + arena.app + '-' + arena.d.epoch, r.common.pool, poolAbi, 'closeReusableArena', [arena.app]);
      report.rotations.push({app: arena.app, epoch: String(arena.d.epoch), batches: String(arena.d.batchIndex), hash: receipt.transactionHash});
      await save(); rotated = true; break;
    }
    if (rotated) continue;
    const active = delegations.filter(x => x.d.status === 1 && x.d.expiresAt > block.timestamp + 420n
      && !(secondLane.ref.id > 0n && secondLane.ref.arena.toLowerCase() === x.app.toLowerCase()));
    if (!active.length) { report.waitingForArenaAt ??= new Date().toISOString(); await save(); await wait(); continue; }
    delete report.waitingForArenaAt;
    const health = (await db.query("SELECT app,detail FROM agent_pool.health WHERE stage='available' AND updated_at>now()-interval '15 seconds'")).rows;
    if (!active.every(a => health.some(h => h.app === a.app.toLowerCase() && String(h.detail.epoch) === String(a.d.epoch)))) { await wait(); continue; }
    const prior = report.fixtures.find((f: any) => f.index === index);
    assert(!prior, 'Do not double-admit a fixture');
    const receipt = await write('admit-' + index, r.common.pool, poolAbi, 'admitTournament', [id]);
    const f = await read(r.common.tournaments, bookAbi, 'fixture', [id, index]);
    assert(f.bound && f.ref.id > 0n, 'No match assigned');
    report.fixtures.push({index, app: f.ref.arena, epoch: String(f.ref.epoch), id: String(f.ref.id), admissionHash: receipt.transactionHash,
      admittedAt: new Date().toISOString(), resolved: false}); await save(); await wait();
  }
  assert(report.resultsVerified, 'Tournament did not complete within the bounded diagnostic');
  await write('stop-private-book-after-test', r.common.tournaments, bookAbi, 'setAdmissions', [false]);
  assert.equal(await read(r.common.tournaments, bookAbi, 'admissions'), false);
  report.passed = true;
} catch (e) {
  report.error = String((e as any).shortMessage ?? (e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi, '[omitted]').slice(0, 300); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); await save(); await db.end(); await metrics(); await t.close();
  console.log(JSON.stringify({passed: report.passed, error: report.error, file: out, completedFixtures: report.fixtures.filter((f: any) => f.resolved).length}));
}
