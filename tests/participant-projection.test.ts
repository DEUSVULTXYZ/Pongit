import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,SCALE} from '../shared/physics-v2';
import {projectParticipant,projectChaosParticipant} from '../web/lib/participant-projection';
import {initialChaosEvents} from '../shared/physics-chaos-events';
import {zeroHash} from 'viem';
import {projectLive} from '../web/lib/presentation';
import {LiveClock} from '../web/lib/live-paddle';
const source=()=>({...initial(`0x${'ab'.repeat(32)}`),x:80n*SCALE,y:360n*SCALE,vx:-128n*SCALE,vy:64n*SCALE,left:288n*SCALE,leftDir:0});

test('responsive rendering waits for live contact even after the input receipt',()=>{
 const s={...source(),left:360n*SCALE};
 const inputs=[{side:0 as const,direction:0 as const,at:0n,confirmed:true}];
 const next=projectParticipant(s,400_000n,inputs,undefined,true);
 assert(next.contactBoundary);assert(next.state.vx<0n,'accepted input is not a confirmed collision');
 assert(next.state.x>=40n*SCALE);assert.deepEqual(s,{...source(),left:360n*SCALE});
 const chaos=initialChaosEvents(zeroHash);
 chaos.balls[0]={...chaos.balls[0],x:978_560_000_000_000n,y:521_280_000_000_000n,vx:192_000_000n,vy:96_000_000n};
 chaos.right=528_000_000_000_000n;
 const projected=projectChaosParticipant(chaos,100_000n,[],'complete',undefined,true);
 assert(projected.contactBoundary);assert(projected.state.balls[0].vx>0n);
 assert(!projected.collisions.some(c=>c.kind===3||c.kind===4),'no predicted paddle sound or impact');
});

test('a paused presentation clock cannot bank time and jump on resume',()=>{
 const clock=new LiveClock();
 assert.equal(clock.sample(400_000n,500_000n),400_000n);
 assert.equal(clock.sample(1_100_000n,500_000n),500_000n);
 assert.equal(clock.sample(510_000n,1_000_000n),510_000n);
 assert.equal(clock.sample(490_000n,1_000_000n),510_000n,'ordinary stale observations cannot reverse time');
 assert.equal(clock.sample(700_000n,500_000n),500_000n,'a newly observed contract pause wins over prediction');
});

test('local movement affects the paddle used for collision, not just the drawn rectangle',()=>{
 const old=projectLive(source(),400_000n);
 assert.equal(old.state.left,288n*SCALE);assert.ok(old.state.vx<0n,'old projection misses the visually moved paddle');
 const next=projectParticipant(source(),400_000n,[{side:0,direction:1,at:0n}]);
 assert.equal(next.state.left,360n*SCALE);assert.ok(next.state.vx>0n,'the same moving paddle returns the ball');
 assert.equal(next.state.scoreA+next.state.scoreB,0,'no speculative point');
});

test('release/reversal have physical times and reconstruction does not mutate the confirmed snapshot',()=>{
 const state=source(),copy={...state};
 const next=projectParticipant(state,400_000n,[{side:0,direction:1,at:0n},{side:0,direction:-1,at:100_000n},{side:0,direction:0,at:200_000n}]);
 assert.equal(next.state.left,288n*SCALE);assert.equal(next.state.leftDir,0);assert.deepEqual(state,copy);
 assert.ok(next.state.vx<0n,'a reversed paddle cannot receive a fictitious hit');
});

test('a queued reversal is not applied before its engine time and projection remains bounded',()=>{
 const state=source(),inputs=[{side:0 as const,direction:1 as const,at:300_000n}];
 assert.equal(projectParticipant(state,200_000n,inputs).state.left,state.left);
 assert.equal(projectParticipant(state,400_000n,inputs).state.left,306n*SCALE);
 const late=projectParticipant({...state,x:512n*SCALE,vx:128n*SCALE},5_000_000n,inputs);
 assert.ok(late.state.t<=600_000n);assert.equal(late.waiting,true);
});

test('a predicted point holds the ball and score while later local paddle intentions keep moving',()=>{
 const s={...source(),x:1025n*SCALE,y:520n*SCALE,vx:192n*SCALE,vy:96n*SCALE};
 const still=projectParticipant(s,400_000n,[]),moving=projectParticipant(s,400_000n,[{side:0,direction:1,at:100_000n},{side:0,direction:0,at:300_000n}]);
 assert.equal(moving.pointBoundary,true);assert.equal(moving.state.left-s.left,36n*SCALE);
 for(const key of ['x','y','vx','vy','t','scoreA','scoreB'] as const)assert.equal(moving.state[key],still.state[key]);
 assert.equal(moving.state.leftDir,0);
});

test('Chaos point confirmation does not swallow a later reversal or fabricate a new rally',()=>{
 const s=initialChaosEvents(zeroHash);s.balls[0]={...s.balls[0],x:1025_000_000_000_000n,y:520_000_000_000_000n,vx:192_000_000n,vy:96_000_000n};
 const still=projectChaosParticipant(s,400_000n,[],'complete');
 const moving=projectChaosParticipant(s,400_000n,[{side:0,direction:1,at:100_000n},{side:0,direction:-1,at:300_000n}],'complete');
 assert.equal(moving.pointBoundary,true);assert.equal(moving.state.left-s.left,18_000_000_000_000n);
 assert.deepEqual(moving.state.balls,still.state.balls);assert.deepEqual(moving.state.score,s.score);assert.equal(moving.state.t,still.state.t);assert.equal(moving.state.leftDir,-1);
 assert.equal(projectChaosParticipant(s,5_000_000n,[{side:0,direction:1,at:100_000n}],'complete').state.left-s.left,90_000_000_000_000n);
});
