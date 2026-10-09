import test from 'node:test';
import assert from 'node:assert/strict';
import {ParticipantReconciliation,participantContinuationTime,participantMotionMs,participantSourceChanged,type ParticipantPose} from '../web/lib/participant-reconciliation';
import {projectParticipant,projectChaosParticipant} from '../web/lib/participant-projection';
import {ParticipantInputs,localMotion} from '../web/lib/participant-inputs';
import {initial} from '../shared/physics-v2';
import {initialChaosEvents} from '../shared/physics-chaos-events';
import {zeroHash} from 'viem';
const pose=(left=288,right=288,x=512,y=288):ParticipantPose=>({paddles:[left,right],halves:[48,48],balls:[{id:1,x,y,continuity:'0:0'}]});

test('mobile1554 late approach to a missed contact stops at its edge without an18-unit rewind',()=>{
 const view=new ParticipantReconciliation(),p=pose(288,351.287266,983.999833,423.500029);
 p.contactBoundary=true;p.contactPaddles=[288,348.3222];p.balls[0].vx=220.260483;
 let last=351.287266;
 for(const y of [351.287266,356.182220,361.170346,366.460524,371.1,376.2]){
  p.paddles[1]=y;const shown=view.sample(p,undefined,16.6).paddles[1];
  assert(shown>=last-.001,'a future approach cannot reset the bot to its old contact pose');
  assert(shown-last<=6,'no forward jump either');
  assert(p.balls[0].y-shown>54,'a confirmed miss never becomes a pictured hit');last=shown;
 }
});

test('Edge1534 distant misses do not reset a stopped paddle for either ball',()=>{
 for(const [live,shown,ballY] of [[327,331.87,235.999925],[228,233.6406,143.99999]])for(const id of [1,2]){
  const view=new ParticipantReconciliation(),p=pose(shown,288,40.00006,ballY);
  p.balls[0].id=id;p.balls[0].vx=-192;
  view.sample(p,undefined,0,{side:0,direction:0,speed:300,motion:[],stopConfirmed:false});
  p.paddles[0]=live;p.contactBoundary=true;p.contactPaddles=[live,288];
  const first=view.sample(p,undefined,16,{side:0,direction:0,speed:300,motion:[],stopConfirmed:true});
  assert(Math.abs(first.paddles[0]-shown)<=2);
  for(let i=0;i<12;i++)assert.equal(view.sample(p,undefined,16,{side:0,direction:0,speed:300,motion:[]}).paddles[0],first.paddles[0]);
 }
});

test('Edge1543 real hit holds the bot at contact before its future motion creates a miss',()=>{
 const view=new ParticipantReconciliation(),p=pose(288,203.918,983.319,236.341);
 p.balls[0].vx=230;view.sample(p,undefined,16);
 p.balls[0]={...p.balls[0],x:983.99999,y:236};p.contactBoundary=true;p.contactPaddles=[288,203.4183];
 let last=203.918;
 for(let i=0;i<6;i++){
  p.paddles[1]=199.35-i*4.98;
  const shown=view.sample(p,undefined,16.6);
  assert.equal(shown.paddles[1],203.4183);assert(Math.abs(shown.paddles[1]-last)<1);
  last=shown.paddles[1];
 }
});

test('a release spends no correction against an unacknowledged moving prediction',()=>{
 const view=new ParticipantReconciliation();view.sample(pose(300),undefined,0,{side:0,direction:-1,speed:300,motion:[]});
 const pending=view.sample(pose(295),undefined,10,{side:0,direction:0,speed:300,motion:[],stopConfirmed:false});
 assert.equal(pending.paddles[0],300);
 const confirmed=view.sample(pose(301),undefined,10,{side:0,direction:0,speed:300,motion:[],stopConfirmed:true});
 assert.equal(confirmed.paddles[0],301,'the two-unit budget remains available for the verified release');
});

