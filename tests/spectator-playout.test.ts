import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {zeroHash} from 'viem';
import {initial} from '../shared/physics-interlude';
import {SpectatorPlayout,visibleBall} from '../web/lib/spectator-playout';
import {initialChaosEvents} from '../shared/physics-chaos-events';
import {projectChaos,SpectatorChaosProjection} from '../web/lib/chaos-presentation';
import {projectLive} from '../web/lib/presentation';
import {move} from '../shared/physics-v2';
const state=(ms:number)=>({...initial(zeroHash),t:BigInt(ms)*1000n,left:BigInt(100+ms/10)*1000000n});

test('recorded hosted Chaos delivery gap keeps spectator holds below 500 ms without extrapolation',()=>{
 const recorded=JSON.parse(readFileSync(new URL('./fixtures/agent-spectator-265.json',import.meta.url),'utf8'));
 const p=new SpectatorPlayout();let cursor=0,hold=0,maxHold=0,lastAt:number|undefined,lastT:bigint|undefined;
 for(const now of recorded.frames as number[]){
  while(cursor<recorded.snapshots.length&&recorded.snapshots[cursor].at<=now){
   const s=recorded.snapshots[cursor++];p.push({at:s.at,state:{...initial(zeroHash),t:BigInt(s.t),scoreA:s.scoreA,scoreB:s.scoreB,finished:s.finished}});
  }
  const sample=p.sample(now);if(!sample)continue;
  assert(sample.target<=BigInt(recorded.snapshots[cursor-1].t),'Spectator cannot invent unprocessed time');
  if(sample.buffering||sample.frame.state.finished||lastAt===undefined){hold=0;}
  else if(sample.target===lastT){hold+=now-lastAt;maxHold=Math.max(maxHold,hold);}
  else hold=0;
  lastT=sample.target;lastAt=now;
 }
 assert(maxHold<=500,`Recorded delivery gap caused ${maxHold.toFixed(1)} ms hold`);
});

