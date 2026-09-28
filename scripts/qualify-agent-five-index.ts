// Compare the isolated current index with the canonical contract and its actual
// replay retention. No admission or chain transaction is permitted here.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient, http} from 'viem';
import {monadTestnet} from 'viem/chains';
import {reusableAgentPoolAbi} from '../shared/abi-ReusableAgentPool';
import {validateAgentPoolManifest} from '../shared/agent-pool';

assert.equal(process.env.PONG_FIVE_INDEX, 'private-read-only');
const m = validateAgentPoolManifest(JSON.parse(await readFile('/metadata/manifest.json', 'utf8')));
assert(!m.enabled && m.pool.toLowerCase() === '0x384914dc7195b22ad348b57ea2a617e1e8e6b9f3');
const url = new URL(process.env.AGENT_DATABASE_URL!);
assert.equal(url.pathname, '/agent_five'); url.pathname = '/agent_five_indexer';
const db = new Pool({connectionString: url.href, max: 1, options: '-c default_transaction_read_only=on'});
const base = createPublicClient({chain: monadTestnet, batch: {multicall: {wait: 10, batchSize: 4096}},
  transport: http(process.env.RPC_URL, {retryCount: 0, timeout: 10000})});
const report: any = {startedAt: new Date().toISOString(), passed: false, matches: [],
  scope: 'Isolated index and actual canonical results. Existing production index and business data are not modified.'};
const attempt = process.env.PONG_FIVE_INDEX_ATTEMPT ?? '1'; assert(/^\d+$/.test(attempt));
const output = `/evidence/five-index-${attempt}.json`;
await writeFile(output, JSON.stringify(report), {flag: 'wx'});
try {
  assert.equal(await base.getChainId(), 10143);
  const block = await base.getBlock();
  const rows = (await db.query('SELECT * FROM indexer."Match" ORDER BY id')).rows;
  const recent = (await db.query('SELECT * FROM indexer."RecentReplays"')).rows;
  const metadata = (await db.query('SELECT * FROM indexer.chain_metadata')).rows;
  assert.equal(rows.length, 40); assert.equal(metadata.length, 1);
  const retained = new Set(recent.flatMap(row => row.matches));
  const ordered = (items: any[]) => items.sort((a, b) => b.endedAt.localeCompare(a.endedAt) || b.id.localeCompare(a.id));
  for (const player of recent) {
    const expected = ordered(rows.filter(r => r.played && [r.playerA, r.playerB].includes(player.id)))
      .slice(0, 3).map(r => r.id);
    assert.deepEqual(player.matches, expected, 'Retention differs from the three most recent actual results');
  }
  for (const row of rows) {
    const [chain, arena, epoch, id] = row.id.split(':');
    assert.equal(chain, '10143'); assert(m.arenas.some(a => a.app.toLowerCase() === arena));
    const ref = {chainId: 10143n, arena, epoch: BigInt(epoch), id: BigInt(id)};
    const read = (functionName: 'record' | 'result') => base.readContract({address: m.pool,
      abi: reusableAgentPoolAbi, functionName, args: [ref], blockNumber: block.number}) as Promise<any>;
    const [record, result] = await Promise.all([read('record'), read('result')]);
    assert(record.captured); assert([3, 4].includes(result.status)); assert.equal(row.status, result.status); assert.equal(row.rulesVersion, 15);
    assert.equal(row.playerA, record.a.toLowerCase()); assert.equal(row.playerB, record.b.toLowerCase());
    assert.equal(row.mode, result.mode); assert.equal(row.ranked, record.ranked);
    assert.equal(row.scoreA, result.scoreA); assert.equal(row.scoreB, result.scoreB);
    assert.equal(row.winner, result.winner.toLowerCase());
    assert.equal(row.played, result.status === 3 || BigInt(result.elapsedUs) > 0n);
    assert.equal(row.replayAvailability, !row.played ? 'not-played' : retained.has(row.id) ? 'available' : 'pruned');
    report.matches.push({ref, hash: result.hash, score: [result.scoreA, result.scoreB], retention: row.replayAvailability});
  }
  report.block = {number: block.number, hash: block.hash};
  report.index = metadata[0]; report.players = recent.length;
  report.retained = rows.filter(r => r.replayAvailability === 'available').length;
  report.passed = true;
} catch (e) {report.error = String((e as any)?.shortMessage ?? (e as Error).message).split('\n')[0]; process.exitCode = 1;}
finally {
  report.finishedAt = new Date().toISOString(); await db.end();
  await writeFile(output, JSON.stringify(report, (_, value) => typeof value === 'bigint' ? String(value) : value, 2));
  console.log(JSON.stringify({passed: report.passed, matches: report.matches.length, retained: report.retained, error: report.error}));
}
