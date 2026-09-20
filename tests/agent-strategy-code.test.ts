import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStrategyRuntime} from '../shared/agent-strategy-code';

test('immutable strategy preflight distinguishes PUSH data from forbidden executable instructions', () => {
  validateStrategyRuntime('0x6354f1a2ff5000');
  for (const code of ['0x54', '0x55', '0xf1', '0x00a2', '0x0033', '0x5c', '0x40'] as const)
    assert.throws(() => validateStrategyRuntime(code), /forbidden opcode/);
});
test('strategy metadata is scanned, and malformed or delegated-wallet runtime is rejected', () => {
  assert.throws(() => validateStrategyRuntime('0x600000a2'), /metadata is also checked/);
  assert.throws(() => validateStrategyRuntime('0x7f00'), /truncated PUSH/);
  assert.throws(() => validateStrategyRuntime('0xef010000'), /delegated wallet/);
  assert.throws(() => validateStrategyRuntime(undefined), /Deploy/);
  assert.throws(() => validateStrategyRuntime('0x'), /Deploy/);
});
