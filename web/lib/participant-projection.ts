import type {State} from '../../shared/physics-v2';
import type {ChaosPhysicsState} from '../../shared/physics-chaos-events';
import {projectLive,projectConfirmed} from './presentation';
import {projectChaos,eventPaddles} from './chaos-presentation';
import {decideHouse,unpackPolicy,type PolicyView} from '../../shared/house-policy';
import {integerSqrt} from '../../shared/chaos-collision';
import type {AgentSynchronization} from '../../shared/agent-synchronization';

/** Intent times are on the displayed game's clock. Accepted commands retain
 * their engine time until physics reaches it; a queue receipt is not an impact. */
export type TimedControl={side:0|1;direction:-1|0|1;at:bigint;confirmed?:boolean};
export type HousePrediction=Pick<AgentSynchronization,'brainA'|'brainB'|'decision'|'controllers'>&{progressive:boolean;pause?:AgentSynchronization['pause']};
const GRID=100_000n,MAX_SPEED=3_000_000_000n;
function cap<T extends {vx:bigint;vy:bigint}>(ball:T):T{
 const square=ball.vx*ball.vx+ball.vy*ball.vy;if(square<=MAX_SPEED*MAX_SPEED)return ball;
 const speed=integerSqrt(square)+1n;return {...ball,vx:ball.vx*MAX_SPEED/speed,vy:ball.vy*MAX_SPEED/speed};
}
function predictor(house:HousePrediction|undefined){
 let decision=house?.decision??0n;
 const brains=[unpackPolicy(house?.brainA??0n),unpackPolicy(house?.brainB??0n)];
 return {
  turn(time:bigint){if(!house||decision===time/GRID+1n)return false;decision=time/GRID+1n;return true;},
  direction(view:Omit<PolicyView,'tournament'>,fallback:number){
   const style=Number((house?.controllers??0n)>>BigInt(view.side*8)&255n)-1;
   if(style<0||style>7||!house)return fallback;
   brains[view.side]=decideHouse(style,{...view,tournament:house.controllers>>16n},brains[view.side],house.progressive);
   return brains[view.side].held;
  },
  end(time:bigint,end:bigint){const boundary=(time/GRID+1n)*GRID;return house&&boundary<end?boundary:end;},
 };
}
function controlsBetween(from:bigint,to:bigint,inputs:readonly TimedControl[]){
 return inputs.map((input,index)=>({...input,index,at:input.at<from?from:input.at}))
  .filter(input=>input.at<=to).sort((a,b)=>a.at<b.at?-1:a.at>b.at?1:a.index-b.index);
}
function steer<T extends {leftDir:number;rightDir:number}>(state:T,input:TimedControl):T{
 return {...state,...(input.side===0?{leftDir:input.direction}:{rightDir:input.direction})};
}
/** A predicted goal freezes the ball/score, not a player's next intention.
 * Continue only paddle presentation inside the same bounded window. The
 * returned physics time, effects, balls and score remain at the goal fence. */
function pointPaddles<T extends {t:bigint;left:bigint;right:bigint;leftDir:number;rightDir:number}>(source:T,end:bigint,inputs:readonly TimedControl[],speed:readonly bigint[],half:readonly bigint[],unit:bigint):T{
 let state={...source},at=source.t;
 const travel=(to:bigint)=>{const dt=to-at;at=to;
  const bound=(y:bigint,side:number)=>y<half[side]?half[side]:y>576n*unit-half[side]?576n*unit-half[side]:y;
  state={...state,left:bound(state.left+BigInt(state.leftDir)*speed[0]*dt/1_000_000n,0),right:bound(state.right+BigInt(state.rightDir)*speed[1]*dt/1_000_000n,1)};
 };
 for(const input of controlsBetween(at,end,inputs.filter(i=>i.at>=source.t))){travel(input.at);state=steer(state,input);}
 travel(end);return state;
}

/** Ball and both paddles share one reconstruction. Callers must draw these
 * paddle positions, never replace them with an independent local animation. */