test('a split gap and either simultaneous ball retain their real contact classification',()=>{
 for(const side of [0,1] as const){
  const view=new ParticipantReconciliation(),p=pose();p.halves=[56,56];p.split=[true,true];
  p.contactBoundary=true;p.contactPaddles=[288,288];p.paddles[side]=293;
  p.balls=[{id:1,x:side?984:40,y:200,vx:side?192:-192,continuity:'r'},
   {id:2,x:side?984:40,y:288,vx:side?192:-192,continuity:'r'}];
  assert(Math.abs(view.sample(p,undefined,16).paddles[side]-288)<2,'gap must not turn into a solid hit for the second ball');
 }
});

test('Edge1529 cannot move either paddle into a ball waiting in its past',()=>{
 for(const side of [0,1] as const)for(const ball of [1,2]){
  const view=new ParticipantReconciliation(),p=pose();
  p.paddles[side]=side?104.88:383.37;
  p.contactBoundary=true;p.contactPaddles=side?[288,113.62]:[376.1595,288];
  p.balls=[{id:ball,x:side?983.999936:40.00012168,y:side?52:432.00007,vx:side?192:-211.2,continuity:'same'}];
  const source=structuredClone(p);
  for(let i=0;i<5;i++){
   p.paddles[side]+=side?-4.8:4.8;
   const shown=view.sample(p,undefined,16,{side,direction:side?-1:1,speed:300,motion:[{direction:side?-1:1,ms:16}]});
   assert(Math.abs(shown.balls[0].y-shown.paddles[side])>54,'real miss stays visually outside the solid paddle');
   assert.equal(shown.balls[0].x,source.balls[0].x,'never relocate the ball to fabricate a contact');
  }
 }
});

test('a remote contact does not delay the local paddle or resume an obsolete direction',()=>{
 const view=new ParticipantReconciliation(),p=pose(288,104,983.99999,52);
 p.contactBoundary=true;p.contactPaddles=[288,113];p.balls[0].vx=192;
 view.sample(p,undefined,0,{side:0,direction:1,speed:300,motion:[]});
 assert.equal(view.sample(p,undefined,16,{side:0,direction:1,speed:300,motion:[{direction:1,ms:16}]}).paddles[0],292.8);
 const stopped=view.sample(p,undefined,0,{side:0,direction:0,speed:300,motion:[]});
 const next={...p,contactBoundary:false};
 assert(Math.abs(view.sample(next,p,16,{side:0,direction:0,speed:300,motion:[{direction:0,ms:16}]}).paddles[0]-stopped.paddles[0])<=2);
});

test('short input pulses integrate event time rather than accumulating RAF rounding',()=>{
 const view=new ParticipantReconciliation();let previous=0;
 const events=Array.from({length:100},(_,i)=>[{direction:(i%2?-1:1) as -1|1,at:5+i*130},{direction:0 as const,at:85+i*130}]).flat();
 view.sample(pose(),undefined,0,{side:0,direction:0,speed:300,motion:[]});
 let expected=288,largest=0;
 for(let t=16.7;t<13200;t+=16.7){
  const motion=localMotion(events,previous,t,true),direction=events.filter(e=>e.at<=t).at(-1)?.direction??0;
  expected=288+Array.from({length:100},(_,i)=>(i%2?-1:1)*.3*Math.min(80,Math.max(0,t-(5+i*130)))).reduce((a,b)=>a+b,0);
  const shown=view.sample(pose(expected),pose(expected),16.7,{side:0,direction,speed:300,motion});
  largest=Math.max(largest,Math.abs(shown.paddles[0]-expected));previous=t;
 }
 assert(largest<1e-8);assert(Math.abs(expected-288)<1e-8);
});

test('release integrates only movement before its timestamp, then stays still',()=>{
 const view=new ParticipantReconciliation(),events=[{direction:1 as const,at:0},{direction:0 as const,at:25}];
 view.sample(pose(),undefined,0,{side:0,direction:1,speed:300,motion:[]});
 assert.equal(view.sample(pose(292.8),undefined,16,{side:0,direction:1,speed:300,motion:localMotion(events,0,16,true)}).paddles[0],292.8);
 const stopped=view.sample(pose(295.5),undefined,16,{side:0,direction:0,speed:300,motion:localMotion(events,16,32,true)});
 assert.equal(stopped.paddles[0],295.5,'the final nine milliseconds happened before release');
 assert.equal(view.sample(pose(295.5),undefined,16,{side:0,direction:0,speed:300,motion:localMotion(events,32,48,true)}).paddles[0],295.5);
 assert.deepEqual(localMotion(events,32,1000,false),[],'a real pause never integrates hidden time');
});

