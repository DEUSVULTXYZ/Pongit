import type {Hex} from 'viem';
import {abs,geometryCheck,integerSqrt,planeTime,circleHit,rectHit,reflectVelocity,rotateVelocity,normalize,vectorSpeed,NEVER} from './chaos-collision';
import {emptyEffects,expireEffects,activeEffect,effectPaddleHit,consumeShield,breakChaosBrick,collectChaosPickup,chaosPointValue,type EffectPair} from './chaos-effects';
import {chaosPaddles} from './chaos-modifiers';
import {resolveChaosGoals,type ChaosScore} from './chaos-rally';
export const CHAOS_P=1000000000000n;
const P=CHAOS_P,STEP=10000n,FIFTEEN=261799387799n;
export type ChaosBall={x:bigint;y:bigint;vx:bigint;vy:bigint;powerN:number;powerD:number;curveSteps:number;curveSign:number;
 lastHitter:number;ghost:number;portalLock:boolean;warp:boolean;gravity:boolean;gravityUsed:bigint;trailRevision:number;alive:boolean};
export type ChaosPhysicsState={balls:[ChaosBall,ChaosBall];effects:EffectPair;score:ChaosScore;left:bigint;right:bigint;leftDir:number;rightDir:number;lastLeft:number;lastRight:number;
 t:bigint;nextForce:bigint;activeMask:number;collisionSequence:number;bettingA:number;bettingB:number;seed:Hex;cancelled:boolean;cancelReason:number;stalled:number};
