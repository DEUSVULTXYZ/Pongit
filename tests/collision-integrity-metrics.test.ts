import test from 'node:test';
import assert from 'node:assert/strict';
import {collisionIntegrity} from '../scripts/collision-integrity-metrics';
const pose=(at:number,x:number,collisions:any[]=[])=>({at,renderedUs:String(at*1000),rules:17,rally:'1',balls:[{id:1,x,y:200}],collisions});
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
