import test from "node:test";
import assert from "node:assert/strict";
import { initial, advance } from "../shared/physics-interlude";
import { next, SCALE } from "../shared/physics-v2";
import { projectConfirmed, projectLive } from "../web/lib/presentation";
import { zeroHash } from "viem";

test("Interlude keeps the ball moving through both paddle contacts while legacy rendering waits", () => {
  for (const direction of [-1n, 1n]) {
    const s = {...initial(zeroHash),x:(direction < 0 ? 48n : 976n)*SCALE,
      vx:direction*192n*SCALE,y:288n*SCALE,vy:96n*SCALE};
    const impact = next(s).at;
    const legacy = projectConfirmed(s,impact+100000n);
    assert.equal(legacy.waiting,true);
    assert.equal(legacy.state.vx,s.vx);
    let previous: ReturnType<typeof projectLive> | undefined;
    for (let ms=50;ms<=200;ms+=10) {
      const target=BigInt(ms)*1000n;
      const live=projectLive(s,target);
      assert.equal(live.waiting,false);
      assert.deepEqual(live.state,advance(s,target)[0]);
      assert.equal(live.state.vx,-s.vx*110n/100n);
      if(previous)assert.notEqual(live.state.x,previous.state.x);
      previous=live;
    }
    // Receiving the resolved collision must produce the very same trajectory.
    const confirmed=advance(s,impact+20000n)[0];
    assert.deepEqual(projectLive(confirmed,200000n),projectLive(s,200000n));
    assert.equal(s.vx,direction*192n*SCALE,"projection does not mutate the snapshot");
  }
});

test("a missed paddle crosses its plane but never invents a score, serve or winner", () => {
  const s={...initial(zeroHash),x:976n*SCALE,right:48n*SCALE};
  const plane=next(s).at;
  const miss=projectLive(s,plane+10000n);
  assert.equal(miss.waiting,false);assert(miss.state.x>984n*SCALE);
  const goal=projectLive(s,1000000n);
  assert.equal(goal.waiting,true);assert.equal(goal.state.scoreA,0);
  assert.equal(goal.state.scoreB,0);assert.equal(goal.state.finished,false);
  assert(goal.state.x>1024n*SCALE);
});

test("late direction corrections replace predicted collisions with the actual engine trajectory", () => {
  const s={...initial(zeroHash),x:976n*SCALE};
  assert.equal(projectLive(s,100000n).state.vx,-s.vx*110n/100n);
  const corrected={...s,right:48n*SCALE};
  assert.equal(projectLive(corrected,100000n).state.vx,s.vx);
  assert.equal(projectLive(corrected,100000n).state.scoreA,0);
  const terminal={...s,finished:true,scoreA:7};
  assert.deepEqual(projectLive(terminal,1000000n).state,terminal);
});

test("live preview follows an elapsed wall bounce and moving paddle with identical rounding", () => {
  const s={...initial(zeroHash),x:950n*SCALE,y:570n*SCALE,right:528n*SCALE,rightDir:-1};
  for(let t=0n;t<500000n;t+=12345n) {
    const live=projectLive(s,t),actual=advance(s,t)[0];
    if(actual.scoreA===0&&actual.scoreB===0)assert.deepEqual(live.state,actual);
    assert.equal(live.state.scoreA,0);assert.equal(live.state.scoreB,0);
  }
});
