import { test } from "node:test";
import assert from "node:assert/strict";
import { BallTrail } from "../web/lib/ball-trail";
const point = (at:number, x=at, rally="match:0:0", clock=BigInt(at)) => ({at,x,y:100,clock,rally});
test("the trail is bounded and fades while the ball is stationary", () => {
  const trail = new BallTrail(); let samples:any[]=[];
  for(let t=0;t<1000;t++) samples=trail.sample(point(t),true);
  assert(samples.length<=20 && samples.length>1);
  samples=trail.sample(point(1150,999),true);
  assert.equal(samples.length,1);
});
test("points, seeks and corrections never draw a streak across the court", () => {
  for(const next of [point(20,20,"match:1:0"),point(20,20,"match:0:0",0n),point(20,700)]) {
    const trail=new BallTrail();trail.sample(point(10),true);
    assert.equal(trail.sample(next,true).length,1);
  }
});
test("disabled effects and tab resets discard their previous history", () => {
  const trail=new BallTrail();trail.sample(point(10),true);
  assert.deepEqual(trail.sample(point(20),false),[]);
  trail.sample(point(30),true);trail.reset();
  assert.equal(trail.sample(point(40),true).length,1);
});
