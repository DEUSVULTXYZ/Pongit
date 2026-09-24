import {advance,initial,HEIGHT,SCALE,type State} from '../../shared/physics-v2';

/** A local practice rally against a simple house bot: the real game physics, run in
 * the browser only. Nothing is sent anywhere, and nothing counts for the ranking. */
export type Warmup={state:State;aim:bigint;heading:number};

const seed=()=>`0x${Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')}` as const;
export function newWarmup(random:()=>`0x${string}`=seed):Warmup{
 return {state:initial(random(),0),aim:0n,heading:0};
}

/** The bot (right paddle) follows the ball only while it comes its way, aiming a
 * little off-centre so the player can win points. It drifts home otherwise. */
export function botDirection(w:Warmup,random:()=>number=Math.random):[number,Warmup]{
 const s=w.state,heading=s.vx>0n?1:-1;
 // A new approach picks a new, slightly imperfect aim: up to 40 px off.
 const aim=heading!==w.heading?BigInt(Math.round((random()*80-40)))*SCALE:w.aim;
 const target=heading>0?s.y+aim:HEIGHT/2n;
 const gap=target-s.right,dead=10n*SCALE;
 return [gap>dead?1:gap< -dead?-1:0,{...w,aim,heading}];
}

/** Advance the rally by `ms` of wall time (capped, so a background tab never jumps). */
export function stepWarmup(w:Warmup,ms:number,player:number,random:()=>number=Math.random):Warmup{
 const [bot,aimed]=botDirection(w,random);
 const dt=BigInt(Math.round(Math.min(Math.max(ms,0),50)*1000));
 const [state]=advance({...aimed.state,leftDir:Math.sign(player),rightDir:bot},aimed.state.t+dt);
 return {...aimed,state};
}
