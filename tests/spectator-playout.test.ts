import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zeroHash} from 'viem';
import {initial} from '../shared/physics-interlude';
import {SpectatorPlayout,visibleBall} from '../web/lib/spectator-playout';
const state=(ms:number)=>({...initial(zeroHash),t:BigInt(ms)*1000n,left:BigInt(100+ms/10)*1000000n});

test('spectator follows processed time smoothly between sparse observations, not an unprocessed engine deadline',()=>{
 const p=new SpectatorPlayout();p.push({state:state(0),at:0});p.push({state:state(1200),at:1200});
 let prior=0n;const times=new Set<bigint>();
 for(let now=1200;now<=2000;now+=16){const s=p.sample(now)!;assert(s.target>=prior);assert(s.target<=1200000n);
  assert(s.left>=100&&s.left<=220);times.add(s.target);prior=s.target;}
 assert(times.size>30,'Render between snapshots instead of repeating their frames');
});
test('duplicate HTTP observations cannot make a stalled game look freshly advancing',()=>{
 const p=new SpectatorPlayout();p.push({state:state(100),at:100});
 for(let at=200;at<10000;at+=500)p.push({state:state(100),at});
 const s=p.sample(10000)!;assert.equal(s.target,100000n);assert(s.stalled);
});
test('adaptive buffering never reverses time and a prolonged outage cannot invent progress',()=>{
 const p=new SpectatorPlayout();let prior=0n;
 for(const [ms,at] of [[0,0],[500,600],[1600,1700],[3000,4300],[3500,4500]]){
  p.push({state:state(ms),at});const s=p.sample(at)!;assert(s.target>=prior);assert(s.target<=BigInt(ms)*1000n);prior=s.target;
 }
 assert.equal(p.sample(50000)!.target,3500000n);assert(p.sample(50000)!.stalled);
});
test('a confirmed point, new match or engine reset discards old trajectories without inventing a result',()=>{
 const p=new SpectatorPlayout();p.push({state:state(1000),at:1000});
 const point={...state(1200),scoreA:1};p.push({state:point,at:1200});
 assert.equal(p.sample(1200)!.frame.state,point);assert.equal(p.sample(1200)!.target,point.t);
 const reset=state(100);p.push({state:reset,at:1400});assert.equal(p.sample(1400)!.target,reset.t);
 p.reset();assert.equal(p.sample(1500),null);
});
test('an unconfirmed goal stays visible at the edge and does not change the score',()=>{
 assert.deepEqual(visibleBall(1030,280),{x:1018,y:280});assert.deepEqual(visibleBall(-6,280),{x:6,y:280});
 assert.deepEqual(visibleBall(250,300),{x:250,y:300});
});
