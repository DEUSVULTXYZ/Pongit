// Read-only canonical audit after the bounded private drivers stop. A driver
// timeout stays failed even when its already admitted game later completes.
import assert from 'node:assert/strict';
import {readFile, writeFile, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';
import {createPublicClient, http, type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';

assert.equal(process.env.PONG_FIVE_CANONICAL, 'read-only-private');
assert.equal(process.getuid?.(), 1000);
const manifestBytes = await readFile('/metadata/manifest.json');
const protectedApps = (process.env.PONG_HUMAN_APPS ?? '').split(',').filter(Boolean);
assert(protectedApps.length);
const m = validateAgentPoolManifest(JSON.parse(manifestBytes.toString()), protectedApps);
assert(m.version === 5 && !m.enabled && m.maxMatches === 5);
const reportDirectory = '/evidence';
const input = JSON.parse(await readFile(`${reportDirectory}/five-tournament-2-attempt2.json`, 'utf8'));
assert(input.finishedAt && input.poolClosed && input.bookClosed && input.pool === m.pool);
const setup = JSON.parse(await readFile(`${reportDirectory}/five-community-setup-attempt3.json`, 'utf8'));
assert(setup.registered && setup.pool === m.pool);
const output = `${reportDirectory}/five-canonical-1.json`;
const report: any = {startedAt: new Date().toISOString(), complete: false,
  manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'), pool: m.pool,
  originalDriver: {startedAt: input.startedAt, finishedAt: input.finishedAt, deadline: input.deadline,
    passed: input.passed, error: input.error}, tournaments: [], community: [],
  scope: 'Canonical verification of two elimination tournaments and both community modes. Does not replace failed driver reports or qualify championships, final migration, capacity reserve or a 24-hour release.'};
await writeFile(output, JSON.stringify(report), {flag: 'wx', mode: 0o600});
const save = async () => {
  await writeFile(output + '.next', JSON.stringify(report, (_, v) => typeof v === 'bigint' ? String(v) : v, 2));
  await rename(output + '.next', output);
};
const finishMetrics = await agentMetrics('/diagnostics/reusable', 'canonical-qualification');
const db = new Pool({connectionString: process.env.AGENT_DATABASE_URL, max: 1,
  options: '-c default_transaction_read_only=on -c statement_timeout=8000'});
const base = createPublicClient({chain: monadTestnet, batch: {multicall: true},
  transport: http(process.env.RPC_URL, {retryCount: 0, timeout: 10000, fetchFn: measuredFetch('monad')})});
try {
  assert.equal(await base.getChainId(), 10143);
  const block = await base.getBlock();
  report.block = {number: block.number, hash: block.hash, timestamp: block.timestamp};
  const read = (address: Address, abi: any, functionName: string, args: any[] = []) =>
    base.readContract({address, abi, functionName, args, blockNumber: block.number}) as Promise<any>;
  assert.equal(await read(m.pool, poolAbi, 'admissions'), false);
  assert.equal(await read(m.tournaments, bookAbi, 'admissions'), false);
  for (const id of [1n, 2n]) {
    const tournament = await read(m.tournaments, bookAbi, 'tournament', [id]);
    assert.equal(tournament.status, 3); assert.equal(tournament.league, false);
    assert.equal(tournament.mode, Number(id - 1n));
    const row: any = {id, champion: tournament.champion, mode: tournament.mode, fixtures: []};
    for (let index = 0; index < 7; index++) {
      const fixture = await read(m.tournaments, bookAbi, 'fixture', [id, index]);
      assert(fixture.bound && fixture.resolved);
      assert(m.arenas.some(a => a.app.toLowerCase() === fixture.ref.arena.toLowerCase()));
      const [entry, result] = await Promise.all([
        read(m.pool, poolAbi, 'record', [fixture.ref]), read(m.pool, poolAbi, 'result', [fixture.ref]),
      ]);
      assert(entry.captured && entry.tournament === id && entry.fixture === index);
      assert.equal(result.status, 3); assert.equal(result.hash, fixture.published.hash);
      row.fixtures.push({index, ref: fixture.ref, hash: result.hash, scoreA: result.scoreA,
        scoreB: result.scoreB, elapsedUs: result.elapsedUs, administrative: fixture.administrative,
        finality: result.finality});
    }
    report.tournaments.push(row); await save();
  }
  assert.equal(input.community.matches.length, 2, 'Both real community trials must have been admitted');
  for (const trial of input.community.matches) {
    const [record, result] = await Promise.all([
      read(m.pool, poolAbi, 'record', [trial.ref]), read(m.pool, poolAbi, 'result', [trial.ref]),
    ]);
    assert(record.captured && result.status === 3);
    assert([record.a, record.b].some(a => a.toLowerCase() === setup.strategy.toLowerCase()));
    assert.equal(record.tournament, 0n);
    report.community.push({ref: trial.ref, hash: result.hash, mode: result.mode,
      scoreA: result.scoreA, scoreB: result.scoreB, elapsedUs: result.elapsedUs, finality: result.finality});
  }
  assert.deepEqual(report.community.map((v: any) => v.mode).sort(), [0, 1]);
  const identity = await read(m.catalog, catalogAbi, 'identity', [setup.strategy]);
  assert.equal(identity.qualified, 3); assert.equal(identity.creator.toLowerCase(), setup.creator.toLowerCase());
  report.communityIdentity = {address: setup.strategy, creator: identity.creator, qualified: identity.qualified};
  const effects = await db.query('SELECT DISTINCT unnest(effects) AS effect FROM agent_pool.observations WHERE mode=1 ORDER BY effect');
  report.observedEffects = effects.rows.map(r => Number(r.effect)).filter(x => x >= 1 && x <= 24);
  assert.deepEqual(report.observedEffects, Array.from({length: 24}, (_, i) => i + 1));
  const pending = await db.query("SELECT count(*)::int AS n FROM agent_pool.engine_jobs WHERE status='pending'");
  report.pendingCommands = pending.rows[0].n; assert.equal(report.pendingCommands, 0);
  for (let lane = 0; lane < 5; lane++) assert.equal((await read(m.pool, poolAbi, 'laneRecord', [lane])).ref.id, 0n);
  assert.equal((await base.getBlock({blockNumber: block.number})).hash, block.hash);
  report.complete = true;
} catch (e) {
  report.error = String((e as any)?.shortMessage ?? (e as Error).message).split('\n')[0]
    .replace(/0x[\da-f]{64,}/gi, '[omitted]').slice(0, 240);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); await save(); await db.end(); await finishMetrics();
  console.log(JSON.stringify({complete: report.complete, error: report.error,
    tournaments: report.tournaments.length, communityModes: report.community.length}));
}
