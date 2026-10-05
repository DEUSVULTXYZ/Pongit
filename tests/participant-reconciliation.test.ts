import test from 'node:test';
import assert from 'node:assert/strict';
import {ParticipantReconciliation,type ParticipantPose} from '../web/lib/participant-reconciliation';
const pose=(left=288,right=288,x=512,y=288):ParticipantPose=>({paddles:[left,right],halves:[48,48],balls:[{id:1,x,y,continuity:'0:0'}]});

test('a delayed receipt blends its 60px error without reversing a held paddle',()=>{
 const view=new ParticipantReconciliation();
 view.sample(pose(228),undefined,16);
 const received=view.sample(pose(288),pose(225),16);
 assert(received.paddles[0]<228,'held up still moves up during the receipt');
 assert(Math.abs(received.paddles[0]-228)<4,'no 60px rollback');
 let previous=received.paddles[0];
 for(let i=1;i<=20;i++){
  const next=view.sample(pose(288-180*i*.016),undefined,16);
  assert(next.paddles[0]<=previous,'correction cannot defeat an up input');previous=next.paddles[0];
 }
});

test('both paddles and contact points reconcile together; real misses remain misses',()=>{
 for(const side of [0,1] as const){
  const view=new ParticipantReconciliation(),current=pose(),before=pose();
  before.paddles[side]-=60;
  const plane=side===0?40:984;
  current.balls=[{id:1,x:plane,y:current.paddles[side]+12,continuity:'0'}];
  before.balls=[{id:1,x:plane,y:before.paddles[side]+12,continuity:'0'}];
  const hit=view.sample(current,before,16);
  assert.equal(hit.balls[0].x,plane);
  assert.equal(hit.balls[0].y-hit.paddles[side],12,'contact follows the drawn paddle');
  current.balls[0].y=current.paddles[side]+80;
  const miss=view.sample(current,undefined,16);
  assert.equal(miss.balls[0].y-miss.paddles[side],80,'never turn a miss into a visual hit');
 }
});

test('corrections converge; score/teleport/multiball boundaries do not drag an old ball',()=>{
 const view=new ParticipantReconciliation(),state=pose();
 view.sample(state,pose(228,240,470,310),16);
 let result=state;for(let i=0;i<120;i++)result=view.sample(state,undefined,16);
 assert(Math.abs(result.paddles[0]-288)<.001);assert(Math.abs(result.balls[0].x-512)<.001);
 view.sample(state,pose(228,240,470,310),16);
 const serve=pose();serve.balls[0].continuity='1:0';
 assert.equal(view.sample(serve,state,16).balls[0].x,512,'new rally starts at its real serve');
 view.sample({...serve,balls:[]},undefined,16);
 assert.equal(view.sample(serve,undefined,16).balls[0].x,512,'removed ball has no residual');
 view.reset();assert.deepEqual(view.sample(state,undefined,16),state);
});

test('ordinary motion, intent changes and independent matches acquire no interpolation delay',()=>{
 const a=new ParticipantReconciliation(),b=new ParticipantReconciliation();
 for(let i=0;i<20;i++){
  const state=pose(288-i*3,288+i*3,512+i*4,288);
  assert.deepEqual(a.sample(state,undefined,16),state);
 }
 a.sample(pose(),pose(200),16);assert.deepEqual(b.sample(pose(),undefined,16),pose());
});
