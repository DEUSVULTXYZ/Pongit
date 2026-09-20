import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceChaosEvents,initialChaosEvents,CHAOS_P as P,type ChaosPhysicsState} from '../shared/physics-chaos-events';
import {chaosContactResolution} from '../shared/chaos-rules';
const seed=('0x'+'0'.repeat(64)) as `0x${string}`;
function base(){const s=initialChaosEvents(seed);s.t=1_000_000n;s.nextForce=s.t;return s;}
function place(s:ChaosPhysicsState,i:number,x:bigint,vx:bigint,y=288n*P){Object.assign(s.balls[i],{x,y,vx,vy:0n,alive:true,powerN:1,powerD:1,lastHitter:0});}
test('a multiball retired on the contact boundary cannot spend the player charge',()=>{
 const s=base();s.effects=[{id:21,target:2,remaining:0,serial:1,startsAt:0,expiresAt:1200,variant:0},
  {id:4,target:0,remaining:1,serial:2,startsAt:0,expiresAt:9000,variant:0}];s.activeMask=(1<<20)|(1<<3);
 place(s,0,512n*P,100_000_000n);place(s,1,40n*P+232_000_000n*200_000n-1000n,-232_000_000n);
 const [next,,log]=advanceChaosEvents(s,1_200_000n,128,false,chaosContactResolution(11));
 assert.equal(next.balls[1].alive,false);assert.equal(next.effects[1].id,4);assert(!log.some(x=>x.ball===2));
 for(const version of [14,15]){
  const [reusable,,events]=advanceChaosEvents(s,1_200_000n,128,false,chaosContactResolution(version));
  assert.deepEqual(reusable,next,`rules ${version} must use the deployed collision kernel`);assert.deepEqual(events,log);
 }
 const [old]=advanceChaosEvents(s,1_200_000n,128,false,true);assert.equal(old.effects[1].id,0,'negative control: the previous candidate spent the charge');
});
test('Hot Potato opposite simultaneous contacts preserve either prior holder',()=>{
 for(const holder of [0,1])for(const overshoot of [0n,1000n]){
  const s=base();s.effects=[{id:21,target:2,remaining:0,serial:1,startsAt:0,expiresAt:12000,variant:0},
   {id:10,target:holder,remaining:0,serial:2,startsAt:0,expiresAt:7000,variant:0}];s.activeMask=(1<<20)|(1<<9);
  place(s,0,40n*P+232_000_000n*200_000n-overshoot,-232_000_000n);
  place(s,1,984n*P-232_000_000n*200_000n+overshoot,232_000_000n);
  const [next,,log]=advanceChaosEvents(s,1_250_000n,128);
  assert.equal(next.effects[1].target,holder);assert.equal(log.filter(x=>x.kind===3||x.kind===4).length,2);
 }
});
test('brick contact on a force-grid microsecond reflects and consumes exactly once',()=>{
 const s=base();s.effects=[{id:17,target:2,remaining:0,serial:1,startsAt:0,expiresAt:9000,variant:0},
  {id:19,target:2,remaining:7,serial:2,startsAt:0,expiresAt:12000,variant:0}];s.activeMask=(1<<16)|(1<<18);
 place(s,0,478n*P-100_000_000n*200_000n+1000n,100_000_000n,200n*P);
 const [next,,log]=advanceChaosEvents(s,1_200_000n,128);
 assert(next.balls[0].vx<0n);assert.equal(next.effects[1].remaining,6);assert.equal(log.filter(x=>x.kind===15).length,1);
 const [old]=advanceChaosEvents(s,1_200_000n,128,false,true);assert(old.balls[0].vx>0n,'previous candidate lost the obstacle');
 const [cut,,first]=advanceChaosEvents(s,1_199_999n,128);const [split,,second]=advanceChaosEvents(cut,1_200_000n,128);
 assert.deepEqual(split,next);assert.deepEqual([...first,...second],log);
});
