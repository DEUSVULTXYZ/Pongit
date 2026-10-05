import type {State} from '../../shared/physics-v2';
import type {ChaosPhysicsState} from '../../shared/physics-chaos-events';
import {projectLive} from './presentation';
import {projectChaos,eventPaddles} from './chaos-presentation';
import {decideHouse,unpackPolicy,type PolicyView} from '../../shared/house-policy';
import {integerSqrt} from '../../shared/chaos-collision';
import type {AgentSynchronization} from '../../shared/agent-synchronization';

/** Intent times are on the displayed game's clock. Accepted commands retain
 * their engine time until physics reaches it; a queue receipt is not an impact. */
export type TimedControl={side:0|1;direction:-1|0|1;at:bigint};
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

/** Ball and both paddles share one reconstruction. Callers must draw these
 * paddle positions, never replace them with an independent local animation. */
export function projectParticipant(source:State,target:bigint,inputs:readonly TimedControl[],house?:HousePrediction){
 let state={...source},waiting=false,pointBoundary=false;
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
   const next=projectLive(state,bot.end(state.t,to));state=next.state;waiting=next.waiting;pointBoundary=!!next.pointBoundary;
  }
 };
 for(const input of controlsBetween(state.t,end,inputs)){
  advance(input.at);
  if(waiting)return {state,waiting,pointBoundary};
  state=steer(state,input);
 }
 advance(end);return {state,pointBoundary,waiting:waiting||target>end};
}

export function projectChaosParticipant(source:ChaosPhysicsState,target:bigint,inputs:readonly TimedControl[],contacts:boolean|'complete',house?:HousePrediction){
 let state=source;const collisions:ReturnType<typeof projectChaos>['collisions']=[];
 if(state.score.finished||state.cancelled)return {state,collisions,pointBoundary:false,waiting:false};
 const end=target<state.t?state.t:target>state.t+600_000n?state.t+600_000n:target;
 let waiting=false,pointBoundary=false;const bot=predictor(house);
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
   const next=projectChaos(state,bot.end(state.t,to),contacts);state=next.state;collisions.push(...next.collisions);
   waiting=next.waiting;pointBoundary=next.pointBoundary;
  }
 };
 for(const input of controlsBetween(state.t,end,inputs)){
  advance(input.at);
  if(waiting)return {state,collisions,waiting,pointBoundary};
  state=steer(state,input);
  // Curveball uses the last actual movement direction on this same timeline.
  if(input.direction)state={...state,...(input.side===0?{lastLeft:input.direction}:{lastRight:input.direction})};
 }
 advance(end);return {state,collisions,pointBoundary,waiting:waiting||target>end};
}
