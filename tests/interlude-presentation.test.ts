import test from "node:test";
import assert from "node:assert/strict";
import { LivePaddle, LiveClock } from "../web/lib/live-paddle";

test('a temporary control outage blends the displayed paddle instead of resetting it',()=>{
 const p=new LivePaddle();let y=288;
 for(let i=0;i<10;i++)y=p.step(288,1,0,48,16,false,true).y;
 assert.ok(y>310);
 const paused=p.step(288,0,0,48,16,true,true).y;
 assert.ok(Math.abs(paused-y)<=2.88);assert.ok(paused>310);
 const resumed=p.step(290,1,0,48,16,false,true).y;
 assert.ok(resumed>=paused);
});

test("held input never rolls backwards across jittered acknowledgements", () => {
  for (const direction of [-1, 1]) {
    const paddle = new LivePaddle();
    let y = paddle.step(288, direction, 0, 48, 0, false, true).y;
    for (let i = 1; i < 180; i++) {
      const confirmed = Math.max(48, Math.min(528, 288 + direction * (i * 3 - (i % 9) * 2)));
      const next = paddle.step(confirmed, direction, direction, 48, 1000 / 60, false, i < 5).y;
      assert.ok((next - y) * direction >= -1e-9, `frame ${i}: ${y} -> ${next}`);
      assert.ok(Math.abs(next - y) <= 4.001);
      y = next;
    }
  }
});

test("reversal is immediate, release waits for its acknowledgement without continuing the old direction", () => {
  const paddle = new LivePaddle();
  let y = paddle.step(288, 0, 0, 48, 0, false, false).y;
  const down = paddle.step(288, 1, 0, 48, 16, false, true).y;
  assert.equal(down, y + 2.88);
  y = paddle.step(288, -1, 1, 48, 16, false, true).y;
  assert.equal(y, down - 2.88);
  for (let i = 0; i < 10; i++) assert.equal(paddle.step(270, 0, -1, 48, 16, false, true).y, y);
  let previousError = Math.abs(y - 286);
  for (let i = 0; i < 100; i++) {
    y = paddle.step(286, 0, 0, 48, 16, false, false).y;
    assert.ok(Math.abs(y - 286) <= previousError); previousError = Math.abs(y - 286);
  }
  assert.ok(previousError < 0.16);
});

test("preview is bounded, stale inputs stop extending it, and a new match resets the position", () => {
  const p = new LivePaddle();
  for (let i = 0; i < 1000; i++) assert.ok(p.step(288, 1, 0, 48, 16, false, true).y <= 399);
  for (let i = 0; i < 1000; i++) p.step(288, 1, 0, 48, 16, true, true);
  assert.ok(Math.abs(p.step(288, 1, 0, 48, 16, true, true).y - 288) < 0.16);
  p.reset(); assert.equal(p.step(50, 0, 0, 48, 0, false, false).y, 50);
});

test("presentation clock never rewinds when a later RPC response carries an earlier projection", () => {
  const clock = new LiveClock();
  assert.equal(clock.sample(100000n), 100000n);
  assert.equal(clock.sample(98000n), 100000n);
  assert.equal(clock.sample(101000n), 101000n);
  clock.reset(); assert.equal(clock.sample(0n), 0n);
});
