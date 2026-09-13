import {advance as baseAdvance,move,next,serve,handicap,clamp,type State} from './physics-v2';
import {accelerate} from './physics-interlude';
/** Queued pressure only influences future point boundaries, never a live collision. */
export function advance(state:State,target:bigint,limit=128,paidA=0n,paidB=0n):[State,boolean,number]{
 let s={...state},applied=0;
 if(s.mode!==1||s.awaitingServe||target<s.t)throw Error('realtime clock');
 for(let i=0;i<limit;i++){
  if(s.finished)return [s,true,applied];
  const e=next(s);if(e.at>target)return [move(s,target),true,applied];
  const previous=s.vx;[s]=baseAdvance(s,e.at,1);
  if((e.kind===3||e.kind===4)&&s.vx!==previous)s=accelerate(s);
  if(s.awaitingServe){
   const [halfA,halfB]=handicap(paidA,paidB);
   s=serve({...s,awaitingServe:false,resumeAt:0n,halfA,halfB,left:clamp(s.left,halfA),right:clamp(s.right,halfB)});
   s={...s,vx:s.vx*3n/2n,vy:s.vy*3n/2n};applied=s.scoreA+s.scoreB;
  }
 }
 return [s,s.finished||s.t===target&&next(s).at>target,applied];
}