test('player playout absorbs 850 ms deliveries without a frame jump when the authoritative clock catches up',()=>{
 const p=new SpectatorPlayout(true),base={...initial(zeroHash),vx:10000000n,vy:5000000n};
 const arrivals=[0,300,650,950,1800,2100,2400];let next=0,last:{x:bigint;t:bigint}|undefined;
 for(let now=0;now<2400;now+=16){
  while(next<arrivals.length&&arrivals[next]<=now){const at=arrivals[next++];p.push({state:move(base,BigInt(at)*1000n),at});}
  const frame=p.sample(now)!,rendered=projectLive(frame.frame.state,frame.target).state;
  if(last){assert(rendered.t>=last.t);assert(rendered.t-last.t<=17000n,'A late snapshot must not jump the presentation clock');
   assert(Math.abs(Number(rendered.x-last.x))<=170000,'Straight trajectory remains continuous');}
  last=rendered;
 }
 assert(p.sample(10000)!.stalled);
 assert(p.sample(10016)!.target<=3000000n,'Prediction remains bounded after a real outage');
});
test('rapid commands cannot evict confirmed frames still needed by a spectator',()=>{
 const p=new SpectatorPlayout();let previous=0n;
 for(let now=0;now<2400;now+=10){
  p.push({state:{...initial(zeroHash),t:BigInt(now)*1000n},at:now});
  const s=p.sample(now)!;
  if(now>1100)assert(s.target-previous<=11000n,'Input bursts cannot force the buffer forward');
  previous=s.target;
 }
});
test('same-instant direction changes replace the trajectory without refreshing a stalled clock',()=>{
 const p=new SpectatorPlayout(true),first=state(100);
 p.push({state:first,at:0});p.push({state:{...first,leftDir:1},at:500});
 const s=p.sample(2000)!;assert.equal(s.frame.state.leftDir,1);assert(s.stalled);
});

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
test('a confirmed point keeps the jitter buffer instead of teleporting the court and freezing it',()=>{
 const p=new SpectatorPlayout();let next=0,prior=-1n,frozen=0,worst=0,jump=0n;
 const snapshots=Array.from({length:14},(_,i)=>({at:i*600,state:{...state(i*600),scoreA:i>=6?1:0}}));
 for(let now=0;now<=snapshots.at(-1)!.at;now+=16){
  while(next<snapshots.length&&snapshots[next].at<=now){p.push(snapshots[next]);next++;}
  const s=p.sample(now)!;
  if(prior>=0n){
   const advanced=s.target-prior;if(advanced>jump)jump=advanced;
   // Ignore the one buffer fill at the start; after it, confirmed frames are
   // always available ahead of the playhead and the court must keep painting.
   if(now>1800){if(advanced<=0n)frozen+=16;else{if(frozen>worst)worst=frozen;frozen=0;}}
  }
  prior=s.target;
 }
 if(frozen>worst)worst=frozen;
 assert(jump<=40000n,`rendered ${Number(jump)/1000} ms of game time in a single frame`);
 assert(worst<=64,`court frozen for ${worst} ms while confirmed frames remained`);
});
test('a point resolved at an already observed instant replaces that frame instead of being dropped',()=>{
 const p=new SpectatorPlayout();p.push({state:state(600),at:600});p.push({state:state(1200),at:1200});
 // The engine resolved the goal at an instant the spectator had already seen.
 p.push({state:{...state(1200),scoreA:1},at:1260});p.push({state:{...state(1800),scoreA:1},at:1800});
 let played;for(let now=1260;now<=3000&&!played;now+=16){const s=p.sample(now)!;if(s.target>1200000n)played=s;}
 assert(played,'the court reaches the confirmed point');
 assert.equal(played!.frame.state.scoreA,1,'the point must not be dropped as a duplicate instant');
});
test('an engine reset or another match still discards old trajectories without inventing a result',()=>{
 const p=new SpectatorPlayout();p.push({state:state(1000),at:1000});p.push({state:state(1200),at:1200});
 const rewound=state(100);p.push({state:rewound,at:1400});assert.equal(p.sample(1400)!.target,rewound.t);
 const other={...state(1500),seed:`0x${'11'.repeat(32)}` as const};p.push({state:other,at:1600});
 assert.equal(p.sample(1600)!.frame.state,other);assert.equal(p.sample(1600)!.target,other.t);
 p.reset();assert.equal(p.sample(1700),null);
});
test('paddles hold their confirmed position across a serve and interpolate inside a rally',()=>{
 const serve=new SpectatorPlayout();
 serve.push({state:{...state(600),left:400000000n},at:600});
 serve.push({state:{...state(1200),scoreA:1,left:288000000n},at:1200});
 serve.sample(1200);assert.equal(serve.sample(1800)!.left,400,'a serve recentres paddles at its own instant');
 const rally=new SpectatorPlayout();
 rally.push({state:{...state(600),left:400000000n},at:600});
 rally.push({state:{...state(1200),left:288000000n},at:1200});
 rally.sample(1200);const inside=rally.sample(1800)!.left;
 assert(inside>288&&inside<400,`smooth inside one rally, got ${inside}`);
});
test('an unconfirmed goal stays visible at the edge and does not change the score',()=>{
 assert.deepEqual(visibleBall(1030,280),{x:1018,y:280});assert.deepEqual(visibleBall(-6,280),{x:6,y:280});
 assert.deepEqual(visibleBall(250,300),{x:250,y:300});
});

test('jitter-buffer growth slows playout without freezing while confirmed frames remain',()=>{
 const p=new SpectatorPlayout();p.push({state:state(0),at:0});p.push({state:state(500),at:500});
 p.sample(500);for(let now=516;now<800;now+=16)p.sample(now);
 p.push({state:state(1600),at:1600});let prior=p.sample(1600)!.target;
 for(let now=1616;now<1850;now+=16){const s=p.sample(now)!;assert(s.target>prior);assert(s.target<=1600000n);prior=s.target;}
});

test('buffered Chaos traverses over 600 ms between snapshots without removing the prediction safety bound for players',()=>{
 const source=initialChaosEvents(zeroHash);source.balls[0].vx=1000000n;source.balls[0].vy=1000000n;
 const p=new SpectatorChaosProjection();let latest=source.t;
 for(let ms=16;ms<=1408;ms+=16){const s=p.sample(source,BigInt(ms)*1000n,'complete');assert(s.state.t>latest);latest=s.state.t;assert.equal(s.state.score.rally,source.score.rally);}
 assert(latest>1_400_000n);
 const fresh=structuredClone(source);fresh.t=500000n;fresh.nextForce=500000n;fresh.leftDir=1;
 assert.equal(p.sample(fresh,fresh.t,'complete').state.leftDir,1,'Reconcile a new authoritative control');
});