export type ChaosPhysicsCollision={sequence:number;rally:number;ball:number;kind:number;obstacle:number;at:bigint;x:bigint;y:bigint};
export type ChaosCandidate={dt:bigint;kind:number;ball:number;slot:number;obstacle:number;nx:bigint;ny:bigint};
/** Per ball: [wall (kind 1|2), paddle (3|4), shield (7|8)] contact times, NEVER when not approached. */
export type ChaosPlanes=[[bigint,bigint,bigint],[bigint,bigint,bigint]];
/** Current ChaosPhysics: stop after 8 collisions; the final batch holds at most 24 contacts. */
export const CHAOS_LOG_STOP=8,CHAOS_LOG_CAPACITY=31;
const emptyBall=():ChaosBall=>({x:0n,y:0n,vx:0n,vy:0n,powerN:0,powerD:0,curveSteps:0,curveSign:0,lastHitter:0,ghost:0,portalLock:false,warp:false,gravity:false,gravityUsed:0n,trailRevision:0,alive:false});
function has(s:ChaosPhysicsState,id:number){return s.effects.some(e=>e.id===id&&activeEffect(e,Number(s.t/1000n)));}
function variant(s:ChaosPhysicsState,id:number){return s.effects.find(e=>e.id===id)?.variant||0;}
function paddles(s:ChaosPhysicsState){return chaosPaddles(BigInt(s.bettingA),BigInt(s.bettingB),s.effects.map(e=>({...e,startsAt:BigInt(e.startsAt),expiresAt:BigInt(e.expiresAt),consumed:false})) as any,s.t/1000n);}
const outer=(height:bigint,split:boolean)=>(height+(split?16000000n:0n))*1000000n/2n;
const clamp=(y:bigint,half:bigint)=>y<half?half:y>576n*P-half?576n*P-half:y;
function inside(x:bigint,y:bigint,cx:bigint,cy:bigint,r:bigint){const dx=x-cx,dy=y-cy;return dx*dx+dy*dy<=r*r;}
function portal(v:number,i:number):[bigint,bigint]{return[i===0?320n*P:704n*P,(v&1)===i?180n*P:396n*P];}
const brickY=(i:number)=>BigInt(200+88*i)*P;
function overlap(s:ChaosPhysicsState,b:ChaosBall,bit:number){
 if(bit===0)return has(s,13)&&inside(b.x,b.y,512n*P,288n*P,34n*P);
 if(bit===1||bit===2){const [x,y]=portal(variant(s,14),bit-1);return has(s,14)&&inside(b.x,b.y,x,y,24n*P);}
 if(bit===3){if(!has(s,18))return false;const dx=b.x-512n*P,dy=b.y-288n*P,sign=(variant(s,18)&1)===0?-1n:1n;
  const u=dx+sign*dy,v=-sign*dx+dy,tip=44n*1414213562373n,nearest=u< -tip?-tip:u>tip?tip:u;return inside(u,v,nearest,0n,10n*1414213562373n);}
 if(bit>=4&&bit<=6)return has(s,19)&&abs(b.x-512n*P)<=34n*P&&abs(b.y-brickY(bit-4))<=14n*P;
 if(bit===7)return has(s,24)&&inside(b.x,b.y,512n*P,120n*P,22n*P);return false;
}
function factors(s:ChaosPhysicsState,b:ChaosBall):[bigint,bigint]{let n=BigInt(b.powerN),d=BigInt(b.powerD);if(n===0n||d===0n)throw Error('Numeric range');if(has(s,23)){n*=5n;d*=4n;}if(b.warp&&has(s,15)){n*=6n;d*=5n;}return[n,d];}
function velocity(s:ChaosPhysicsState,ball:number):[bigint,bigint]{const b=s.balls[ball],[n,d]=factors(s,b),vx=b.vx*n/d,vy=b.vy*n/d;geometryCheck(b.x,b.y,vx,vy);return[vx,vy];}
function move(s:ChaosPhysicsState,to:bigint){
 if(to<s.t)throw Error('Numeric range');if(to>s.t)s.stalled=0;const dt=to-s.t,ps=paddles(s);
 for(let i=0;i<2;i++)if(s.balls[i].alive){const [vx,vy]=velocity(s,i),b=s.balls[i];b.x+=vx*dt;b.y+=vy*dt;geometryCheck(b.x,b.y,vx,vy);}
 s.left=clamp(s.left+BigInt(s.leftDir)*ps.speedA*dt,outer(ps.heightA,ps.splitA));s.right=clamp(s.right+BigInt(s.rightDir)*ps.speedB*dt,outer(ps.heightB,ps.splitB));s.t=to;
}
function prepare(s:ChaosPhysicsState){
 let mask=0;for(const e of s.effects)if(activeEffect(e,Number(s.t/1000n)))mask|=1<<(e.id-1);const born=mask&~s.activeMask;
 if(born&(1<<20)){s.balls[1]=structuredClone(s.balls[0]);s.balls[1].vy=-s.balls[0].vy;s.balls[1].alive=true;s.balls[1].trailRevision++;}
 if((mask&(1<<20))===0)s.balls[1].alive=false;
 for(let ball=0;ball<2;ball++)if(s.balls[ball].alive){const b=s.balls[ball];
  for(let bit=0;bit<8;bit++){const id=bit===0?13:bit<3?14:bit===3?18:bit<7?19:24,covered=overlap(s,b,bit);
   if(((born&(1<<(id-1)))!==0||ball===1&&(born&(1<<20))!==0)&&covered)b.ghost|=1<<bit;else if(!covered)b.ghost&=~(1<<bit);}
  if(!has(s,14)||!overlap(s,b,1)&&!overlap(s,b,2))b.portalLock=false;
  b.warp=has(s,15)&&(b.x>480n*P&&b.x<544n*P||b.x===480n*P&&(b.vx>0n||b.vx===0n&&b.warp)||b.x===544n*P&&(b.vx<0n||b.vx===0n&&b.warp));
  const gx=b.x-512n*P,gy=b.y-288n*P,distance2=gx*gx+gy*gy,radius2=160n*P*160n*P;
  const grav=has(s,16)&&(distance2<radius2||distance2===radius2&&gx*b.vx+gy*b.vy<0n);if(!grav||!b.gravity)b.gravityUsed=0n;b.gravity=grav;
 }
 s.activeMask=mask;const ps=paddles(s);s.left=clamp(s.left,outer(ps.heightA,ps.splitA));s.right=clamp(s.right,outer(ps.heightB,ps.splitB));[s.effects]=expireEffects(s.effects,Number(s.t/1000n));
}
function needsGrid(s:ChaosPhysicsState){const wind=has(s,17),well=has(s,16);return s.balls.some(b=>b.alive&&(wind||b.curveSteps!==0||well&&b.gravity));}
function force(s:ChaosPhysicsState){
 if(s.nextForce!==s.t)throw Error('Numeric range');s.nextForce+=STEP;
 for(const b of s.balls)if(b.alive){
  if(b.curveSteps!==0){const previous=BigInt(150-b.curveSteps),angle=((previous+1n)*349065850399n/150n-previous*349065850399n/150n)*BigInt(b.curveSign);[b.vx,b.vy]=rotateVelocity(b.vx,b.vy,angle);b.curveSteps--;}
  if(has(s,16)&&b.gravity&&b.gravityUsed<FIFTEEN){const dx=512n*P-b.x,dy=288n*P-b.y,distance=integerSqrt(dx*dx+dy*dy),remaining=FIFTEEN-b.gravityUsed;
   let bend=FIFTEEN*(160n*P-distance)/(160n*P)/100n;if(bend>remaining)bend=remaining;const cross=b.vx*dy-b.vy*dx;
   if(cross!==0n&&bend!==0n){[b.vx,b.vy]=rotateVelocity(b.vx,b.vy,cross<0n?-bend:bend);b.gravityUsed+=bend;}}
  if(has(s,17)){const [n,d]=factors(s,b),acceleration=240000n*d/n;b.vy+=(variant(s,17)&1)===0?-acceleration:acceleration;}
  geometryCheck(b.x,b.y,b.vx,b.vy);
 }
}
function offer(best:ChaosCandidate,dt:bigint,kind:number,ball:number,slot=0,obstacle=0,nx=0n,ny=0n):ChaosCandidate{
 return dt<best.dt||dt===best.dt&&(kind<best.kind||kind===best.kind&&ball<best.ball)?{dt,kind,ball,slot,obstacle,nx,ny}:best;
}
function deflector(x:bigint,y:bigint,vx:bigint,vy:bigint,variant:number){
 const sign=(variant&1)===0?-1n:1n,dx=x-512n*P,dy=y-288n*P,u=dx+sign*dy,v=-sign*dx+dy,vu=vx+sign*vy,vv=-sign*vx+vy,length=44n*1414213562373n,radius=10n*1414213562373n;
 let h=rectHit(u,v,vu,vv,length,radius);
 for(let tip=0;tip<2;tip++){const end=circleHit(u+(tip===0?length:-length),v,vu,vv,radius);if(end.dt<h.dt)h=end;}
 return {...h,nx:h.nx-sign*h.ny,ny:sign*h.nx+h.ny};
}
export function nextContact(s:ChaosPhysicsState,tied?:ChaosCandidate[]):[ChaosCandidate,[bigint,bigint],[number,number],ChaosPlanes]{
 const take=(best:ChaosCandidate,dt:bigint,kind:number,ball:number,slot=0,obstacle=0,nx=0n,ny=0n)=>{
  if(tied&&dt!==NEVER&&dt<=best.dt){if(dt<best.dt)tied.length=0;tied.push({dt,kind,ball,slot,obstacle,nx,ny});}
  return offer(best,dt,kind,ball,slot,obstacle,nx,ny);
 };
 let best:ChaosCandidate={dt:NEVER,kind:255,ball:0,slot:0,obstacle:0,nx:0n,ny:0n};const goals:[bigint,bigint]=[NEVER,NEVER],beneficiaries:[number,number]=[0,0];
 const planes:ChaosPlanes=[[NEVER,NEVER,NEVER],[NEVER,NEVER,NEVER]];
 for(let ball=0;ball<2;ball++)if(s.balls[ball].alive){const b=s.balls[ball],[vx,vy]=velocity(s,ball),plane=planes[ball];
  if(vx!==0n){goals[ball]=planeTime(b.x,vx,vx<0n?-6n*P:1030n*P);beneficiaries[ball]=vx<0n?2:1;best=take(best,goals[ball],vx<0n?5:6,ball);
   if(vx<0n&&b.x>=40n*P){plane[1]=planeTime(b.x,vx,40n*P);best=take(best,plane[1],3,ball,0,0,1n,0n);}
   if(vx>0n&&b.x<=984n*P){plane[1]=planeTime(b.x,vx,984n*P);best=take(best,plane[1],4,ball,0,0,-1n,0n);}}
  if(vy!==0n){plane[0]=planeTime(b.y,vy,vy<0n?6n*P:570n*P);best=take(best,plane[0],vy<0n?1:2,ball,0,0,0n,vy<0n?1n:-1n);}
  for(let slot=0;slot<2;slot++){const e=s.effects[slot];if(!activeEffect(e,Number(s.t/1000n)))continue;
   if(e.id===3){if(e.target===0&&vx<0n&&b.x>=16n*P){plane[2]=planeTime(b.x,vx,16n*P);best=take(best,plane[2],7,ball,slot,0,1n,0n);}if(e.target===1&&vx>0n&&b.x<=1008n*P){plane[2]=planeTime(b.x,vx,1008n*P);best=take(best,plane[2],8,ball,slot,0,-1n,0n);}}
   else if(e.id===13&&(b.ghost&1)===0){const h=circleHit(b.x-512n*P,b.y-288n*P,vx,vy,34n*P);best=take(best,h.dt,9,ball,slot,0,h.nx,h.ny);}
   else if(e.id===14){for(let i=0;i<2;i++){const [x,y]=portal(e.variant,i),leaving=(b.portalLock||(b.ghost&(1<<(i+1)))!==0)&&inside(b.x,b.y,x,y,24n*P);
    if(!b.portalLock&&(b.ghost&(1<<(i+1)))===0||leaving){const h=circleHit(b.x-x,b.y-y,vx,vy,24n*P,leaving);best=take(best,h.dt,leaving?19:10+i,ball,slot,i,h.nx,h.ny);}}}
   else if(e.id===15){let dt=NEVER;if(b.warp&&vx!==0n)dt=planeTime(b.x,vx,vx>0n?544n*P:480n*P);else if(vx>0n&&b.x<480n*P)dt=planeTime(b.x,vx,480n*P);else if(vx<0n&&b.x>544n*P)dt=planeTime(b.x,vx,544n*P);best=take(best,dt,12,ball,slot);}
   else if(e.id===16){const h=circleHit(b.x-512n*P,b.y-288n*P,vx,vy,160n*P,b.gravity);best=take(best,h.dt,13,ball,slot,0,h.nx,h.ny);}
   else if(e.id===18&&(b.ghost&8)===0){const h=deflector(b.x,b.y,vx,vy,e.variant);best=take(best,h.dt,14,ball,slot,0,h.nx,h.ny);}
   else if(e.id===19){for(let i=0;i<3;i++)if((e.remaining&(1<<i))!==0&&(b.ghost&(1<<(i+4)))===0){const h=rectHit(b.x-512n*P,b.y-brickY(i),vx,vy,34n*P,14n*P);best=take(best,h.dt,15+i,ball,slot,i,h.nx,h.ny);}}
   else if(e.id===24&&b.lastHitter<=1&&(b.ghost&128)===0){const h=circleHit(b.x-512n*P,b.y-120n*P,vx,vy,22n*P);best=take(best,h.dt,18,ball,slot,0,h.nx,h.ny);}
  }
 }
 tied?.sort((a,b)=>a.kind-b.kind||a.ball-b.ball);return[best,goals,beneficiaries,planes];
}
function serve(s:ChaosPhysicsState){
 s.balls=[emptyBall(),emptyBall()];s.effects=emptyEffects();s.activeMask=0;
 s.balls[0]={...emptyBall(),x:512n*P,y:288n*P,vx:s.score.rally%2===1?192000000n:-192000000n,
  vy:((BigInt(s.seed)>>BigInt((s.score.rally-1)%256))&1n)===0n?96000000n:-96000000n,powerN:1,powerD:1,alive:true,lastHitter:2};
}
export function initialChaosEvents(seed:Hex,bettingA=96000000,bettingB=96000000):ChaosPhysicsState{
 const s:ChaosPhysicsState={balls:[emptyBall(),emptyBall()],effects:emptyEffects(),score:{a:0,b:0,rally:1,finished:false,winner:0},left:288n*P,right:288n*P,
  leftDir:0,rightDir:0,lastLeft:0,lastRight:0,t:0n,nextForce:0n,activeMask:0,collisionSequence:0,bettingA,bettingB,seed,cancelled:false,cancelReason:0,stalled:0};serve(s);return s;
}
function sign(x:bigint){return x<0n?-1n:x>0n?1n:0n;}
function collideEffect(s:ChaosPhysicsState,h:ChaosCandidate,reclamp=true){
 const b=s.balls[h.ball],k=h.kind;let physical=false;
 if(k<=2||k===7||k===8||k===9||k===14||k>=15&&k<=17){b.powerN=1;b.powerD=1;physical=true;}
 if(k===1||k===2){b.y=k===1?6n*P:570n*P;b.vy=-b.vy;if(has(s,20)){const speed=vectorSpeed(b.vx,b.vy);[b.vx,b.vy]=normalize(b.vx,b.vy*5n/4n,speed);}}
 else if(k===3||k===4){
  const side=k===3?0:1,ps=paddles(s),height=side===0?ps.heightA:ps.heightB,split=side===0?ps.splitA:ps.splitB;
  const priorCentre=side===0?s.left:s.right,centre=reclamp?clamp(priorCentre,outer(height,split)):priorCentre,solid=height*1000000n,delta=b.y-centre;
  if(reclamp){if(side===0)s.left=centre;else s.right=centre;}
  const touches=split?(delta+6n*P>=-8n*P-solid/2n&&delta-6n*P<=-8n*P)||(delta+6n*P>=8n*P&&delta-6n*P<=8n*P+solid/2n):abs(delta)<=solid/2n+6n*P;
  if(touches){b.powerN=1;b.powerD=1;physical=true;b.vx=-b.vx*11n/10n;b.vy=b.vy*11n/10n;b.lastHitter=side;
   const [effects,shot]=effectPaddleHit(s.effects,side,side===0?s.lastLeft:s.lastRight,b.vy,abs(delta)<=solid/8n,Number(s.t/1000n));s.effects=effects;
   b.powerN=shot.numerator;b.powerD=shot.denominator;if(shot.curveSign!==0){b.curveSteps=150;b.curveSign=shot.curveSign;}
  }else{physical=false;b.x+=b.vx<0n?-1n:1n;}
 }else if(k===7||k===8){const [effects,saved]=consumeShield(s.effects,k===7?0:1,Number(s.t/1000n));if(!saved)throw Error('Numeric range');s.effects=effects;b.vx=-b.vx;}
 else if(k===9||k===14||k>=15&&k<=17){[b.vx,b.vy]=reflectVelocity(b.vx,b.vy,h.nx,h.ny);if(k>=15&&k<=17)s.effects=breakChaosBrick(s.effects,h.slot,h.obstacle,Number(s.t/1000n));b.x+=sign(h.nx);b.y+=sign(h.ny);}
 else if(k===10||k===11){const v=s.effects[h.slot].variant,[fromX,fromY]=portal(v,h.obstacle),[toX,toY]=portal(v,1-h.obstacle);b.x=toX+b.x-fromX;b.y=toY+b.y-fromY;b.portalLock=true;b.trailRevision++;}
 else if(k===12)b.warp=!b.warp;
 else if(k===13){b.gravity=!b.gravity;b.gravityUsed=0n;}
 else if(k===18)[s.effects]=collectChaosPickup(s.effects,h.slot,b.lastHitter,Number(s.t/1000n));
 else if(k===19){b.portalLock=false;b.ghost&=~6;b.x+=sign(h.nx);b.y+=sign(h.ny);}
 geometryCheck(b.x,b.y,b.vx,b.vy);return physical;
}
function point(s:ChaosPhysicsState,goalsMask:number){
 if(s.score.rally>=0xffffffff)throw Error('Numeric range');[s.score]=resolveChaosGoals(s.score,goalsMask,chaosPointValue(s.effects,Number(s.t/1000n))===2);
 if(s.score.finished){s.effects=emptyEffects();s.balls=[emptyBall(),emptyBall()];s.activeMask=0;}else serve(s);
}
function shielded(s:ChaosPhysicsState,side:number){return s.effects.some(e=>e.id===3&&e.target===side&&activeEffect(e,Number(s.t/1000n)));}
/** Rules 8, as ChaosPhysics.sweep: every wall, paddle and shield contact due in the
 * microsecond a move ended in, which the ceiling carried strictly past its plane, in
 * (kind, ball) order while the ball still heads into it; `hit`, already resolved, is
 * skipped (kind 0 skips nothing). An exact landing stays with the next step's dt=0
 * contact, as in rules 6. */
