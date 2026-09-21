import {advanceChaosEvents,type ChaosPhysicsState} from '../../shared/physics-chaos-events';
import {chaosPaddles,type ModifierEffect} from '../../shared/chaos-modifiers';
import {chaosEvent,type ChaosEffectState} from '../../shared/chaos-events';
import {chaosContactResolution} from '../../shared/chaos-rules';
import manifest from '../../deployments/interlude-rooms.json';
import type {ChaosCanvasFrame} from './chaos-canvas';
export function eventPaddles(s:ChaosPhysicsState){
 const effect=(i:0|1):ModifierEffect=>({...s.effects[i],startsAt:BigInt(s.effects[i].startsAt),expiresAt:BigInt(s.effects[i].expiresAt),consumed:false});
 return chaosPaddles(BigInt(s.bettingA),BigInt(s.bettingB),[effect(0),effect(1)],s.t/1000n);
}
export function eventHud(s:ChaosPhysicsState):ChaosEffectState[]{return s.effects.flatMap((e,slot)=>e.id?[{
 id:chaosEvent(e.id).id,slot:slot as 0|1,target:e.target as 0|1|2,startsAt:e.startsAt,expiresAt:e.expiresAt,variant:e.variant,consumed:false,
 ...([3,4,5].includes(e.id)?{chargeRemaining:e.remaining}:{}),
}]:[]);}
/** The contract mirror predicts positions only. It never displays an unconfirmed
 * point, starts a new rally or chooses an event. Work per frame is bounded. */
export function projectChaos(source:ChaosPhysicsState,target:bigint,everyContact=chaosContactResolution(Number(manifest.rulesVersion))){
 const limit=source.t+600000n,bounded=target<source.t?source.t:target>limit?limit:target;
 const [state,complete,collisions]=advanceChaosEvents(source,bounded,96,true,everyContact);
 const goal=state.score.rally!==source.score.rally||state.score.finished!==source.score.finished;
 if(goal)for(const b of state.balls)b.alive=false;
 return {state,collisions,waiting:!complete||target>limit||goal||state.cancelled&&!source.cancelled};
}

/** Buffered spectators already have a confirmed future sample. Advance the
 * mirror incrementally rather than repeatedly hitting the 600 ms prediction
 * ceiling from the same old sample. Work stays bounded for each painted frame.
 * A new source always reconciles controls/effects; no goal is extrapolated. */
export class SpectatorChaosProjection {
 private source?:ChaosPhysicsState;
 private projected?:ReturnType<typeof projectChaos>;
 reset(){this.source=undefined;this.projected=undefined;}
 sample(source:ChaosPhysicsState,target:bigint,everyContact:boolean|'complete'){
  if(source!==this.source||!this.projected||target<this.projected.state.t){
   this.source=source;this.projected=undefined;
  }
  const previous=this.projected?.state??source;
  // A predicted goal is a boundary, even when more render time is buffered.
  if(previous.score.rally!==source.score.rally||previous.score.finished!==source.score.finished||previous.cancelled&&!source.cancelled)return this.projected!;
  const next=projectChaos(previous,target,everyContact);
  this.projected=next.state.score.rally!==source.score.rally||next.state.score.finished!==source.score.finished
   ?{state:previous,collisions:[],waiting:true}:next;
  return this.projected;
 }
}
export function eventCanvas(s:ChaosPhysicsState,effectsEnabled:boolean,reducedMotion:boolean):ChaosCanvasFrame{
 const p=eventPaddles(s),ghost=new Set<string>();
 for(const e of s.effects)for(const ball of s.balls){
  if(!ball.alive)continue;
  if(e.id===13&&(ball.ghost&1))ghost.add(`${e.serial}:0`);
  if(e.id===18&&(ball.ghost&8))ghost.add(`${e.serial}:0`);
  if(e.id===19)for(let i=0;i<3;i++)if(ball.ghost&(1<<(i+4)))ghost.add(`${e.serial}:${i}`);
  if(e.id===14)for(let i=0;i<2;i++)if(ball.ghost&(1<<(i+1)))ghost.add(`${e.serial}:${i}`);
  if(e.id===24&&(ball.ghost&128))ghost.add(`${e.serial}:0`);
 }
 return {effects:s.effects,gameMs:Number(s.t/1000n),effectsEnabled,reducedMotion,ghostObstacles:ghost,
  paddles:[{y:Number(s.left)/1e12,height:Number(p.heightA)/1e6,split:p.splitA},{y:Number(s.right)/1e12,height:Number(p.heightB)/1e6,split:p.splitB}],
  balls:s.balls.flatMap((b,i)=>b.alive?[{id:i+1,x:Number(b.x)/1e12,y:Number(b.y)/1e12,vx:Number(b.vx)/1e6,vy:Number(b.vy)/1e6,power:b.powerN>b.powerD,curving:b.curveSteps>0}]:[]),
 };
}
