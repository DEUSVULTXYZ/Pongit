import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isAddress, type Hex} from 'viem';
import {validateAgentPoolManifest, type AgentPoolManifest} from '../../../shared/agent-pool';

const commonFields = ['hub', 'pool', 'catalog', 'tournaments', 'ratings', 'qualifications', 'family', 'challenges'] as const;
/** Fail closed on mismatched deployment metadata before loading a signing key.
 * A reviewed manifest may be closed again without disabling result recovery. */
export function validateSeriesRecord(record: any, protectedApps: readonly string[], manifest?: AgentPoolManifest, evidence?: string) {
  assert(protectedApps.length && protectedApps.every(x => isAddress(x)), 'List protected human applications');
  assert(record?.phase === 'deployed-closed', 'Unsupported series deployment record');
  assert(Array.isArray(record.arenas) && record.arenas.length >= 2 && record.arenas.length <= 16, 'Arena pool bounds');
  const seen = new Set<string>(), forbidden = new Set(protectedApps.map(x => x.toLowerCase()));
  for (const field of commonFields) {
    assert(isAddress(record.common?.[field]) && BigInt(record.common[field]) !== 0n, 'Invalid common contract');
    forbidden.add(record.common[field].toLowerCase());
  }
  for (const arena of record.arenas) {
    assert(isAddress(arena.app) && !forbidden.has(arena.app.toLowerCase()) && !seen.has(arena.app.toLowerCase()), 'Protected or repeated arena');
    assert(/^0x[\da-f]{64}$/i.test(arena.runtimeHash), 'Missing arena runtime identity'); seen.add(arena.app.toLowerCase());
  }
  assert(Array.isArray(record.bots) && record.bots.length === 8 && record.bots.every((b: any) => isAddress(b.agent)), 'Eight official bot references required');
  assert.equal(new Set(record.bots.map((b: any) => b.agent.toLowerCase())).size, 8, 'Official bot references must be distinct');
  if (manifest) {
    const m = validateAgentPoolManifest(manifest, protectedApps);
    assert(m.version === 3 && m.verifiedCapacity === 2 && m.qualificationEvidence && BigInt(m.qualificationEvidence) !== 0n, 'Reviewed capacity evidence required');
    assert.equal(m.qualificationEvidence.toLowerCase(), evidence?.toLowerCase(), 'Explicit release evidence does not match');
    for (const field of commonFields) assert.equal(record.common[field].toLowerCase(), m[field].toLowerCase(), 'Common deployment mismatch');
    assert.equal(record.arenas.length, m.arenas.length, 'Arena deployment mismatch');
    record.arenas.forEach((a: any, i: number) => {
      assert.equal(a.app.toLowerCase(), m.arenas[i].app.toLowerCase(), 'Arena order mismatch');
      assert.equal(a.runtimeHash.toLowerCase(), m.arenas[i].runtimeHash.toLowerCase(), 'Arena bytecode mismatch');
    });
    assert(!('engineKey' in record), 'Release metadata must not contain the engine key');
  }
}

export async function loadSeriesRuntime(role: 'engines' | 'keeper') {
  assert.equal(process.getuid?.(), 1000, 'Keep journal ownership');
  const prefix = process.env.PONG_AGENT_SERIES_PREFIX!;
  assert(/^agent-series-candidate-\d{8}(-[1-9]\d?)?$/.test(prefix), 'Stable operator journal prefix required');
  const released = process.env.PONG_AGENT_SERIES_RUNTIME === 'reviewed-release';
  const protectedApps = (process.env.PONG_HUMAN_APPS ?? '').split(',').filter(Boolean);
  const flag = role === 'engines' ? process.env.PONG_AGENT_SERIES_ENGINES : process.env.PONG_AGENT_SERIES_MAINTENANCE;
  assert.equal(flag, released ? 'reviewed-release' : role === 'engines' ? 'private-qualification' : 'authorized-private-testnet');
  const record = JSON.parse(await readFile(released ? '/metadata/series.json' : `/secrets/${prefix}.json`, 'utf8'));
  if (released) {
    const manifest = JSON.parse(await readFile('/metadata/manifest.json', 'utf8'));
    validateSeriesRecord(record, protectedApps, manifest, process.env.PONG_AGENT_POOL_RELEASE_EVIDENCE);
    if (role === 'engines') {
      const key = JSON.parse(await readFile('/run/pongit-agent-pool/engine.json', 'utf8')).privateKey;
      assert(/^0x[\da-f]{64}$/i.test(key), 'Invalid engine transport key'); record.engineKey = key as Hex;
    }
  } else validateSeriesRecord(record, protectedApps);
  return {record, prefix, protectedApps, stateFile: released ? `/state/${prefix}-maintenance.json` : `/secrets/${prefix}-maintenance.json`};
}