test('event-timed motion never pays receipt error while held and spends only two units after release',()=>{
 const view=new ParticipantReconciliation();view.sample(pose(),undefined,0,{side:0,direction:1,speed:300,motion:[]});
 const moved=view.sample(pose(310),undefined,16,{side:0,direction:1,speed:300,motion:[{direction:1,ms:16}]});
 assert.equal(moved.paddles[0],292.8);
 const stopped=view.sample(pose(312),undefined,0,{side:0,direction:0,speed:300,motion:[]});
 assert.equal(stopped.paddles[0],294.8);
 for(let i=0;i<60;i++)assert.equal(view.sample(pose(312+i),undefined,16,{side:0,direction:0,speed:300,motion:[{direction:0,ms:16}]}).paddles[0],294.8);
});

test('public Chaos1121 confirmed contact resumes without the recorded35-unit jump',()=>{
 for(const side of [0,1]){
  const view=new ParticipantReconciliation(),mirror=(x:number)=>side?1024-x:x;
  const waiting=pose(259.2,288,mirror(40.00019969),270.12460999);
  waiting.contactBoundary=true;waiting.balls[0].vx=side?299676020:-299676020;
  view.sample(waiting,undefined,16.7);
  const outgoing=pose(259.2,288,mirror(79.17870351),300.73328468);
  outgoing.contactBoundary=false;outgoing.balls[0].vx=side?-329643622:329643622;
  let picture=view.sample(outgoing,waiting,17.2),last=waiting.balls[0];
  assert(Math.hypot(picture.balls[0].x-last.x,picture.balls[0].y-last.y)<12,'actual baseline jumps35.4 units');
  assert(side?picture.balls[0].x<last.x:picture.balls[0].x>last.x,'confirmed outgoing movement resumes');
  for(let i=1;i<=5;i++){
   last=picture.balls[0];outgoing.balls[0].x+= (side?-1:1)*329.643622*.0167;outgoing.balls[0].y+=257.534079*.0167;
   picture=view.sample(outgoing,undefined,16.7);
   assert(Math.hypot(picture.balls[0].x-last.x,picture.balls[0].y-last.y)<18,'no later catch-up jump');
  }
  assert.deepEqual(picture.balls,outgoing.balls,'handoff finishes within80ms; no persistent trailing ball');
 }
});

test('contact handoff cannot turn a missing confirmation into a rebound or contaminate another rally',()=>{
 const view=new ParticipantReconciliation(),waiting=pose(288,288,40.0001,90);waiting.contactBoundary=true;waiting.balls[0].vx=-300;
 view.sample(waiting,undefined,16);
 const missed=pose(288,288,30,98);missed.balls[0].vx=-300;
 const shown=view.sample(missed,waiting,16);
 assert(shown.balls[0].x<40,'confirmed miss remains outside the paddle');
 const next=pose();next.balls[0].continuity='next-rally';
 assert.deepEqual(view.sample(next,missed,16).balls,next.balls,'new rally has no contact correction');
});

test('public985 delayed presence observation cannot resist a held local paddle or advance its ball',()=>{
 const view=new ParticipantReconciliation(),fixed=pose(388.08,288,351.31,207.65);
 view.sample(fixed,undefined,0,{side:0,direction:-1,speed:300,motionMs:0});
 let shown=fixed,clock=35_387_099n;
 for(const dt of [17,16.4,16.6]){
  clock=participantContinuationTime(clock,dt,35_390_000n);
  shown=view.sample(fixed,undefined,dt,{side:0,direction:-1,speed:300,motionMs:participantMotionMs(dt,true,false,false)});
 }
 assert.equal(clock,35_390_000n,'Presence still fences the predicted ball and clock');
 assert(Math.abs(shown.paddles[0]-(388.08-300*.05))<1e-9,'The local paddle covers the full50ms');
 assert.deepEqual(shown.balls,fixed.balls,'No invented collision or ball progress');
 for(const flags of [[false,false,false],[true,true,false],[true,false,true]]){
  const before=shown.paddles[0];
  shown=view.sample(fixed,undefined,16,{side:0,direction:-1,speed:300,motionMs:participantMotionMs(16,...flags as [boolean,boolean,boolean])});
  assert.equal(shown.paddles[0],before,'Disabled, stale or terminal play stops visual motion');
 }
 assert.equal(participantMotionMs(1000,true,false,false),50,'No catch-up leap after a frozen render');
});

