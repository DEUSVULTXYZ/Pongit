// Read-only monitor for the multi-arena pool. It never grants public capacity,
// signs, triggers a game or loads the deployment record containing engine keys.
import assert from 'node:assert/strict';
import {readFile, writeFile, appendFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {Pool} from 'pg';
import {createPublicClient, http, zeroHash, keccak256, encodeAbiParameters, parseAbiParameters} from 'viem';
import {monadTestnet} from 'viem/chains';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {agentSeriesPoolAbi} from '../shared/abi-AgentSeriesPool';
import {seriesAgentArenaAbi} from '../shared/abi-SeriesAgentArena';
import {reusableAgentArenaAbi} from '../shared/abi-ReusableAgentArena';
import {reusableAgentPoolAbi} from '../shared/abi-ReusableAgentPool';
import {publishedReusableIdle} from '../relayer/src/agents/reusable-soak-state';
import {validateReusableBudget, reusableAdmissionBudget} from '../relayer/src/agents/reusable-budget';
import {readHubDelegation} from '../shared/rooms-hub';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {sourceClosure} from './agent-soak-rules';
import {newPoolQualification, recordPoolSample, poolQualificationVerdict, type PoolSample} from '../relayer/src/agents/pool-qualification';

assert.equal(process.env.PONG_SERIES_SOAK, 'read-only-private');
assert.equal(process.getuid?.(), 1000);
const manifestPath = process.env.PONG_AGENT_POOL_MANIFEST!;
const manifestBytes = await readFile(manifestPath);
const protectedApps = (process.env.PONG_HUMAN_APPS ?? '').split(',').filter(Boolean);
assert(protectedApps.length, 'Explicitly protect human deployments');
const manifest = validateAgentPoolManifest(JSON.parse(manifestBytes.toString()), protectedApps);
assert(manifest.version === 3 || manifest.version === 4);
const reusable = manifest.version === 4;
const poolAbi = reusable ? reusableAgentPoolAbi : agentSeriesPoolAbi;
const budgetPath = '/metadata/reusable-budget.json';
const budget = reusable ? validateReusableBudget(JSON.parse(await readFile(budgetPath, 'utf8')), manifest.arenas.map(a => a.runtimeHash)) : undefined;
assert.equal(manifest.enabled, false, 'Final qualification still takes place privately');
const durationMs = Number(process.env.PONG_SERIES_SOAK_HOURS ?? 24) * 3600000;
assert(Number.isFinite(durationMs) && durationMs >= 60000 && durationMs <= 90000000);
const api = new URL(process.env.PONG_SERIES_SOAK_API!);
assert(api.protocol === 'http:' && (reusable ? /^pongit-reusable-agents[1-9]\d?-reader-replays$/ : /^pongit-series[3-9]-reader-replays$/).test(api.hostname) && api.port === '4101');
assert(!api.username && !api.password && !api.search && !api.hash);
const directory = '/diagnostics/series-soak';
await mkdir(directory, {recursive: true, mode: 0o700});
const sources = JSON.parse(await readFile(process.env.PONG_SERIES_SOAK_SOURCES!, 'utf8')) as Record<string, {root: string; entries: string[]}>;
assert(Object.keys(sources).sort().join(',') === 'controllers,keeper,reader,sponsor', 'Every executing backend role needs its own mounted source');
for (const [role, value] of Object.entries(sources)) {
  assert.equal(value.root, `/sources/${role}`);
  assert(value.entries.length > 0 && value.entries.every(p => /^(scripts|relayer)\/[a-zA-Z0-9/_.-]+\.(ts|mjs)$/.test(p) && !p.includes('..')));
}
async function hashSources() {
  const prior = process.cwd(), hashes: Record<string, string> = {};
  try {
    const own = await sourceClosure(['scripts/agent-series-soak.ts']);
    assert.equal(own.unresolved.length, 0, 'Unresolved monitor source dependency');
    for (const path of [...own.paths, 'package-lock.json'])
      hashes[`monitor/${path}`] = createHash('sha256').update(await readFile(resolve(path))).digest('hex');
    for (const [role, value] of Object.entries(sources)) {
      process.chdir(value.root);
      const closure = await sourceClosure(value.entries);
      assert.equal(closure.unresolved.length, 0, `Unresolved ${role} source dependency`);
      for (const path of [...closure.paths, 'package-lock.json'])
        hashes[`${role}/${path}`] = createHash('sha256').update(await readFile(resolve(path))).digest('hex');
    }
    hashes.manifest = createHash('sha256').update(await readFile(manifestPath)).digest('hex');
    if (reusable) hashes.publicationBudget = createHash('sha256').update(await readFile(budgetPath)).digest('hex');
    return hashes;
  } finally { process.chdir(prior); }
}
const sourceHashes = await hashSources();
const db = new Pool({connectionString: process.env.AGENT_DATABASE_URL, max: 2,
  options: '-c default_transaction_read_only=on -c statement_timeout=8000'});
const metrics = await agentMetrics('/diagnostics/series', 'soak');
const base = createPublicClient({chain: monadTestnet, batch: {multicall: {wait: 20, batchSize: 8192}},
  transport: http(process.env.RPC_URL, {retryCount: 0, timeout: 8000, fetchFn: measuredFetch('monad')})});
assert.equal(await base.getChainId(), 10143);
if (reusable) for (const arena of manifest.arenas)
  assert.equal(keccak256((await base.getCode({address: arena.app}))!).toLowerCase(), arena.runtimeHash.toLowerCase(), 'Immutable arena code differs from the reviewed budget');
const started = Date.now(), state = newPoolQualification(started), file = `${directory}/series-${started}.json`;
const report = {startedAt: new Date(started).toISOString(), durationMs, pool: manifest.pool, sourceHashes,
  state, last: undefined as PoolSample | undefined, storage: [] as {at: number; bytes: string}[],
  scope: 'Actual published pool state, controller progress and isolated HTTP API. Reusable arenas do not prove provider admission capacity.',
  errors: [] as {at: number; code: string}[], observedChaosEffects: [] as number[],
  sourcesUnchanged: true, stopped: false, complete: false, verdict: {} as object};
await writeFile(file, JSON.stringify(report, null, 2), {mode: 0o600, flag: 'wx'});
let stopped = false, wake: (() => void) | undefined;
process.once('SIGTERM', () => { stopped = true; wake?.(); });
process.once('SIGINT', () => { stopped = true; wake?.(); });
const save = () => writeFile(file, JSON.stringify(report, null, 2));
async function sample(): Promise<PoolSample> {
  const at = Date.now(), block = await base.getBlock();
  const read = (address: `0x${string}`, abi: any, functionName: string, args: any[] = []) =>
    base.readContract({address, abi, functionName, args, blockNumber: block.number}) as Promise<any>;
  const [admissions, health, observations, pending, response] = await Promise.all([
    read(manifest.pool, poolAbi, 'admissions'),
    db.query('SELECT app,stage,detail,updated_at FROM agent_pool.health'),
    db.query('SELECT app,epoch,match_id,progress_at,effects FROM agent_pool.observations WHERE last_at>=to_timestamp($1/1000.0)', [started]),
    db.query("SELECT app,min(created_at) AS oldest FROM agent_pool.engine_jobs WHERE status='pending' GROUP BY app"),
    measuredFetch('pongit', 'soak.catalog')(api.origin + '/agents/catalog', {signal: AbortSignal.timeout(8000)}),
  ]);
  const body = response.ok ? await response.json() : null;
  const apiReadable = response.ok && Array.isArray(body?.items) && body.items.length >= 8;
  const observedEffects = new Set<number>(report.observedChaosEffects);
  for (const o of observations.rows) for (const id of o.effects) if (id >= 1 && id <= 24) observedEffects.add(id);
  report.observedChaosEffects = [...observedEffects].sort((a, b) => a - b);
  const lanes = reusable ? await Promise.all([0, 1].map(l => read(manifest.pool, poolAbi, 'laneRecord', [l]))) : [];
  const arenas = await Promise.all(manifest.arenas.map(async arena => {
    const hub = await readHubDelegation(base, manifest.hub, arena.app, block.number);
    let available: boolean, id: bigint;
    if (reusable) {
      const [root, current, priorKey] = await Promise.all([
        read(arena.app, reusableAgentArenaAbi, 'resultCommitment'),
        read(arena.app, reusableAgentArenaAbi, 'currentMatch'),
        read(manifest.pool, poolAbi, 'arenaMatch', [arena.app]),
      ]);
      const prior = priorKey !== zeroHash;
      const priorRef = {chainId: 10143n, arena: arena.app, epoch: BigInt(current[0]), id: BigInt(current[1])};
      const matchesPrior = priorKey === keccak256(encodeAbiParameters(parseAbiParameters('uint256,address,uint256,uint256'),
        [10143n, arena.app, priorRef.epoch, priorRef.id]));
      const entry = prior && current[1] && matchesPrior ? await read(manifest.pool, poolAbi, 'record', [priorRef]) : null;
      const published = entry?.captured ? await read(manifest.pool, poolAbi, 'result', [priorRef]) : null;
      // A freshly initialized epoch has no slot yet. The immutable pool's
      // openReusableArena requires its prior record captured before opening;
      // no other path opens this arena. A cleared slot with a nonempty result
      // root cannot use this invariant and is deliberately rejected.
      const freshlyOpened = BigInt(current[1]) === 0n && Number(root[1]) === 0 && BigInt(current[0]) === hub.epoch;
      available = publishedReusableIdle({status: hub.status, epoch: hub.epoch, expires: hub.expiresAt, now: block.timestamp,
        resultEpoch: BigInt(root[0]), resultCount: Number(root[1]), prior, captured: freshlyOpened || !!entry?.captured,
        currentEpoch: BigInt(current[0]), currentId: BigInt(current[1]), priorId: BigInt(entry?.ref?.id ?? 0), priorStatus: Number(published?.status ?? 0)});
      id = BigInt(lanes.find(l => l.ref.arena.toLowerCase() === arena.app.toLowerCase() && l.ref.epoch === hub.epoch)?.ref.id ?? 0);
    } else {
      [available, id] = await Promise.all([
        read(manifest.pool, poolAbi, 'available', [arena.app]),
        read(arena.app, seriesAgentArenaAbi, 'boundMatch').then(binding => BigInt(binding.id)),
      ]);
    }
    const app = arena.app.toLowerCase(), h = health.rows.find(x => x.app === app);
    const o = observations.rows.find(x => x.app === app && x.epoch === String(hub.epoch) && x.match_id === String(id));
    const p = pending.rows.find(x => x.app === app);
    return {app, epoch: String(hub.epoch), hubStatus: hub.status, expiresAt: Number(hub.expiresAt),
      available, batches: String(hub.batchIndex), stage: h?.stage ?? 'unobserved', healthAt: h ? Date.parse(h.updated_at) : 0,
      healthEpoch: h?.detail?.epoch === undefined ? null : String(h.detail.epoch),
      healthMatchId: h?.detail?.id === undefined ? null : String(h.detail.id),
      admissionReady: reusable && available && reusableAdmissionBudget(budget, hub.batchIndex, hub.expiresAt, block.timestamp),
      matchId: id ? String(id) : null, progressAt: o ? Date.parse(o.progress_at) : null,
      pendingCommandAgeMs: p ? Math.max(0, at - Date.parse(p.oldest)) : 0};
  }));
  // The runtime will not choose an idle arena until every selectable idle
  // candidate is healthy and budgeted. Do not invent availability from one.
  if (reusable && arenas.some(a => a.available && (!a.admissionReady || a.healthEpoch !== a.epoch || a.stage !== 'available'
    || at - a.healthAt > 15000 || a.healthAt > at + 2000 || a.pendingCommandAgeMs > 0)))
    for (const arena of arenas) arena.admissionReady = false;
  assert.equal((await base.getBlock({blockNumber: block.number})).hash, block.hash, 'Reorganized sample');
  return {at: Date.now(), blockTimestamp: Number(block.timestamp), admissions, apiReadable, arenas};
}
try {
  while (!stopped) {
    let next: PoolSample;
    try { next = await sample(); }
    catch {
      next = {at: Date.now(), blockTimestamp: 0, admissions: false, apiReadable: false, arenas: [], error: 'sample-unavailable'};
      if (report.errors.length < 200) report.errors.push({at: next.at, code: next.error!});
    }
    const view = recordPoolSample(state, next, report.last);
    report.last = next;
    await appendFile(file.replace(/\.json$/, '.ndjson'), JSON.stringify({sample: next, availability: view}) + '\n', {mode: 0o600});
    if (state.samples === 1 || state.samples % 40 === 0) {
      try {
        const size = await db.query('SELECT pg_database_size(current_database())::text AS bytes');
        report.storage.push({at: Date.now(), bytes: size.rows[0].bytes});
        if (JSON.stringify(await hashSources()) !== JSON.stringify(sourceHashes)) { report.sourcesUnchanged = false; stopped = true; }
      } catch { report.sourcesUnchanged = false; stopped = true; }
    }
    await save();
    if (Date.now() - started >= durationMs) break;
    await new Promise<void>(done => { const timer = setTimeout(done, 15000); wake = () => { clearTimeout(timer); done(); }; });
    wake = undefined;
  }
} finally {
  report.stopped = stopped;
  report.complete = !stopped && state.lastAt - started >= durationMs;
  try { report.sourcesUnchanged &&= JSON.stringify(await hashSources()) === JSON.stringify(sourceHashes); }
  catch { report.sourcesUnchanged = false; }
  report.verdict = poolQualificationVerdict(state, {last: report.last, stopped, sourcesUnchanged: report.sourcesUnchanged, durationMs});
  await save(); await db.end(); await metrics();
  console.log(JSON.stringify({file, complete: report.complete, verdict: report.verdict}));
}
