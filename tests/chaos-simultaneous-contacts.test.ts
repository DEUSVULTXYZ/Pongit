/**
 * Rules 8 in the TypeScript mirror (shared/physics-chaos-events.ts): every wall, paddle,
 * shield and goal plane a ball reaches in the microsecond a move ends in is resolved, not
 * only the tie-break winner. The cases are those of contracts/test/ChaosSimultaneousContacts.t.sol;
 * scripts/differential-chaos-events.ts checks the mirror against the contract itself.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {initialChaosEvents,advanceChaosEvents,CHAOS_P as P,CHAOS_LOG_STOP,CHAOS_LOG_CAPACITY,type ChaosPhysicsState,type ChaosPhysicsCollision} from '../shared/physics-chaos-events';
import {announceEffect} from '../shared/chaos-effects';

const T0=1_000_000n,VX=-232_320_000n,VY=-116_160_000n,REPLAY=13_470_000n,CROSS=219_525n;
const ceil=(n:bigint,d:bigint)=>n/d+(n%d?1n:0n);
const abs=(x:bigint)=>x<0n?-x:x;

/** One advance of zero length runs prepare(): it spawns Multiball's second ball. */
const settle=(s:ChaosPhysicsState)=>advanceChaosEvents(s,s.t,1)[0];
function single(){const s=initialChaosEvents(`0x${'00'.repeat(32)}`);s.t=T0;s.nextForce=T0;s.score={...s.score,a:1,rally:2};return s;}
function multiball(){let s=single();[s.effects]=announceEffect(s.effects,21,0,0,21,0);s=settle(s);assert(s.balls[1].alive);return s;}
function place(s:ChaosPhysicsState,i:number,x:bigint,y:bigint,vx:bigint,vy:bigint){Object.assign(s.balls[i],{x,y,vx,vy,lastHitter:1});}
function replay(){
 let s=initialChaosEvents(`0x${'00'.repeat(32)}`);[s.effects]=announceEffect(s.effects,21,0,0,1,10000);
 s.t=11_000_000n;s.nextForce=s.t;s=settle(s);assert(s.balls[1].alive);
 s.score={...s.score,a:1,rally:2};s.left=262n*P;s.t=REPLAY;s.nextForce=REPLAY;
 place(s,0,91n*P,261n*P,VX,VY);place(s,1,91n*P,305n*P,VX,VY);return s;
}
const at=(log:ChaosPhysicsCollision[],t:bigint)=>log.filter(c=>c.at===t).map(c=>`${c.ball}:${c.kind}`).sort();

for(const id of [1,7,9,11,12,23])for(const side of [0,1])for(const bottom of [false,true])for(const overshoot of [0n,1000n]){
 test(`boundary paddle reclamp: effect ${id}, side ${side}, bottom ${bottom}, overshoot ${overshoot}`,()=>{
  const s=single(),expires=id===7||id===9,oldHalf=expires?384n*P/10n:id===12?36n*P:48n*P;
  const newHalf=id===1||id===23?60n*P:id===11?56n*P:48n*P;
  s.left=s.right=bottom?576n*P-oldHalf:oldHalf;
  if(id===12){if(side===0)s.bettingA=72000000;else s.bettingB=72000000;}
  s.effects[0]={id,target:id>=12?2:side,remaining:0,serial:1,startsAt:expires?0:1200,expiresAt:expires?1200:12000,variant:0};
  const y=bottom?576n*P-newHalf*2n:newHalf*2n,reach=232_000_000n*200000n-overshoot;
  place(s,0,side===0?40n*P+reach:984n*P-reach,y,side===0?-232_000_000n:232_000_000n,0n);
  const [next,,log]=advanceChaosEvents(s,T0+300_000n,128);
  assert.deepEqual(at(log,T0+200_000n),[`1:${3+side}`]);
  assert.equal(next.score.a,1);assert.equal(next.score.b,0);
  assert.equal(side===0?next.left:next.right,bottom?576n*P-newHalf:newHalf);
  assert(side===0?next.balls[0].vx>0n:next.balls[0].vx<0n);
  const [first,,before]=advanceChaosEvents(s,T0+199_999n,128);
  const [split,,after]=advanceChaosEvents(first,T0+300_000n,128);
  assert.deepEqual(split,next,'splitting before the boundary keeps the physical state');
  assert.deepEqual([...before,...after],log);
 });
}

