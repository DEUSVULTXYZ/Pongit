import { initial as initialV2, advance as advanceV2, resume as resumeV2, next, type State } from "./physics-v2";
import { accelerate } from "./physics-interlude";
import type { Hex } from "viem";
const speed = (s:State):State => ({...s,vx:s.vx*3n/2n,vy:s.vy*3n/2n});
export const initial = (seed:Hex) => speed(initialV2(seed,1));
export function resume(s:State,at:bigint,paidA:bigint,paidB:bigint):State {
  if(s.mode!==1 || s.finished) throw Error("chaos state");
  return speed(resumeV2(s,at,paidA,paidB));
}
export function advance(state:State,target:bigint,limit=128):[State,boolean] {
  let s={...state};
  if(s.mode!==1 || target<s.t) throw Error("chaos clock");
  for(let i=0;i<limit;i++) {
    if(s.finished || s.awaitingServe) return[s,true];
    const e=next(s);
    if(e.at>target) return advanceV2(s,target,1);
    const previous=s.vx;
    [s]=advanceV2(s,e.at,1);
    if((e.kind===3 || e.kind===4) && s.vx!==previous) s=accelerate(s);
  }
  return[s,s.finished || s.awaitingServe || s.t===target && next(s).at>target];
}
