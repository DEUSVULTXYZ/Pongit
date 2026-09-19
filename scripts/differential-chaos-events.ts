import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {toHex,type Address} from 'viem';
import {localChain} from './local-chain';
import {initialChaosEvents,advanceChaosEvents,CHAOS_P as P,type ChaosPhysicsState,type ChaosPhysicsCollision} from '../shared/physics-chaos-events';
import {announceEffect} from '../shared/chaos-effects';
import {chaosEvent} from '../shared/chaos-events';
assert.equal(process.env.PONG_CHAOS_PHYSICS_TEST,'isolated-vps');
// Random play, as before, plus cases built so that contacts share a microsecond with each
// other or with a force tick or an effect boundary: the rules-8 correction.
const count=Number(process.env.PONG_CHAOS_PHYSICS_CASES??10000);assert(Number.isInteger(count)&&count>=0&&count<=100000);
const ties=Number(process.env.PONG_CHAOS_TIE_CASES??10000);assert(Number.isInteger(ties)&&ties>=0&&ties<=100000&&count+ties>0);
// The mirror's rules-6 mode against the kernel deployed on 13 September 2026 (test/legacy copy).
const legacy=Number(process.env.PONG_CHAOS_LEGACY_CASES??4000);assert(Number.isInteger(legacy)&&legacy>=0&&legacy<=100000);
const chain=await localChain(),started=Date.now();
type Case={s:ChaosPhysicsState;target:bigint;budget:number;stop:boolean;family:string;at?:bigint;rules6?:boolean};
try{
 const artifacts=new Map<string,any>(),addresses=new Map<string,Address>();
 for(const [name,args] of [['ChaosEffects',[]],['ChaosModifiers',[]],['ChaosRally',[]],['ChaosDynamics',['ChaosEffects','ChaosModifiers']],['ChaosContacts',['ChaosDynamics']],['ChaosPhysics',['ChaosEffects','ChaosRally','ChaosDynamics','ChaosContacts']]] as const){
  const a=JSON.parse(await readFile(`contracts/out/${name}.sol/${name}.json`,'utf8'));artifacts.set(name,a);
  const receipt=await chain.publicClient.waitForTransactionReceipt({hash:await chain.wallet.deployContract({abi:a.abi,bytecode:a.bytecode.object,args:args.map(x=>addresses.get(x)!)} )});assert(receipt.contractAddress);addresses.set(name,receipt.contractAddress);
 }
 let seed=0x24c0ffee;const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 const pick=<X>(xs:readonly X[])=>xs[random()%xs.length];
 const budget=()=>[1,2,16,64,128,256,256,256][random()%8];
 const a=artifacts.get('ChaosPhysics'),address=addresses.get('ChaosPhysics')!;
 const old=JSON.parse(await readFile('contracts/out/ChaosPhysicsRules6.sol/ChaosPhysicsRules6.json','utf8'));
 const oldAddress=(await chain.publicClient.waitForTransactionReceipt({hash:await chain.wallet.deployContract({abi:old.abi,bytecode:old.bytecode.object,
  args:['ChaosEffects','ChaosRally','ChaosDynamics','ChaosContacts'].map(x=>addresses.get(x)!)})})).contractAddress!;
 function randomCase():Case{
  let s=initialChaosEvents(toHex(BigInt(random()),{size:32}),72000000+random()%24000001,72000000+random()%24000001);
  const first=random()%24+1,second=random()%24+1;
  [s.effects]=announceEffect(s.effects,first,random()%2,random(),1,0);
  if(second!==first)[s.effects]=announceEffect(s.effects,second,random()%2,random(),2,0);
  s.t=1000000n;s.nextForce=s.t;s.leftDir=random()%3-1;s.rightDir=random()%3-1;s.lastLeft=s.leftDir;s.lastRight=s.rightDir;
  s.balls[0].x=BigInt(20+random()%985)*P;s.balls[0].y=BigInt(10+random()%557)*P;
  s.balls[0].vx=BigInt(32+random()%6000)*1000000n*(random()%2?1n:-1n);s.balls[0].vy=BigInt(random()%800)*1000000n*(random()%2?1n:-1n);s.balls[0].lastHitter=random()%3;
  s.score.a=random()%7;s.score.b=random()%7;
  // Include partial budgets, zero-component trajectories, point boundaries and
  // states reached after forces/obstacles have already become active.
  if(random()%8===0)s.balls[0].vy=0n;
  if(random()%4===0)[s]=advanceChaosEvents(s,s.t+BigInt(random()%120000),256);
  return {s,target:s.t+BigInt(random()%250000),budget:[0,1,2,16,64,256][random()%6],stop:false,family:'random'};
 }
 // --- Simultaneous contacts -------------------------------------------------------
 const T0=1_000_000n,abs=(x:bigint)=>x<0n?-x:x,ceil=(n:bigint,d:bigint)=>n/d+(n%d?1n:0n);
 const settle=(s:ChaosPhysicsState)=>advanceChaosEvents(s,s.t,1)[0];
 const speed=(lo:number,hi:number)=>BigInt(lo+random()%(hi-lo))*1000000n+BigInt(random()%1000000);
 /** Overshoot past the plane after the move: exact landings too, now and then. */
 const over=(v:bigint)=>random()%8===0?0n:1n+BigInt(random())%(abs(v)-1n);
 function table(multi:boolean,extras:number[]){
  let s=initialChaosEvents(toHex(BigInt(random()),{size:32}),72000000+random()%24000001,72000000+random()%24000001);
  s.score={a:random()%7,b:random()%7,rally:2+random()%9,finished:false,winner:0};
  if(multi)[s.effects]=announceEffect(s.effects,21,0,0,1,0);
  for(const id of extras)if(!s.effects.some(e=>e.id===id)&&s.effects.some(e=>e.id===0))[s.effects]=announceEffect(s.effects,id,random()%2,random(),2,0);
  s.t=T0;s.nextForce=T0;s.leftDir=random()%3-1;s.rightDir=random()%3-1;s.lastLeft=s.leftDir;s.lastRight=s.rightDir;
  s.left=BigInt(48+random()%481)*P;s.right=BigInt(48+random()%481)*P;
  return settle(s);
 }
 /** Place ball i so that it reaches `plane` in the microsecond D (or exactly at D). */
 function aim(s:ChaosPhysicsState,i:number,plane:string,D:bigint){
  const b=s.balls[i];b.alive=true;b.powerN=1;b.powerD=1;b.lastHitter=random()%3;b.curveSteps=0;b.ghost=0;b.portalLock=false;
  b.x=BigInt(60+random()%905)*P;b.y=BigInt(20+random()%537)*P;b.vx=speed(100,1500)*(random()%2?1n:-1n);b.vy=speed(0,700)*(random()%2?1n:-1n);
  const x=(at:bigint,sign:bigint)=>{b.vx=sign*abs(b.vx);b.x=at-b.vx*D+(sign<0n?-1n:1n)*over(b.vx);};
  const y=(at:bigint,sign:bigint)=>{if(b.vy===0n)b.vy=1000000n;b.vy=sign*abs(b.vy);b.y=at-b.vy*D+(sign<0n?-1n:1n)*over(b.vy);};
  if(plane==='top')y(6n*P,-1n);else if(plane==='bottom')y(570n*P,1n);
  else if(plane==='left')x(40n*P,-1n);else if(plane==='right')x(984n*P,1n);
  else if(plane==='leftShield')x(16n*P,-1n);else if(plane==='rightShield')x(1008n*P,1n);
  else if(plane==='leftGoal')x(-6n*P,-1n);else x(1030n*P,1n);
  // Mostly make the contact real: a paddle that covers the ball there, a charged shield.
  if(random()%4===0)return;
  const side=plane.startsWith('left')?0:1,reach=b.y+b.vy*D,centre=reach<48n*P?48n*P:reach>528n*P?528n*P:reach;
  if(plane==='left')s.left=centre;if(plane==='right')s.right=centre;
  if(plane.endsWith('Shield')){
   const shield=s.effects.find(e=>e.id===3);
   if(shield)shield.target=side;else if(s.effects.some(e=>e.id===0))[s.effects]=announceEffect(s.effects,3,side,random(),4,Number(s.t/1000n)-1000);
  }
 }
 const planes=['top','bottom','left','right','leftShield','rightShield','leftGoal','rightGoal'];
 const extras=[3,3,17,19,20,22,23,24,4,5,6,7,8,9,10,11,12,13,14,15,16,18];
 function tieCase(n:number):Case{
  const kind=n%6;
  if(kind===0){// lockstep Multiball at a paddle, the paddle covering both, one or none
   const s=table(true,random()%2?[pick(extras)]:[]);const b=s.balls[0];
   // Within 250 ms of the paddle, so that a two-ball force grid stays inside an eth_call.
   b.y=BigInt(10+random()%557)*P;b.vx=speed(150,2000)*(random()%2?1n:-1n);b.vy=speed(0,600)*(random()%2?1n:-1n);
   const reach=abs(b.vx)*(1n+BigInt(random()%250000))-over(b.vx);b.x=b.vx<0n?40n*P+reach:984n*P-reach;
   Object.assign(s.balls[1],{...b,vy:-b.vy,trailRevision:b.trailRevision+1});
   const left=b.vx<0n,dt=ceil(left?b.x-40n*P:984n*P-b.x,abs(b.vx));const mid=(b.y+s.balls[1].y)/2n;
   const centre=mid<48n*P?48n*P:mid>528n*P?528n*P:mid;if(left)s.left=centre;else s.right=centre;
   return {s,target:s.t+dt+BigInt(random()%200000),budget:budget(),stop:random()%2===0,family:'lockstep',at:s.t+dt};
  }
  if(kind===1||kind===2){// two balls on independent planes, same microsecond
   const s=table(true,random()%2?[pick([3,3,20,22,17,19])]:[]);const D=1n+BigInt(random()%250000);
   const p0=pick(planes);let p1=pick(planes);if(kind===2&&p0===p1)p1=pick(planes);
   aim(s,0,p0,D);aim(s,1,p1,D);
   const target=random()%4===0?s.t+D:s.t+D+BigInt(random()%150000);
   return {s,target,budget:budget(),stop:random()%2===0,family:'two-planes',at:s.t+D};
  }
  if(kind===3){// one ball in a corner: a wall and a paddle, shield or goal plane
   const s=table(random()%2===0,random()%2?[pick([3,3,20,22])]:[]);const D=1n+BigInt(random()%250000);
   aim(s,0,pick(['left','right','leftShield','rightShield','leftGoal','rightGoal']),D);const b=s.balls[0];const xs={x:b.x,vx:b.vx};
   aim(s,0,random()%2?'top':'bottom',D);Object.assign(b,xs);if(s.balls[1].alive&&random()%2)aim(s,1,pick(planes),D);
   if(b.vx<0n)s.left=random()%2?48n*P:528n*P;else s.right=random()%2?48n*P:528n*P;
   return {s,target:s.t+D+BigInt(random()%150000),budget:budget(),stop:random()%2===0,family:'corner',at:s.t+D};
  }
  if(kind===4){// a contact due exactly on a force tick (wind, curve) or an effect boundary
   const grid=random()%3;const s=table(random()%4!==0,grid===0?[17]:[]);let D:bigint;
   if(grid<2){s.nextForce=s.t;D=10000n*BigInt(1+random()%25);}
   else{
    const id=pick([3,20,22,23,12,1,2]);[s.effects]=announceEffect(s.effects,id,random()%2,random(),3,0);
    const e=s.effects.find(x=>x.id===id)!;const edge=BigInt(random()%4===0?e.startsAt:e.expiresAt)*1000n;
    D=1n+BigInt(random()%200000);s.t=edge-D;s.nextForce=s.t;
   }
   // Wind bends y and a curve both axes: aim those at x planes, whose times still hold.
   const choices=grid===2?planes:planes.slice(2);
   aim(s,0,pick(choices),D);if(s.balls[1].alive)aim(s,1,pick(choices),random()%4?D:D+1n+BigInt(random()%1000));
   if(grid===1)for(const b of s.balls)if(b.alive){b.curveSteps=1+random()%150;b.curveSign=random()%2?1:-1;}
   return {s,target:s.t+D+BigInt(random()%100000),budget:budget(),stop:random()%2===0,family:'boundary',at:s.t+D};
  }
  // a full microsecond after seven wall bounces: the kernel's log capacity
  const s=table(true,[]);const v=speed(3000,9000),first=ceil(294n*P,v),period=ceil(564n*P,v),D=first+7n*period;
  s.left=pick([48n,288n,528n])*P;
  Object.assign(s.balls[0],{x:40n*P+200_000_000n*D-1n-BigInt(random()%1000),y:300n*P,vx:-200_000_000n,vy:-v,powerN:1,powerD:1,curveSteps:0});
  Object.assign(s.balls[1],{x:40n*P+150_000_000n*D-1n-BigInt(random()%1000),y:570n*P-100_000_000n*D+1n+BigInt(random()%1000),vx:-150_000_000n,vy:100_000_000n,powerN:1,powerD:1,curveSteps:0});
  return {s,target:s.t+D+BigInt(random()%50000),budget:pick([16,64,128,256]),stop:random()%2===0,family:'capacity',at:s.t+D};
 }
 const cases=[...Array.from({length:count},randomCase),...Array.from({length:ties},(_,n)=>tieCase(n)),
  ...Array.from({length:legacy},(_,n)=>{const c=n%2?tieCase(n>>1):randomCase();return {...c,family:'rules6:'+c.family,rules6:true};})];
 const coverage:Record<string,{cases:number;shared:number;atInstant:number;points:number;cancelled:number}>={};
 for(let batch=0;batch<cases.length;batch+=10){
  const slice=cases.slice(batch,batch+10);
  await Promise.all(slice.map(async(c,j)=>{
   const expected=advanceChaosEvents(c.s,c.target,c.budget,c.stop,c.rules6?false:'complete');
   const actual=await chain.publicClient.readContract({address:c.rules6?oldAddress:address,abi:a.abi,functionName:c.stop?'advanceUntilPoint':'advance',args:[c.s,c.target,c.budget]});
   try{assert.deepEqual(actual,expected,`Chaos ${c.family} case ${batch+j}`);}catch(e){await mkdir('artifacts/drand',{recursive:true});await writeFile('artifacts/drand/physics-mismatch.json',JSON.stringify({index:batch+j,...c,expected,actual},(_,v)=>typeof v==='bigint'?v.toString():v,2));throw e;}
   const log=expected[2] as ChaosPhysicsCollision[],r=coverage[c.family]??={cases:0,shared:0,atInstant:0,points:0,cancelled:0};
   r.cases++;if(log.some((x,i)=>log.some((y,k)=>k!==i&&y.at===x.at)))r.shared++;
   if(c.at!==undefined&&log.some(x=>x.at===c.at))r.atInstant++;
   if(expected[0].score.rally!==c.s.score.rally)r.points++;if(expected[0].cancelled)r.cancelled++;
  }));
  if(batch%1000===0)console.log(`Chaos event physics: ${batch+slice.length}/${cases.length}`);
 }
 const report={scope:'Current Chaos kernel (human rules 9, agent rules 10) against its TypeScript mirror, random play plus same-microsecond contacts; the mirror in rules-6 mode against the deployed rules-6 kernel',
  cases:cases.length,randomCases:count,simultaneousCases:ties,rules6Cases:legacy,mismatches:0,coverage,
  legend:{shared:'the returned log holds two collisions in one microsecond',atInstant:'a collision was logged in the constructed microsecond',points:'a point or result was scored'},
  ms:Date.now()-started,at:new Date().toISOString()};
 await mkdir('artifacts/drand',{recursive:true});await writeFile('artifacts/drand/physics-differential.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{chain.close();}