test('replay of 2026-09-18: both balls are returned by the paddle that covers them',()=>{
 const s=replay();
 for(const b of s.balls)assert(abs(b.y+VY*CROSS-s.left)<=54n*P);
 let [next,,log]=advanceChaosEvents(s,REPLAY+320_000n,128);
 assert.deepEqual(at(log,REPLAY+CROSS),['1:3','2:3']);assert(next.balls[0].vx>0n&&next.balls[1].vx>0n);
 [next]=advanceChaosEvents(next,REPLAY+630_000n,128);assert.equal(next.score.b,0);
});

test('opposite paddles, wall and paddle, a corner and opposite walls in one microsecond',()=>{
 let s=multiball();s.left=288n*P;s.right=288n*P;
 place(s,0,984n*P-200_000_000n*100000n+7n,288n*P,200_000_000n,0n);place(s,1,40n*P+200_000_000n*100000n-7n,288n*P,-200_000_000n,0n);
 let [next,,log]=advanceChaosEvents(s,T0+150_000n,128);
 assert.deepEqual(at(log,T0+100_000n),['1:4','2:3']);assert(next.balls[0].vx<0n&&next.balls[1].vx>0n);

 s=replay();s.balls[1].x=300n*P;s.balls[1].y=6n*P-VY*CROSS-7n;
 [next,,log]=advanceChaosEvents(s,REPLAY+320_000n,128);
 assert.deepEqual(at(log,REPLAY+CROSS),['1:3','2:1']);assert(next.balls[0].vx>0n&&next.balls[1].vy>0n);

 s=single();s.left=48n*P;place(s,0,60n*P-5n,16n*P-7n,-200_000_000n,-100_000_000n);
 [next,,log]=advanceChaosEvents(s,T0+150_000n,128);
 assert.deepEqual(log.map(c=>c.kind),[1,3]);assert(next.balls[0].vx>0n&&next.balls[0].vy>0n);

 s=multiball();place(s,0,500n*P,100n*P+5n,50_000_000n,-116_000_000n);place(s,1,500n*P,476n*P-5n,50_000_000n,116_000_000n);
 [next,,log]=advanceChaosEvents(s,T0+1_000_000n,128);
 assert.deepEqual(log.map(c=>c.kind),[1,2]);assert.equal(log[0].at,log[1].at);assert(next.balls[1].y<=570n*P);
});

test('contacts due exactly on a force tick or an effect boundary',()=>{
 let s=single();[s.effects]=announceEffect(s.effects,17,0,0,17,0);s.left=288n*P;
 place(s,0,40n*P+232_000_000n*200000n-1000n,288n*P,-232_000_000n,0n);
 let [next,,log]=advanceChaosEvents(s,T0+300_000n,128);
 assert.deepEqual(log.map(c=>[c.kind,c.at]),[[3,T0+200_000n]]);assert(next.balls[0].vx>0n);

 s=single();[s.effects]=announceEffect(s.effects,17,0,0,17,0);
 place(s,0,-6n*P+232_000_000n*190000n-1000n,288n*P,-232_000_000n,0n);
 [next]=advanceChaosEvents(s,T0+300_000n,128);
 assert.equal(next.score.b,1,'the goal on a tick scores');assert.equal(next.cancelled,false);assert.equal(next.score.rally,3);

 s=single();s.left=288n*P;[s.effects]=announceEffect(s.effects,22,0,0,22,Number((T0+200_000n)/1000n)-1000);
 place(s,0,40n*P+232_000_000n*200000n-1000n,288n*P,-232_000_000n,0n);
 [next,,log]=advanceChaosEvents(s,T0+300_000n,128);
 assert.deepEqual(log.map(c=>[c.kind,c.at]),[[3,T0+200_000n]]);

 s=single();s.t=20_000_000n;s.nextForce=s.t;[s.effects]=announceEffect(s.effects,3,0,0,3,20_100-13_000);
 place(s,0,16n*P+232_000_000n*100000n-1000n,288n*P,-232_000_000n,0n);assert.equal(BigInt(s.effects[0].expiresAt)*1000n,s.t+100_000n);
 [next]=advanceChaosEvents(s,s.t+300_000n,128);assert.equal(next.cancelled,false);assert.equal(next.score.b,1,'an expired shield saves nothing');
});

