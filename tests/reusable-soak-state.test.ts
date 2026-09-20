import test from 'node:test';
import assert from 'node:assert/strict';
import {publishedReusableIdle} from '../relayer/src/agents/reusable-soak-state';
const empty = () => ({status: 1, epoch: 2n, expires: 1000n, now: 1n, resultEpoch: 2n, resultCount: 0,
  prior: false, captured: false, currentEpoch: 2n, currentId: 0n, priorId: 0n, priorStatus: 0});
test('published idle predicate requires an open current epoch and its full seven-minute reserve', () => {
  assert.equal(publishedReusableIdle(empty()), true);
  for (const patch of [{status: 0}, {status: 2}, {resultEpoch: 1n}, {expires: 421n}, {resultCount: 65536}])
    assert.equal(publishedReusableIdle({...empty(), ...patch}), false);
});
test('prior result must be captured and match the current published slot', () => {
  const complete = {...empty(), prior: true, captured: true, resultCount: 1, currentId: 15n, priorId: 15n, priorStatus: 3};
  assert.equal(publishedReusableIdle(complete), true);
  assert.equal(publishedReusableIdle({...complete, priorStatus: 4}), true);
  for (const patch of [{captured: false}, {currentEpoch: 1n}, {priorId: 14n}, {priorStatus: 2}, {prior: false}])
    assert.equal(publishedReusableIdle({...complete, ...patch}), false);
});
test('an empty renewed slot retains the prior capture requirement', () => {
  assert.equal(publishedReusableIdle({...empty(), prior: true, captured: true}), true);
  assert.equal(publishedReusableIdle({...empty(), prior: true}), false);
});