function sweep(s:ChaosPhysicsState,planes:ChaosPlanes,hit:ChaosCandidate,log:ChaosPhysicsCollision[]){
 for(const kind of [1,2,3,4,7,8])for(let i=0;i<2;i++){
  const b=s.balls[i];if(kind===hit.kind&&i===hit.ball||!b.alive||planes[i][kind<3?0:kind<5?1:2]!==hit.dt)continue;
  if(!(kind===1?b.vy<0n&&b.y<6n*P:kind===2?b.vy>0n&&b.y>570n*P:kind===3?b.vx<0n&&b.x<40n*P:kind===4?b.vx>0n&&b.x>984n*P
   :kind===7?b.vx<0n&&b.x<16n*P&&shielded(s,0):b.vx>0n&&b.x>1008n*P&&shielded(s,1)))continue;
  if(collideEffect(s,{dt:hit.dt,kind,ball:i,slot:0,obstacle:0,nx:0n,ny:0n})){s.collisionSequence++;if(s.collisionSequence>0xffffffff)throw Error('Numeric range');
   log.push({sequence:s.collisionSequence,rally:s.score.rally,ball:i+1,kind,obstacle:0,at:s.t,x:s.balls[i].x,y:s.balls[i].y});}
 }
}
function resolveBatch(s:ChaosPhysicsState,tied:ChaosCandidate[],searched:EffectPair,boundary:boolean,log:ChaosPhysicsCollision[]){
 const before=structuredClone(s.effects);let paddleMask=0,teleported=0;
 for(const h of tied){const k=h.kind,b=s.balls[h.ball];
  if(!b.alive||(teleported&(1<<h.ball))!==0||k===5||k===6)continue;
  if(k===1&&!(b.vy<0n&&b.y<=6n*P)||k===2&&!(b.vy>0n&&b.y>=570n*P)||k===3&&!(b.vx<0n&&b.x<=40n*P)||k===4&&!(b.vx>0n&&b.x>=984n*P))continue;
  if(k>=7){const e=s.effects[h.slot];
   if(!e.id||e.id!==searched[h.slot].id||e.serial!==searched[h.slot].serial||!activeEffect(e,Number(s.t/1000n)))continue;
   if(k===7&&!(b.vx<0n&&b.x<=16n*P&&shielded(s,0))||k===8&&!(b.vx>0n&&b.x>=1008n*P&&shielded(s,1)))continue;
   if(k===9&&(b.ghost&1)!==0||k===14&&(b.ghost&8)!==0||k>=15&&k<=17&&((b.ghost&(1<<(h.obstacle+4)))!==0||(e.remaining&(1<<h.obstacle))===0))continue;
   if((k===9||k===14||k>=15&&k<=17)&&b.vx*h.nx+b.vy*h.ny>=0n)continue;
   if((k===10||k===11)&&(b.portalLock||(b.ghost&(1<<(h.obstacle+1)))!==0))continue;
   if(k===18&&(b.lastHitter>1||(b.ghost&128)!==0))continue;
   if(boundary&&(k===12||k===13||k===19))continue;
  }
  const physical=collideEffect(s,h);
  if(k===10||k===11)teleported|=1<<h.ball;
  if(physical){if(k===3||k===4)paddleMask|=1<<(k-3);s.collisionSequence++;
   if(s.collisionSequence>0xffffffff)throw Error('Numeric range');
   log.push({sequence:s.collisionSequence,rally:s.score.rally,ball:h.ball+1,kind:k,obstacle:h.obstacle,at:s.t,x:s.balls[h.ball].x,y:s.balls[h.ball].y});}
 }
 if(paddleMask===3)for(let i=0;i<2;i++)if(before[i].id===10&&s.effects[i].id===10&&before[i].serial===s.effects[i].serial)s.effects[i].target=before[i].target;
}
export type ChaosContactResolution=boolean|'complete';
/** The rules-8 kernel by default. `everyContact=false` reproduces the rules-6 kernel deployed on
 * 13 September 2026 (still linked by the Agent Arcade), which resolved only the tie-break winner
 * of a microsecond: shared/chaos-rules.ts chooses by an application's RULES_VERSION. */