test('buffered Chaos holds a visible ball at an unconfirmed point and reconciles the actual next rally',()=>{
 const source=initialChaosEvents(zeroHash);source.balls[0].x=1010000000000000n;source.balls[0].vx=800000000n;
 const p=new SpectatorChaosProjection(),s=p.sample(source,500000n,'complete');
 assert.equal(s.state.score.rally,source.score.rally);assert(s.state.balls[0].alive);assert(s.waiting);
 const next=initialChaosEvents(zeroHash);next.score.a=1;next.score.rally=2;next.t=600000n;next.nextForce=600000n;
 assert.equal(p.sample(next,next.t,'complete').state.score.a,1);
});

test('player Chaos prediction never paints an unconfirmed point or makes the ball disappear',()=>{
 const source=initialChaosEvents(zeroHash);source.balls[0].x=1010000000000000n;source.balls[0].vx=800000000n;
 const p=projectChaos(source,500000n,'complete');
 assert(p.waiting);assert(p.state.balls[0].alive);
 assert.deepEqual(p.state.score,source.score);assert(p.state.balls[0].x>=source.balls[0].x);
 assert(p.state.balls[0].x<=1030000000000000n);
});


test('terminal frame drains at its exact confirmed instant without staying one frame behind',()=>{
 const p=new SpectatorPlayout();p.push({state:state(1000),at:1000});
 p.push({state:{...state(1300),scoreA:7,finished:true},at:1300});
 assert.equal(p.sample(1300)!.frame.state.finished,false);
 let last;for(let now=1316;now<2600;now+=16)last=p.sample(now)!;
 assert.equal(last!.target,1300000n);assert.equal(last!.frame.state.scoreA,7);assert.equal(last!.frame.state.finished,true);
});

test('normal confirmed playout stays within 2 percent of wall time and the reviewed buffer range',()=>{
 const p=new SpectatorPlayout();let next=0,prior:{target:bigint;now:number}|undefined;
 for(let now=0;now<10000;now+=16){
  while(next<=now){p.push({state:state(next),at:next});next+=300;}
  const s=p.sample(now)!;assert(s.delayMs>=300&&s.delayMs<=1000);
  if(prior&&now>2000){const rate=Number(s.target-prior.target)/1000/(now-prior.now);assert(rate>=.98&&rate<=1.0201,`rate ${rate}`);}
  prior={target:s.target,now};
 }
});

test('one late delivery on a 500 ms stream does not cause a half-second slideshow',()=>{
 const p=new SpectatorPlayout();let next=0,prior=0n,held=0,worst=0;
 for(let now=0;now<16000;now+=16){
  if(now>=next){p.push({state:state(next),at:next});next+=next===10000?1400:500;}
  const s=p.sample(now)!;
  if(now>3000){if(s.target===prior)held+=16;else{worst=Math.max(worst,held);held=0;}}
  prior=s.target;
 }
 assert(Math.max(worst,held)<=500,`A delayed delivery froze confirmed playout for ${Math.max(worst,held)} ms`);
});

test('a countdown cannot consume the spectator reserve before the first rally',()=>{
 const p=new SpectatorPlayout();p.push({state:state(0),at:0});
 for(let now=0;now<6000;now+=16)assert.equal(p.sample(now)!.target,0n);
 p.push({state:state(300),at:6300});
 assert.equal(p.sample(6300)!.target,0n,'Fill from actual game progress, not time spent counting down');
 let next=6600,prior=0n,held=0,worst=0;
 for(let now=6316;now<17000;now+=16){
  if(now>=next){p.push({state:state(next-6000),at:next});next+=next===10800?1340:300;}
  const current=p.sample(now)!.target;
  if(now>8000){if(current===prior)held+=16;else{worst=Math.max(worst,held);held=0;}}
  prior=current;
 }
 assert(Math.max(worst,held)<=500,`Reload delivery interruption froze spectator for ${Math.max(worst,held)} ms`);
});
