import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSeriesRecord} from '../relayer/src/agents/series-runtime';
import type {AgentPoolManifest} from '../shared/agent-pool';
import {zeroHash, type Address} from 'viem';
const address = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Address;
function fixture() {
  const common = {hub: address(1), pool: address(2), catalog: address(3), tournaments: address(4), ratings: address(5), qualifications: address(6), family: address(7), challenges: address(8)};
  const arenas = [9, 10].map(n => ({app: address(n), runtimeHash: `0x${'a'.repeat(64)}` as const, node: `https://arena-${n}.example`}));
  const record: any = {phase: 'deployed-closed', common, arenas, bots: Array.from({length: 8}, (_, i) => ({agent: address(20 + i)}))};
  const evidence = `0x${'1'.repeat(64)}` as const;
  const manifest: AgentPoolManifest = {...common, arenas, version: 3, chainId: 10143, engineChainId: 4242, rulesVersion: 11,
    enabled: false, tournamentsEnabled: false, verifiedCapacity: 2, qualificationEvidence: evidence,
    durationSeconds: 300, overtimeSeconds: 60, intervalSeconds: 60, maxMatches: 2};
  return {record, manifest, evidence, humans: [address(100)]};
}
test('closed reviewed release still permits maintenance without opening admissions', () => {
  const f = fixture(); validateSeriesRecord(f.record, f.humans, f.manifest, f.evidence);
  assert.equal(f.manifest.enabled, false);
});
test('release refuses absent evidence, another pool or another arena runtime', () => {
  for (const mutation of ['evidence', 'pool', 'runtime', 'unqualified']) {
    const f = fixture();
    if (mutation === 'evidence') f.manifest.qualificationEvidence = zeroHash;
    if (mutation === 'pool') f.record.common.pool = address(101);
    if (mutation === 'runtime') f.record.arenas = [{...f.record.arenas[0], runtimeHash: zeroHash}, f.record.arenas[1]];
    if (mutation === 'unqualified') f.manifest.verifiedCapacity = 0;
    assert.throws(() => validateSeriesRecord(f.record, f.humans, f.manifest, f.evidence));
  }
});
test('shared release metadata cannot expose an engine key to the keeper or reader', () => {
  const f = fixture(); f.record.engineKey = 'deliberately-not-a-key';
  assert.throws(() => validateSeriesRecord(f.record, f.humans, f.manifest, f.evidence), /must not contain/);
});
test('private and released pools reject protected human arenas and duplicate identities', () => {
  const f = fixture(); assert.throws(() => validateSeriesRecord(f.record, [f.record.arenas[0].app]), /Protected/);
  f.record.bots[7] = f.record.bots[0]; assert.throws(() => validateSeriesRecord(f.record, f.humans), /distinct/);
});