test('public Chaos970 miss cannot visually rebound while its incoming velocity is unchanged',()=>{
 for(const side of [0,1]){
  const sample=(x:number,vx=side?192:-192,continuity='6')=>{const p=pose(288,288,side?1024-x:x);p.balls[0]={...p.balls[0],vx,continuity};return p;};
  const view=new ParticipantReconciliation(),first=sample(30),older=sample(25);
  const shown=view.sample(first,older,16.7).balls[0];
  const next=sample(29.9),after=view.sample(next,undefined,16.7).balls[0];
  assert(side?after.x>=shown.x:after.x<=shown.x,'decaying correction must not reverse a missed ball');
  assert.equal(next.balls[0].x,side?994.1:29.9,'canonical projection is never rewritten');
  const turned=view.sample(sample(36,side?-192:192),undefined,16.7).balls[0];
  assert(side?turned.x<after.x:turned.x>after.x,'a real velocity reversal remains visible');
  assert.equal(view.sample(sample(30,side?192:-192,'7'),undefined,16.7).balls[0].x,side?994:30,'new rally resets the visual bound');
 }
});

test('public Chaos947 clock catch-up never subtracts a frame from a held local paddle',()=>{
 for(const side of [0,1] as const)for(const direction of [-1,1])for(const speed of [150,300,450]){
  const view=new ParticipantReconciliation(),source=pose(),local={side,direction,speed,motionMs:16.7};
  view.sample(source,undefined,16.7,local);let y=288;
  // LiveClock temporarily holds its previous target while the newer, slower
  // anchor catches up. The same reconstructed pose lasts several paints.
  for(let i=0;i<5;i++){
   y+=direction*speed*.0167;
   const picture=view.sample(source,undefined,16.7,local);
   assert(Math.abs(picture.paddles[side]-y)<1e-8);
   assert.deepEqual(picture.balls,source.balls,'the ball remains on the confirmed reconstruction');
  }
  const limited=view.sample(source,undefined,16.7,{...local,motionMs:5});y+=direction*speed*.005;
  assert(Math.abs(limited.paddles[side]-y)<1e-8,'never cross the remaining presence credit');
  assert.equal(view.sample(source,undefined,16.7,{...local,motionMs:0}).paddles[side],y,'pause/stale fences freeze local motion');
  const reverse=view.sample(source,undefined,16.7,{...local,direction:-direction});y-=direction*speed*.0167;
  assert(Math.abs(reverse.paddles[side]-y)<1e-8,'inversion takes effect on the next paint');
  assert.equal(view.sample(source,undefined,16.7,{...local,direction:0}).paddles[side],reverse.paddles[side],'release is immediate');
  assert.equal(source.paddles[side],288,'source is immutable');
 }
});

test('public match941 wall arrival cannot strand a held paddle at79.5 while live is48',()=>{
 for(const side of [0,1] as const)for(const direction of [-1,1])for(const speed of [150,300,450]){
  const view=new ParticipantReconciliation(),wall=direction<0?48:528;
  const y=wall-direction*31.5057,first=pose();first.paddles[side]=y;
  view.sample(first,undefined,16.7,{side,direction,speed});
  const canonical=pose();canonical.paddles[side]=wall;
  let last=y;
  for(let i=0;i<30;i++){
   const result=view.sample(canonical,i===0?first:undefined,16.7,{side,direction,speed});
   const expected=Math.max(48,Math.min(528,last+direction*speed*.0167));
   assert(Math.abs(result.paddles[side]-expected)<1e-9,'full speed until the drawn paddle reaches the wall');
   assert.equal(canonical.paddles[side],wall,'server physics stays unchanged');
   assert.deepEqual(result.balls,canonical.balls,'ball never follows visual correction');last=result.paddles[side];
  }
  assert.equal(last,wall);
 }
});

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