test('guards: one shield charge, misses, and obstacles that still act once',()=>{
 let s=replay();[s.effects]=announceEffect(s.effects,3,0,0,2,12000);s.left=500n*P;
 let [next,,log]=advanceChaosEvents(s,14_100_000n,128);
 assert.equal(next.cancelled,false);assert.equal(next.score.b,1);assert.deepEqual(log.map(c=>c.kind),[7]);

 s=replay();s.left=330n*P;[next,,log]=advanceChaosEvents(s,REPLAY+320_000n,128);
 assert.deepEqual(at(log,REPLAY+CROSS),['2:3']);assert(next.balls[0].vx<0n&&next.balls[1].vx>0n);

 s=replay();s.left=200n*P;[next]=advanceChaosEvents(s,14_100_000n,128);assert.equal(next.score.b,1);

 s=multiball();[s.effects]=announceEffect(s.effects,19,0,0,19,0);
 place(s,0,400n*P,283n*P,-VX,0n);place(s,1,400n*P,293n*P,-VX,0n);
 [next,,log]=advanceChaosEvents(s,T0+500_000n,128);
 assert.equal(next.cancelled,false);assert.deepEqual(log.map(c=>c.kind),[16]);assert.equal(next.effects[1].remaining,5);
});

test('controls: nothing else due in the microsecond',()=>{
 let s=replay();s.balls[0].x=500n*P;s.balls[0].vx=-VX;
 let [,,log]=advanceChaosEvents(s,REPLAY+700_000n,128);assert.deepEqual(at(log,REPLAY+CROSS),['2:3']);
 s=replay();for(const b of s.balls)b.x=40n*P-VX*CROSS;
 let next;[next,,log]=advanceChaosEvents(s,REPLAY+320_000n,128);
 assert.equal(log.length,2,'an exact landing is found at dt=0, as in rules 6');assert.equal(log[1].at,log[0].at);assert(next.balls[1].vx>0n);
 s=replay();s.balls[1].x-=VX;[,,log]=advanceChaosEvents(s,REPLAY+320_000n,128);
 assert.equal(log.length,2);assert.equal(log[1].at,log[0].at+1n);
});

test('a full microsecond after seven collisions fits the log: 7 + 4 = 11',()=>{
 assert.equal(CHAOS_LOG_STOP,8);assert.equal(CHAOS_LOG_CAPACITY,13);
 const s=multiball();s.left=528n*P;const v=5_003_000_000n,time=ceil(294n*P,v)+7n*ceil(564n*P,v);
 place(s,0,40n*P+200_000_000n*time-3n,300n*P,-200_000_000n,-v);
 place(s,1,40n*P+150_000_000n*time-5n,570n*P-100_000_000n*time+7n,-150_000_000n,100_000_000n);
 const [next,,log]=advanceChaosEvents(s,T0+time+100_000n,128);
 assert.equal(log.length,11);assert.deepEqual(log.slice(7).map(c=>`${c.ball}:${c.kind}`),['1:2','2:2','1:3','2:3']);
 assert(log.slice(7).every(c=>c.at===T0+time));assert.equal(next.t,T0+time);
 assert.deepEqual(log.map(c=>c.sequence),Array.from({length:11},(_,i)=>i+1));
});

test('300 lockstep Multiball arrivals at a covering paddle: no ball passes',()=>{
 let seed=0x9e3779b9;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 const fold=(y:bigint)=>{const l=564n*P;let u=(y-6n*P)%(2n*l);if(u<0n)u+=2n*l;return 6n*P+(u<=l?u:2n*l-u);};
 let covered=0,through=0;
 for(let i=0;i<300;i++){
  let s=initialChaosEvents(`0x${rnd().toString(16).padStart(64,'0')}`);[s.effects]=announceEffect(s.effects,21,0,0,1,0);s.t=T0;s.nextForce=T0;
  place(s,0,BigInt(100+rnd()%824)*P+BigInt(rnd())*1000n,BigInt(10+rnd()%557)*P,BigInt(150+rnd()%450)*1_000_000n*(rnd()%2?1n:-1n),BigInt(20+rnd()%400)*1_000_000n*(rnd()%2?1n:-1n));
  s=settle(s);const b=s.balls[0],left=b.vx<0n,gap=left?b.x-40n*P:984n*P-b.x,dt=ceil(gap,abs(b.vx));
  const y0=fold(b.y+b.vy*dt),y1=fold(b.y-b.vy*dt);let centre=(y0+y1)/2n;centre=centre<48n*P?48n*P:centre>528n*P?528n*P:centre;
  if(abs(y0-centre)>50n*P||abs(y1-centre)>50n*P)continue;
  covered++;if(left)s.left=centre;else s.right=centre;
  let o=s,complete=false;for(let n=0;n<16&&!complete;n++)[o,complete]=advanceChaosEvents(o,s.t+dt+50_000n,256);
  for(const x of o.balls)if(x.alive&&(left?x.vx<0n&&x.x<40n*P:x.vx>0n&&x.x>984n*P))through++;
 }
 assert(covered>50,`covered ${covered}`);assert.equal(through,0);
});
