// Read-only cumulative hosted coverage. This is not a final unchanged soak.
// Never exports the deployment's engine key or private controller journals.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient, http, keccak256, type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {validateSeriesRecord} from '../relayer/src/agents/series-runtime';
import {agentSeriesPoolAbi as poolAbi} from '../shared/abi-AgentSeriesPool';
import {seriesAgentArenaAbi as arenaAbi} from '../shared/abi-SeriesAgentArena';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';

assert.equal(process.env.PONG_SERIES_COVERAGE, 'read-only-private');
const source = JSON.parse(await readFile(process.env.PONG_AGENT_SERIES_DEPLOYMENT!, 'utf8'));
validateSeriesRecord(source, (process.env.PONG_HUMAN_APPS ?? '').split(',').filter(Boolean));
let next = 0, lane: Promise<unknown> = Promise.resolve();
const pacedFetch: typeof fetch = (input, init) => {
  const work = lane.then(async () => {
    await new Promise(r => setTimeout(r, Math.max(0, next - Date.now())));
    next = Date.now() + 400;
    return fetch(input, init);
  });
  lane = work.catch(() => {});
  return work;
};
const base = createPublicClient({chain: monadTestnet, batch: {multicall: {wait: 20, batchSize: 8192}},
  transport: http(process.env.RPC_URL, {retryCount: 0, timeout: 12000, fetchFn: pacedFetch})});
const db = new Pool({connectionString: process.env.AGENT_DATABASE_URL, max: 1,
  options: '-c default_transaction_read_only=on -c statement_timeout=10000'});
try {
  assert.equal(await base.getChainId(), 10143);
  const block = await base.getBlock();
  const read = (address: Address, abi: any, functionName: string, args: any[] = []) =>
    base.readContract({address, abi, functionName, args, blockNumber: block.number}) as Promise<any>;
  const apps = source.arenas.map((a: any) => a.app.toLowerCase());
  for (const arena of source.arenas) {
    const code = await base.getCode({address: arena.app, blockNumber: block.number});
    assert(code && keccak256(code) === arena.runtimeHash, 'Arena bytecode changed');
  }
  const observations = (await db.query(`SELECT app,epoch::text,match_id::text,mode,phase,
    score_a,score_b,effects,resets,first_at,last_at FROM agent_pool.observations
    WHERE app=ANY($1) ORDER BY first_at`, [apps])).rows;
  assert(observations.length <= 2048, 'Page a larger coverage interval explicitly');
  const matches: any[] = [], included = new Set<number>();
  // Sequential match groups keep public RPC pressure bounded. Reads within
  // each group share the pinned block and may be combined by multicall.
  for (const o of observations) {
    const id = BigInt(o.match_id), epoch = BigInt(o.epoch);
    const record = await read(source.common.pool, poolAbi, 'record', [id]);
    assert.equal(record.ref.arena.toLowerCase(), o.app);
    assert.equal(record.ref.epoch, epoch);
    assert.equal(record.ref.chainId, 10143n);
    const [binding, [published], captured] = await Promise.all([
      read(o.app, arenaAbi, 'bindingFor', [id]), read(o.app, arenaAbi, 'resultFor', [id]),
      record.captured ? read(source.common.pool, poolAbi, 'result', [record.ref]) : null,
    ]);
    assert.equal(binding.id, id); assert.equal(binding.epoch, epoch);
    assert.equal(binding.mode, o.mode);
    const consistent = !!captured && captured.hash === published.hash && captured.status === 3
      && captured.status === o.phase && captured.scoreA === o.score_a && captured.scoreB === o.score_b;
    const usable = consistent && o.resets === 0;
    for (const effect of o.effects) {
      assert(Number.isInteger(effect) && effect >= 1 && effect <= 24, 'Unknown effect');
      if (usable) included.add(effect);
    }
    matches.push({ref: record.ref, mode: o.mode, scores: [o.score_a, o.score_b],
      publishedHash: captured?.hash ?? null, finality: captured?.finality ?? false,
      consistent, resets: o.resets, usedForCoverage: usable, effects: o.effects,
      firstObservedAt: o.first_at, lastObservedAt: o.last_at});
  }
  const bots = await Promise.all(source.bots.map(async (bot: any) => {
    const identity = await read(source.common.catalog, catalogAbi, 'identity', [bot.agent]);
    assert(identity.house, 'Official identity must be registry verified');
    return {agent: bot.agent, qualifiedModes: identity.qualified};
  }));
  assert.equal((await base.getBlock({blockNumber: block.number})).hash, block.hash, 'Reorganized evidence');
  const effects = [...included].sort((a, b) => a - b);
  const missing = Array.from({length: 24}, (_, i) => i + 1).filter(id => !included.has(id));
  const report = {at: new Date().toISOString(), block: block.number, blockHash: block.hash,
    pool: source.common.pool, scope: 'Cumulative hosted observations on matching published completed games without observer resets. Not unchanged-build, all-combinations, rendering or 24-hour qualification.',
    bots, matches, effects, missing, allEffectsObserved: missing.length === 0,
    allOfficialBotsQualified: bots.every((b: any) => b.qualifiedModes === 3), publicOpeningAuthorized: false};
  await writeFile(process.env.PONG_AGENT_COVERAGE_REPORT!, JSON.stringify(report, (_, v) => typeof v === 'bigint' ? String(v) : v, 2));
  console.log(JSON.stringify({at: report.at, matches: matches.length, used: matches.filter(m => m.usedForCoverage).length,
    effects, missing, allOfficialBotsQualified: report.allOfficialBotsQualified, publicOpeningAuthorized: false}));
} finally { await db.end(); }