export function projectParticipant(source:State,target:bigint,inputs:readonly TimedControl[],house?:HousePrediction){
 let state={...source},waiting=false,pointBoundary=false,contactBoundary=false;
 const uncertain=inputs.some(i=>i.confirmed===false&&i.at<=target);
 if(state.finished||state.awaitingServe)return {state,waiting:false};
 const end=target<state.t?state.t:target>state.t+600_000n?state.t+600_000n:target;
 const bot=predictor(house);
 const advance=(to:bigint)=>{
  while(state.t<to&&!waiting){
   if(bot.turn(state.t)){
    state=cap(state);const balls=[{x:state.x*1_000_000n,y:state.y*1_000_000n,vx:state.vx,vy:state.vy}];
    for(const side of [0,1] as const){const direction=bot.direction({balls,side,t:state.t,seed:state.seed,rally:state.scoreA+state.scoreB,
     paddle:(side===0?state.left:state.right)*1_000_000n,opponent:(side===0?state.right:state.left)*1_000_000n,
     half:(side===0?state.halfA:state.halfB)*1_000_000n},side===0?state.leftDir:state.rightDir);
     state={...state,...(side===0?{leftDir:direction}:{rightDir:direction})};}
   }
   const next=uncertain?projectConfirmed(state,bot.end(state.t,to)):projectLive(state,bot.end(state.t,to));state=next.state;waiting=next.waiting;
   pointBoundary='pointBoundary' in next&&!!next.pointBoundary;contactBoundary=uncertain&&waiting;
  }
 };
 for(const input of controlsBetween(state.t,end,inputs)){
  advance(input.at);
  if(waiting)break;
  state=steer(state,input);
 }
 advance(end);
 if(pointBoundary||contactBoundary)state=pointPaddles(state,end,inputs,[state.paddleSpeed??180_000_000n,state.paddleSpeed??180_000_000n],[state.halfA,state.halfB],1_000_000n);
 return {state,pointBoundary,contactBoundary,waiting:waiting||target>end};
}

export function projectChaosParticipant(source:ChaosPhysicsState,target:bigint,inputs:readonly TimedControl[],contacts:boolean|'complete',house?:HousePrediction){
 let state=source;const collisions:ReturnType<typeof projectChaos>['collisions']=[];
 if(state.score.finished||state.cancelled)return {state,collisions,pointBoundary:false,waiting:false};
 const end=target<state.t?state.t:target>state.t+600_000n?state.t+600_000n:target;
 let waiting=false,pointBoundary=false,contactBoundary=false;const bot=predictor(house);
 const uncertain=inputs.some(i=>i.confirmed===false&&i.at<=target);
 const advance=(to:bigint)=>{
  while(state.t<to&&!waiting){
   if(bot.turn(state.t)){
    state={...state,balls:state.balls.map(b=>b.alive?cap(b):b) as ChaosPhysicsState['balls']};
    const balls=state.balls.filter(b=>b.alive),paddles=eventPaddles(state);
    for(const side of [0,1] as const){const direction=bot.direction({balls,side,t:state.t,seed:state.seed,rally:state.score.rally,
     paddle:side===0?state.left:state.right,opponent:side===0?state.right:state.left,
     half:(side===0?paddles.heightA:paddles.heightB)*500_000n},side===0?state.leftDir:state.rightDir);
     // PoolSteer changes only the held direction; last movement is owned by physics.
     state={...state,...(side===0?{leftDir:direction}:{rightDir:direction})};}
   }
   // ChaosEngine records the last held nonzero direction at each advance.
   state={...state,lastLeft:state.leftDir||state.lastLeft,lastRight:state.rightDir||state.lastRight};
   const next=projectChaos(state,bot.end(state.t,to),contacts,uncertain);state=next.state;collisions.push(...next.collisions);
   contactBoundary=next.contactBoundary;
   waiting=next.waiting;pointBoundary=next.pointBoundary;
  }
 };
 for(const input of controlsBetween(state.t,end,inputs)){
  advance(input.at);
  if(waiting)break;
  state=steer(state,input);
  // Curveball uses the last actual movement direction on this same timeline.
  if(input.direction)state={...state,...(input.side===0?{lastLeft:input.direction}:{lastRight:input.direction})};
 }
 advance(end);
 if(pointBoundary||contactBoundary){const p=eventPaddles(state);state=pointPaddles(state,end,inputs,[p.speedA*1_000_000n,p.speedB*1_000_000n],[p.heightA*500_000n,p.heightB*500_000n],1_000_000_000_000n);}
 return {state,collisions,pointBoundary,contactBoundary,waiting:waiting||target>end};
}
