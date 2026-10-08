import test from 'node:test';
import assert from 'node:assert/strict';
import {collisionIntegrity} from '../scripts/collision-integrity-metrics';
const pose=(at:number,x:number,collisions:any[]=[])=>({at,renderedUs:String(at*1000),rules:17,rally:'1',balls:[{id:1,x,y:200}],collisions});

test('Chaos974 Last Chance shield is a confirmed shield reflection, not an unconfirmed paddle hit',()=>{
 const hit={at:'18000',rally:1,ball:1,kind:8,x:'1008000012000000'};
 const frames=[pose(0,1003),pose(10,1007),pose(20,1005,[hit]),pose(30,1001,[hit])]
  .map((p,i)=>({...p,sourceVelocity:{vx:i<2?'211200000':'-211200000'}}));
 const r=collisionIntegrity(frames);assert.equal(r.unconfirmed.length,0);assert.equal(r.visiblePaddleBounces,0);
 assert.equal(r.shieldBounces.length,1);
 for(const mutation of [
  (h:any)=>h.ball=2,(h:any)=>h.rally=2,(h:any)=>h.kind=7,
  (h:any)=>h.at='500000',(h:any)=>h.x='984000000000000',
 ]){
  const altered=structuredClone(frames);for(const p of altered)for(const h of p.collisions)mutation(h);
  assert.equal(collisionIntegrity(altered).unconfirmed.length,1);
 }
 const predicted=structuredClone(frames);predicted[2].sourceVelocity.vx='211200000';
 assert.equal(collisionIntegrity(predicted).unconfirmed.length,1,'a painted reversal still needs matching live velocity');
});
test('a visible reflection without a live contact fails, even with smooth frames',()=>{
 const frames=[pose(0,50),pose(10,40),pose(20,42),pose(30,45)];
 assert.equal(collisionIntegrity(frames).unconfirmed.length,1);
 frames[3].collisions=[{at:'11000',rally:1,ball:1,kind:3}];
 assert.equal(collisionIntegrity(frames).unconfirmed.length,0);
 frames[3].collisions[0].ball=2;assert.equal(collisionIntegrity(frames).unconfirmed.length,1);
});
test('a held uncertain contact followed by a real miss invents no reflection',()=>{
 assert.equal(collisionIntegrity([pose(0,50),pose(10,40),pose(20,40),pose(30,35)]).visiblePaddleBounces,0);
});

test('mobile966 subpixel correction before contact remains visible in diagnostics, not a fictional hit',()=>{
 const frames=[pose(56355.9,62.692739613),pose(56372.9,62.147927929),pose(56389.4,62.221863038),pose(56405.8,53.015920393)]
  .map(p=>({...p,sourceVelocity:{vx:'-211200000'}}));
 const result=collisionIntegrity(frames);
 assert.equal(result.visiblePaddleBounces,0);assert.equal(result.subpixelCorrections.length,1);
 assert(Math.abs(result.subpixelCorrections[0].units-.073935109)<1e-6);
 for(const change of [
  (f:typeof frames)=>{f[2].balls[0].x=62.5;}, // material jump
  (f:typeof frames)=>{f[3].balls[0].x=63;}, // sustained outgoing motion
  (f:typeof frames)=>{for(const p of f)p.balls[0].x-=22;}, // at contact
  (f:typeof frames)=>{f[2].sourceVelocity.vx='211200000';},
 ]){
  const altered=structuredClone(frames);change(altered);
  assert.equal(collisionIntegrity(altered).unconfirmed.length,1);
 }
});

test('HTTP fallback requires the exact authoritative contact transition already used by the painted pose',()=>{
 const frames=[pose(0,50),pose(10,40),pose(20,42),pose(30,45)].map((p,i)=>({...p,
  sourceUs:i<2?'1000':'12000',sourceVelocity:{vx:i<2?'-192000000':'211200000',x:i<2?'50000000':'42000000',score:[0,0]}}));
 const snapshot=(at:number,t:string,seq:number,hitter:number,vx:string,x:string)=>({at,state:{t,vx,x,scoreA:0,scoreB:0},chaos:{physics:{
  t,score:{rally:1,a:0,b:0},collisionSequence:seq,balls:[{alive:true,lastHitter:hitter,vx,x:String(BigInt(x)*1000000n),trailRevision:0}],
 }}});
 const before=snapshot(0,'1000',4,1,'-192000000','50000000');
 // The diagnostic snapshot is collected immediately after this same paint.
 const after=snapshot(20.8,'12000',5,0,'211200000','42000000');
 assert.equal(collisionIntegrity(frames,[before,after]).unconfirmed.length,0);
 assert.equal(collisionIntegrity(frames,[before,after]).bounces[0].evidence,'live-contact-transition');
 for(const mutate of [
  (s:any)=>{s.at=26;},
  (s:any)=>{s.chaos.physics.collisionSequence=6;},
  (s:any)=>{s.chaos.physics.balls[0].lastHitter=1;},
  (s:any)=>{s.chaos.physics.score.rally=2;},
  (s:any)=>{s.chaos.physics.score.b=1;},
  (s:any)=>{s.chaos.physics.balls[0].alive=false;},
  (s:any)=>{s.chaos.physics.balls[0].trailRevision=1;},
  (s:any)=>{s.state.x='90000000';},
  (s:any)=>{s.chaos.physics.balls[0].vx='-211200000';},
 ]){
  const bad=structuredClone(after);mutate(bad);
  assert.equal(collisionIntegrity(frames,[before,bad]).unconfirmed.length,1);
 }
 assert.equal(collisionIntegrity(frames,[after]).unconfirmed.length,1,'Outgoing velocity alone cannot confirm a paddle hit');
});

test('degraded986 HTTP reads prove a single contact without assuming a 150 ms sampling interval',()=>{
 const frames=[pose(0,45),pose(16,40),pose(32,73)].map((p,i)=>({...p,rally:'5',
  sourceUs:i<2?'17690000':'18000000',sourceVelocity:{vx:i<2?'-211200000':'232320000',x:i<2?'46272550':'105119206',score:[2,2]}}));
 const snapshots=[
  {at:0,state:{t:'17690000',vx:'-211200000',x:'46272550',scoreA:2,scoreB:2},chaos:{physics:{t:'17690000',score:{rally:5,a:2,b:2},collisionSequence:2,
   balls:[{alive:true,lastHitter:1,vx:'-211200000',x:'46272550400000',trailRevision:0}]}}},
  {at:32.8,state:{t:'18000000',vx:'232320000',x:'105119206',scoreA:2,scoreB:2},chaos:{physics:{t:'18000000',score:{rally:5,a:2,b:2},collisionSequence:3,
   balls:[{alive:true,lastHitter:0,vx:'232320000',x:'105119206400000',trailRevision:0}]}}},
 ];
 assert.equal(collisionIntegrity(frames,snapshots).bounces[0].evidence,'live-contact-transition');
 for(const mutate of [
  (s:any)=>s[1].chaos.physics.collisionSequence=4,
  (s:any)=>s[1].chaos.physics.balls[0].lastHitter=1,
  (s:any)=>s[1].chaos.physics.t='18200001',
  (s:any)=>s[1].at=40,
  (s:any)=>s[1].chaos.physics.score.a=3,
 ]){const bad=structuredClone(snapshots);mutate(bad);assert.equal(collisionIntegrity(frames,bad).unconfirmed.length,1);}
});
