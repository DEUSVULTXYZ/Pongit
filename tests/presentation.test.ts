import test from "node:test";
import assert from "node:assert/strict";
import { initial, advance, next } from "../shared/physics";
import { acceptsSnapshot, previewPaddle, projectConfirmed } from "../web/lib/presentation";
import { notifyJob, waitJob } from "../web/lib/api";

test("late HTTP frames cannot overwrite a newer WebSocket state or reset the clock", () => {
  const current = { id: "9", head: 200n, version: 6n, clock: 3000000n };
  assert.equal(acceptsSnapshot(current, { ...current, head: 198n, clock: 2500000n }), false);
  assert.equal(acceptsSnapshot(current, { ...current, head: 201n, version: 5n }), false);
  assert.equal(acceptsSnapshot(current, current), false);
  assert.equal(acceptsSnapshot(current, { ...current, head: 201n, clock: 3300000n }), true);
  assert.equal(acceptsSnapshot(current, { ...current, id: "10", head: 150n, version: 1n }), true);
});
test("preview never invents paddle bounces or points while waiting for inclusion", () => {
  const state = initial(`0x${"00".repeat(32)}`);
  const impact = next(state);
  const preview = projectConfirmed(state, impact.at + 2000000n);
  assert.equal(preview.waiting, true);
  assert.equal(preview.state.scoreA + preview.state.scoreB, 0);
  assert.equal(preview.state.vx, state.vx);
  assert.equal(preview.state.t, impact.at - 1n);
  const included = advance(state, impact.at)[0];
  assert.ok(projectConfirmed(included, included.t + 10000n).state.t > preview.state.t);
});
test("key reversal moves from the current paddle rather than its old snapshot position", () => {
  const down = previewPaddle(288, 1, 50);
  assert.equal(down, 297);
  assert.equal(previewPaddle(down, -1, 16), 294.12);
  assert.equal(previewPaddle(down, 0, 16), down);
  assert.equal(previewPaddle(49, -1, 50), 48);
  assert.equal(previewPaddle(527, 1, 50), 528);
});
test("a WebSocket receipt wins over a slow HTTP job poll, including receipts arriving before the waiter", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Promise(() => {});
  try {
    const waiter = waitJob("ws-during-poll");
    notifyJob({ id: "ws-during-poll", status: "succeeded", timing: { totalMs: 250 } });
    assert.equal((await waiter).timing.totalMs, 250);
    notifyJob({ id: "ws-before-poll", status: "succeeded" });
    assert.equal((await waitJob("ws-before-poll")).status, "succeeded");
  } finally { globalThis.fetch = original; }
});