export function advanceChaosEvents(source:ChaosPhysicsState,target:bigint,budget=128,stopAtPoint=false,everyContact:ChaosContactResolution='complete'):[ChaosPhysicsState,boolean,ChaosPhysicsCollision[]]{
 if(target<source.t||!Number.isInteger(budget)||budget<0||budget>512)throw Error('Numeric range');
 const cancel=(reason:number):[ChaosPhysicsState,boolean,ChaosPhysicsCollision[]]=>{const s=structuredClone(source);s.cancelled=true;s.cancelReason=reason;s.effects=emptyEffects();s.balls=[emptyBall(),emptyBall()];s.activeMask=0;return[s,true,[]];};
 if(target>1800000000n)return cancel(2);
 try{
  const s=structuredClone(source),log:ChaosPhysicsCollision[]=[];const all=everyContact==='complete';
  for(let step=0;step<budget;step++){
   if(s.cancelled||s.score.finished)break;
   prepare(s);const grid=needsGrid(s);
   if(grid){if(s.nextForce<s.t)s.nextForce=(s.t+9999n)/STEP*STEP;if(s.nextForce===s.t)force(s);}else s.nextForce=(s.t/STEP+1n)*STEP;
   const tied:ChaosCandidate[]=[];const searched=structuredClone(s.effects);
   const [hit,goals,beneficiaries,planes]=nextContact(s,all?tied:undefined);let boundary=grid?s.nextForce:NEVER;
   for(const e of s.effects){if(!e.id)continue;let at=BigInt(e.startsAt)*1000n;if(at>s.t&&at<boundary)boundary=at;at=BigInt(e.expiresAt)*1000n;if(at>s.t&&at<boundary)boundary=at;}
   if(boundary<s.t)throw Error('Numeric range');const remaining=target-s.t;
   if(hit.dt>remaining&&boundary>target){move(s,target);break;}
   if(boundary<=target&&(hit.dt===NEVER||boundary-s.t<=hit.dt)){
    const dt=boundary-s.t;move(s,boundary);
    if(all){prepare(s);if(dt===hit.dt){
     let mask=0;for(let i=0;i<2;i++)if(s.balls[i].alive&&goals[i]===dt)mask|=beneficiaries[i];
     if(mask){point(s,mask);if(s.score.finished||stopAtPoint)break;continue;}
     resolveBatch(s,tied,searched,true,log);if(log.length>=CHAOS_LOG_STOP)break;
    }continue;}
    // Rules 8, as ChaosPhysics: contacts due in the boundary's own microsecond that the
    // ceiling carried strictly past their plane are resolved now; exact landings wait.
    if(everyContact&&dt===hit.dt){
     let goalsMask=0,crossed=false;
     for(let i=0;i<2;i++){const b=s.balls[i];if(b.alive&&goals[i]===dt){goalsMask|=beneficiaries[i];crossed||=b.vx<0n?b.x< -6n*P:b.x>1030n*P;}}
     if(crossed){point(s,goalsMask);if(s.score.finished||stopAtPoint)break;continue;}
     sweep(s,planes,{dt,kind:0,ball:0,slot:0,obstacle:0,nx:0n,ny:0n},log);if(log.length>=CHAOS_LOG_STOP)break;
    }
    continue;
   }
   if(hit.dt===NEVER||hit.dt>remaining){move(s,target);break;}
   move(s,s.t+hit.dt);if(hit.dt===0n){s.stalled++;if(s.stalled>32)throw Error('Numeric range');}
   let goalsMask=0;for(let i=0;i<2;i++)if(s.balls[i].alive&&goals[i]===hit.dt)goalsMask|=beneficiaries[i];
   if(goalsMask!==0){
    point(s,goalsMask);if(s.score.finished||stopAtPoint)break;
   }else{
    if(all)resolveBatch(s,tied,searched,false,log);
    else if(collideEffect(s,hit,!!everyContact)){s.collisionSequence++;if(s.collisionSequence>0xffffffff)throw Error('Numeric range');log.push({sequence:s.collisionSequence,rally:s.score.rally,ball:hit.ball+1,kind:hit.kind,obstacle:hit.obstacle,at:s.t,x:s.balls[hit.ball].x,y:s.balls[hit.ball].y});}
    if(everyContact&&!all&&hit.dt!==0n)sweep(s,planes,hit,log);
    if(log.length>=CHAOS_LOG_STOP)break;
   }
  }
  let complete=s.cancelled||s.score.finished;
  if(!complete)prepare(s);if(!complete&&!needsGrid(s))s.nextForce=(s.t/STEP+1n)*STEP;
  if(!complete&&s.t===target&&s.nextForce>s.t)complete=nextContact(s)[0].dt!==0n;
  return[s,complete,log];
 }catch(e){if(e instanceof Error&&e.message==='Numeric range')return cancel(1);throw e;}
}
