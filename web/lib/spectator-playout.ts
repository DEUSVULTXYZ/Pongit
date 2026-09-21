import type {State} from '../../shared/physics-v2';
import type {ChaosDecoded} from '../../shared/chaos-codec';

type Frame={state:State;chaos?:ChaosDecoded;at:number};
const rally=(s:State)=>`${s.scoreA}:${s.scoreB}:${s.finished}`;
/** A short read-only playout buffer follows processed physics, never the engine's
 * requested catch-up clock. It does not synthesize controls, scores or effects. */
export class SpectatorPlayout {
 private frames:Frame[]=[];
 private interval=600;
 private playhead=0n;
 private sampledAt:number|undefined;
 reset(){this.frames=[];this.interval=600;this.playhead=0n;this.sampledAt=undefined;}
 push(frame:Frame){
  const last=this.frames.at(-1);
  // A point and the final whistle are ordinary forward progress: processed time
  // stays monotonic across them, so every buffered frame remains confirmed
  // history and the court keeps playing it in order. Discarding the buffer here
  // teleported the rally forward by the whole delay, froze until the next
  // snapshot and then crawled while the buffer refilled. Only a real
  // discontinuity - another match, a rewound clock, a withdrawn point or an
  // engine reset - may drop confirmed frames.
  if(last&&(frame.state.seed!==last.state.seed||frame.state.t<last.state.t
   ||frame.state.scoreA<last.state.scoreA||frame.state.scoreB<last.state.scoreB
   ||(last.state.finished&&!frame.state.finished))){this.reset();}
  else if(last&&frame.state.t===last.state.t){
   // One processed instant holds one frame: a repeated observation adds nothing,
   // and a point resolved at that instant replaces the frame it belongs to.
   if(rally(frame.state)===rally(last.state))return;
   this.frames[this.frames.length-1]=frame;return;
  }
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
  if(this.sampledAt!==undefined&&now-this.sampledAt<1000){
   const dt=Math.max(0,Math.min(100,now-this.sampledAt));
   const rate=b.at>a.at?Math.min(2,Math.max(.1,Number(b.state.t-a.state.t)/(b.at-a.at)/1000)):1;
   // A larger jitter estimate previously moved the desired clock backwards,
   // freezing every frame until wall time caught up. Slew instead of stopping;
   // never advance beyond the latest actually processed snapshot.
   const correction=Number(target-this.playhead)/1000;
   const speed=Math.max(.8,Math.min(1.2,1+correction/1500));
   target=this.playhead+BigInt(Math.floor(dt*1000*rate*speed));
  }
  this.sampledAt=now;
  if(target<this.playhead)target=this.playhead;
  const latest=this.frames.at(-1)!;if(target>latest.state.t)target=latest.state.t;
  this.playhead=target;
  // Choose again by game time: an adaptive delay must never rewind physics.
  a=this.frames[0];b=a;
  for(const next of this.frames.slice(1)){b=next;if(next.state.t>=target)break;a=next;}
  // Paddles are continuous within a rally. A serve recentres them at its own
  // instant, so hold the confirmed position instead of sliding across a point.
  const k=b.state.t===a.state.t||rally(a.state)!==rally(b.state)?0:Math.max(0,Math.min(1,Number(target-a.state.t)/Number(b.state.t-a.state.t)));
  return {frame:a,target,delayMs:delay,stalled:now-latest.at>Math.max(1800,delay*2),
   left:Number(a.state.left)/1e6+(Number(b.state.left-a.state.left)/1e6)*k,
   right:Number(a.state.right)/1e6+(Number(b.state.right-a.state.right)/1e6)*k};
 }
}

export function visibleBall(x:number,y:number){
 return{x:Math.max(6,Math.min(1018,x)),y:Math.max(6,Math.min(570,y))};
}
