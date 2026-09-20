import test from 'node:test';
import assert from 'node:assert/strict';
import {poolAvailability, newPoolQualification, recordPoolSample, poolQualificationVerdict, type PoolSample} from '../relayer/src/agents/pool-qualification';
const at = 1789873000000;
const sample = (): PoolSample => ({at, blockTimestamp: at / 1000, admissions: true, apiReadable: true, arenas: [
  {app: 'a', epoch: '2', hubStatus: 1, expiresAt: at / 1000 + 3600, available: false, batches: '10',
    stage: 'playing', healthAt: at, matchId: '3', progressAt: at, pendingCommandAgeMs: 0},
]});
test('live process with two closing arenas is unavailable', () => {
  const s = sample(); s.arenas[0].hubStatus = 2; s.arenas.push({...s.arenas[0], app: 'b'});
  const v = poolAvailability(s); assert.equal(v.unavailable, true); assert.equal(v.closing, 2); assert.equal(v.progressing, 0);
});
test('fresh health cannot hide stalled physics, old epochs or pending commands', () => {
  for (const patch of [{progressAt: at - 11000}, {healthAt: at - 16000}, {expiresAt: at / 1000}, {pendingCommandAgeMs: 10000}, {progressAt: at + 3000}]) {
    const s = sample(); Object.assign(s.arenas[0], patch); assert.equal(poolAvailability(s).unavailable, true);
  }
});
test('an unused contract is potential reserve, not a confirmed second game', () => {
  const s = sample(); s.arenas.push({...s.arenas[0], app: 'b', hubStatus: 0, available: true});
  const v = poolAvailability(s); assert.equal(v.progressing, 1); assert.equal(v.reusable, 1);
  assert.equal(v.unavailable, false);
});
test('missed samples do not fabricate availability', () => {
  const state = newPoolQualification(at), s = sample(); recordPoolSample(state, s);
  const later = {...s, at: at + 120000}; recordPoolSample(state, later, s);
  assert.equal(state.measuredMs, 0); assert.equal(state.unknownMs, 120000);
  assert(poolQualificationVerdict(state, {last: later, stopped: false, sourcesUnchanged: true, durationMs: 86400000}).reasons.includes('sample-gaps'));
});
test('a renewal outage remains a failure even after service returns', () => {
  const state = newPoolQualification(at), s = sample(); s.arenas[0].hubStatus = 2; recordPoolSample(state, s);
  const next = sample(); next.at += 15000; next.arenas[0].epoch = '3'; recordPoolSample(state, next, s);
  const verdict = poolQualificationVerdict(state, {last: next, stopped: false, sourcesUnchanged: true, durationMs: 86400000});
  assert.equal(state.unavailableMs, 15000); assert(verdict.reasons.includes('global-interruption-during-renewal'));
  assert.equal(verdict.publicOpeningAuthorized, false);
});
test('an elapsed day alone does not qualify a stopped or changed run', () => {
  const state = newPoolQualification(at), s = sample(); state.lastAt += 86400000;
  const verdict = poolQualificationVerdict(state, {last: s, stopped: true, sourcesUnchanged: false, durationMs: 86400000});
  assert.equal(verdict.continuousServiceChecksPassed, false);
  assert(verdict.reasons.includes('monitor-stopped')); assert(verdict.reasons.includes('source-changed-or-unresolved'));
  assert(verdict.reasons.includes('renewal-not-observed')); assert(verdict.reasons.includes('two-simultaneous-games-not-observed'));
});
