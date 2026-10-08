import test from 'node:test';
import assert from 'node:assert/strict';
import {ParticipantReconciliation,participantContinuationTime,participantSourceChanged,type ParticipantPose} from '../web/lib/participant-reconciliation';
import {projectParticipant,projectChaosParticipant} from '../web/lib/participant-projection';
import {ParticipantInputs} from '../web/lib/participant-inputs';
import {initial} from '../shared/physics-v2';
import {initialChaosEvents} from '../shared/physics-chaos-events';
import {zeroHash} from 'viem';
const pose=(left=288,right=288,x=512,y=288):ParticipantPose=>({paddles:[left,right],halves:[48,48],balls:[{id:1,x,y,continuity:'0:0'}]});

test('public match939 release between frames cannot add a partial frame or a late receipt tail',()=>{
 const view=new ParticipantReconciliation();
 view.sample(pose(170.69),undefined,16.4,{side:0,direction:-1});
 view.sample(pose(165.74),undefined,16.5,{side:0,direction:-1});
 const release=view.sample(pose(162.67),pose(162.67),16.9,{side:0,direction:0});
 assert.equal(release.paddles[0],165.74,'no last 3.07-unit move after keyup');
 for(let i=0;i<15;i++){
  const y=view.sample(pose(158),i===3?pose(164):undefined,16.7,{side:0,direction:0}).paddles[0];
  assert(Math.abs(y-165.74)<=2,'total correction remains bounded from the released picture');
 }
});

test('an ACK-only timing change reconciles the public slow-network rollback without delaying local release',()=>{
 const ledger=new ParticipantInputs(),state=initial(zeroHash);
 const source=()=>({state,clock:0n,confirmedInputRevision:ledger.revision});
 const beforeLocal=source();ledger.notice({id:1,direction:-1,at:1119},0n,1000);
 assert.equal(participantSourceChanged(beforeLocal,source()),false,'local intent is not a server correction');
 const previous=source(),oldControls=ledger.controls(0,0n),view=new ParticipantReconciliation();
 const picture=(controls:ReturnType<ParticipantInputs['controls']>,at:bigint)=>pose(Number(projectParticipant(state,at,controls).state.left)/1e6);
 const last=picture(oldControls,440_000n);view.sample(last,undefined,16);
 ledger.notice({id:1,direction:-1,at:1119,acceptedAt:300_000n},0n,1000);
 assert(participantSourceChanged(previous,source()),'ACK re-times the same source before a physical update');
 const current=picture(ledger.controls(0,0n),456_000n),continued=picture(oldControls,456_000n);
 assert(current.paddles[0]-continued.paddles[0]>30,'recorded slow-network rollback magnitude');
 const reconciled=view.sample(current,continued,16,{side:0,direction:-1});
 assert(Math.abs(reconciled.paddles[0]-last.paddles[0])<5,'no 30px ACK-only jump');
 const beforeRelease=source();ledger.notice({id:2,direction:0,at:1470},0n,1000);
 assert.equal(participantSourceChanged(beforeRelease,source()),false,'release remains immediate');
 assert.equal(state.left,288_000_000n,'canonical state is unchanged');
});

test('neutral input never slides through a three-unit acknowledgement correction',()=>{
 const view=new ParticipantReconciliation(),canonical=pose(232.2);
 const first=view.sample(canonical,pose(235.2),16,{side:0,direction:0});
 assert(first.paddles[0]>232.2&&first.paddles[0]<235.2);
 assert(235.2-first.paddles[0]<=2);
 for(let i=0;i<20;i++)assert.equal(view.sample(canonical,undefined,16,{side:0,direction:0}).paddles[0],first.paddles[0]);
 assert.equal(canonical.paddles[0],232.2,'Canonical physics is untouched');
});

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

test('paddle correction cannot move a confirmed ball to manufacture a contact',()=>{
 for(const side of [0,1] as const){
  const view=new ParticipantReconciliation(),current=pose(),before=pose();
  before.paddles[side]-=60;
  const plane=side===0?40:984;
  current.balls=[{id:1,x:plane,y:current.paddles[side]+12,continuity:'0'}];
  before.balls=[{id:1,x:plane,y:before.paddles[side]+12,continuity:'0'}];
  const hit=view.sample(current,before,16);
  assert.equal(hit.balls[0].x,plane);
  assert.equal(hit.balls[0].y,current.balls[0].y,'live contact geometry is not moved to the displayed paddle');
  current.balls[0].y=current.paddles[side]+80;
  const miss=view.sample(current,undefined,16);
  assert.equal(miss.balls[0].y,current.balls[0].y,'a miss does not follow a correcting paddle');
 }
});

