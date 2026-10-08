import assert from 'node:assert/strict';

/** Evaluation may use a healthy subset; disabled arenas cannot block it. This
 * deliberately proves no advertised capacity or full release qualification. */
export function evaluationReadiness(rows: readonly {
  app: string; epoch: bigint; enabled: boolean; batches: bigint; checkpoint: bigint;
  health?: {stage: string; epoch: string; observedAt: number};
}[], now: number, initialize = false) {
  assert(rows.length > 0, 'No registered arenas');
  assert.equal(new Set(rows.map(r => r.app.toLowerCase())).size, rows.length, 'Duplicate arena');
  const ready: string[] = [], excluded: string[] = [];
  for (const row of rows) {
    const published=row.batches > 0n && row.checkpoint === row.epoch;
    const live=row.health?.stage === 'available' && row.health.epoch === String(row.epoch)
      && Number.isFinite(row.health.observedAt) && now - row.health.observedAt >= 0
      && now - row.health.observedAt <= 15_000;
    if (!row.enabled && !(initialize && published && live)) { excluded.push(row.app); continue; }
    assert(published, 'Enabled arena has no matching published marker');
    assert(live, 'Enabled arena lacks fresh matching live health');
    ready.push(row.app);
  }
  assert(ready.length > 0, 'No admissible arena');
  return {ready, excluded, qualified: false as const};
}
