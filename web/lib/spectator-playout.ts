import type {State} from '../../shared/physics-v2';
import type {ChaosDecoded} from '../../shared/chaos-codec';

type Frame={state:State;chaos?:ChaosDecoded;at:number};
/** A short read-only playout buffer follows processed physics, never the engine's
 * requested catch-up clock. It does not synthesize controls, scores or effects. */
export class SpectatorPlayout {
 private frames:Frame[]=[];
 private interval=600;
 private playhead=0n;
 reset(){this.frames=[];this.interval=600;this.playhead=0n;}
 push(frame:Frame){
  const last=this.frames.at(-1);
  if(last&&(frame.state.seed!==last.state.seed||frame.state.t<last.state.t
   ||frame.state.scoreA!==last.state.scoreA||frame.state.scoreB!==last.state.scoreB
   ||frame.state.finished!==last.state.finished)){this.reset();}
  else if(last&&frame.state.t===last.state.t)return;
  const prior=this.frames.at(-1);
  if(prior){const gap=frame.at-prior.at;if(gap>0)this.interval=.75*this.interval+.25*Math.min(2500,gap);}
  this.frames.push(frame);if(this.frames.length>16)this.frames.shift();
 }
 sample(now:number){
  if(!this.frames.length)return null;
  const delay=Math.max(200,Math.min(1800,this.interval*1.25)),at=now-delay;
  let a=this.frames[0],b=a;
  for(const next of this.frames.slice(1)){b=next;if(next.at>=at)break;a=next;}
  const fraction=b===a?0:Math.max(0,Math.min(1,(at-a.at)/(b.at-a.at)));
  let target=a.state.t+BigInt(Math.floor(Number(b.state.t-a.state.t)*fraction));
  if(target<this.playhead)target=this.playhead;
  const latest=this.frames.at(-1)!;if(target>latest.state.t)target=latest.state.t;
  this.playhead=target;
  // Choose again by game time: an adaptive delay must never rewind physics.
  a=this.frames[0];b=a;
  for(const next of this.frames.slice(1)){b=next;if(next.state.t>=target)break;a=next;}
  const k=b.state.t===a.state.t?0:Math.max(0,Math.min(1,Number(target-a.state.t)/Number(b.state.t-a.state.t)));
  return {frame:a,target,delayMs:delay,stalled:now-latest.at>Math.max(1800,delay*2),
   left:Number(a.state.left)/1e6+(Number(b.state.left-a.state.left)/1e6)*k,
   right:Number(a.state.right)/1e6+(Number(b.state.right-a.state.right)/1e6)*k};
 }
}

export function visibleBall(x:number,y:number){
 return{x:Math.max(6,Math.min(1018,x)),y:Math.max(6,Math.min(570,y))};
}