test('a held local paddle keeps its full speed across a late ACK and stops without a correction tail',()=>{
 const view=new ParticipantReconciliation();let y=228;
 view.sample(pose(y),undefined,16,{side:0,direction:-1});
 let shown=view.sample(pose(288-4.8),pose(y-4.8),16,{side:0,direction:-1});
 assert(Math.abs(shown.paddles[0]-(y-4.8))<1e-9);
 for(let i=2;i<=20;i++){
  const next=view.sample(pose(288-4.8*i),undefined,16,{side:0,direction:-1});
  assert(Math.abs((shown.paddles[0]-next.paddles[0])/0.016-300)<1e-8,'no correction velocity subtracts from the commanded speed');shown=next;
 }
 const stopped=view.sample(pose(192),undefined,16,{side:0,direction:0});
 for(let i=0;i<20;i++)assert.equal(view.sample(pose(192),undefined,16,{side:0,direction:0}).paddles[0],stopped.paddles[0]);
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
test('an already missed ball never inherits a later remote-paddle correction while awaiting its point',()=>{
 for(const side of [0,1] as const){
  const view=new ParticipantReconciliation(),current=pose(),previous=pose();
  current.paddles[side]=172;previous.paddles[side]=273;
  current.balls[0]={id:1,x:side===0?37.463:986.537,y:50.73,continuity:'10'};
  previous.balls[0]={...current.balls[0]};
  const shown=view.sample(current,previous,16.6);
  assert.equal(shown.balls[0].y,50.73,'No +99px ball jump when the remote paddle is reconciled');
  assert.equal(shown.balls[0].x,current.balls[0].x,'A missed plane stays missed');
 }
});

test('a ball far above a paddle does not inherit its correction before reaching the plane',()=>{
 for(const side of [0,1] as const){
  const view=new ParticipantReconciliation(),current=pose(),previous=pose();
  current.paddles[side]=244.8;previous.paddles[side]=298.425;
  current.balls[0]={id:1,x:side===1?955.410944:68.589056,y:66.294528,continuity:'5'};
  previous.balls[0]={...current.balls[0]};
  const shown=view.sample(current,previous,16.4);
  assert.equal(shown.balls[0].y,current.balls[0].y,'The old horizontal-only blend added nearly 40 pixels');
 }
});

test('ordinary motion, intent changes and independent matches acquire no interpolation delay',()=>{
 const a=new ParticipantReconciliation(),b=new ParticipantReconciliation();
 for(let i=0;i<20;i++){
  const state=pose(288-i*3,288+i*3,512+i*4,288);
  assert.deepEqual(a.sample(state,undefined,16),state);
 }
 a.sample(pose(),pose(200),16);assert.deepEqual(b.sample(pose(),undefined,16),pose());
});

test('Chaos match720 pending -> pre-ack snapshot -> accepted input stays continuous',()=>{
 // Actual baseline: input predicted at119ms, still unapplied at310ms, only
 // accepted at440ms. Rebuilding each source directly jumped 34 then23 pixels.
 const base={...initialChaosEvents(zeroHash),t:100_000n};
 const projected=(state:typeof base,t:bigint,controls:{side:0;direction:-1;at:bigint}[])=>{
  const s=projectChaosParticipant(state,t,controls,'complete').state;
  return pose(Number(s.left)/1e12,Number(s.right)/1e12,Number(s.balls[0].x)/1e12,Number(s.balls[0].y)/1e12);
 };
 const inputs=[{side:0 as const,direction:-1 as const,at:119_000n}],view=new ParticipantReconciliation();
 const before=projected(base,440_000n,inputs);
 const speculative=projected(base,456_000n,inputs);
 const receipt={...base,t:440_000n,leftDir:-1};
 const authoritative=projected(receipt,456_000n,[]);
 assert(authoritative.paddles[0]-speculative.paddles[0]>50,'fixture must reproduce a real rollback');
 view.sample(before,undefined,16);
 const rendered=view.sample(authoritative,speculative,16);
 assert(rendered.paddles[0]<before.paddles[0],'receipt cannot reverse a held up key');
 assert(Math.abs(rendered.paddles[0]-before.paddles[0])<4);
 assert.equal(receipt.left,base.left,'presentation never rewrites canonical physics');
});

test('match727 clock reanchors cannot teleport an otherwise correctly predicted bot',()=>{
 const priorTime=17_313_000n,dt=16.9,receivedTime=17_370_000n;
 const next=participantContinuationTime(priorTime,dt);
 assert.equal(next,17_329_900n);
 const view=new ParticipantReconciliation();view.sample(pose(288,254),undefined,dt);
 const continued=pose(288,254-180*dt/1000),received=pose(288,254-180*Number(receivedTime-priorTime)/1e6);
 const picture=view.sample(received,continued,dt);
 assert(Math.abs(picture.paddles[1]-254)<5.1,'normal movement plus bounded correction, not a 10px clock jump');
 assert.equal(participantContinuationTime(0n,16,0n),0n,'countdown cannot pre-simulate movement');
 assert.equal(participantContinuationTime(400_000n,1000,430_000n),430_000n,'pause credit remains a hard ceiling');
});

test('large ball correction cannot cross the paddle plane in either direction',()=>{
 for(const x of [38,42,982,986])for(const error of [-400,400]){
  const view=new ParticipantReconciliation(),sample=view.sample(pose(288,288,x),pose(288,288,x+error),16);
  if(x<40)assert(sample.balls[0].x<=40);
  else if(x>984)assert(sample.balls[0].x>=984);
  else assert(sample.balls[0].x>=40&&sample.balls[0].x<=984);
 }
});
