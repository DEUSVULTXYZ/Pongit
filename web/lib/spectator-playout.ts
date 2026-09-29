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
 private started=false;
 constructor(private readonly player=false){}
 reset(){this.frames=[];this.interval=600;this.playhead=0n;this.sampledAt=undefined;this.started=false;}
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
   if(frame.state===last.state&&frame.chaos?.physics===last.chaos?.physics)return;
   // Inputs/effects may change at the same processed instant. Replace their
   // state without making a repeated read renew its freshness timestamp.
   this.frames[this.frames.length-1]={...frame,at:last.at};return;
  }
  const prior=this.frames.at(-1);
  if(prior){const gap=frame.at-prior.at;if(gap>0)this.interval=.75*this.interval+.25*Math.min(2500,gap);}
  this.frames.push(frame);
  // A burst of player inputs must not evict the entire delayed trajectory.
  // Retain time, not sixteen commands (which can represent only 100 ms).
  while(this.frames.length>2&&this.frames[1].at<frame.at-3000)this.frames.shift();
  while(this.frames.length>512)this.frames.shift();
 }
 sample(now:number){
  if(!this.frames.length)return null;
  // Reserve two normal deliveries, not just one plus a quarter. On the hosted
  // 500 ms stream that small margin ran dry during a single delayed update,
  // despite the next authoritative frame arriving well within 1.5 seconds.
  // Fast streams still approach 300 ms; no unconfirmed time is extrapolated.
  const delay=this.player?120:Math.max(300,Math.min(1000,this.interval*2)),at=now-delay;
  let a=this.frames[0],b=a;
  for(const next of this.frames.slice(1)){b=next;if(next.at>=at)break;a=next;}
  const fraction=b===a?0:Math.max(0,Math.min(1,(at-a.at)/(b.at-a.at)));
  let target=a.state.t+BigInt(Math.floor(Number(b.state.t-a.state.t)*fraction));
  if(this.player&&at>b.at)target=b.state.t+BigInt(Math.floor(Math.min(600,at-b.at)*1000));
  if(this.player&&!this.started)this.started=true;
  if(!this.started){
   // Fill once on entry. Starting immediately and only slowing by 2% could
   // never accumulate the advertised reserve before the first delayed packet.
   if(now-this.frames[0].at<delay)target=this.frames[0].state.t;
   else this.started=true;
  }else if(this.sampledAt!==undefined&&now-this.sampledAt<1000){
   const dt=Math.max(0,Math.min(100,now-this.sampledAt));
   // A larger jitter estimate previously moved the desired clock backwards,
   // freezing every frame until wall time caught up. Slew instead of stopping;
   // never advance beyond the latest actually processed snapshot.
   const correction=Number(target-this.playhead)/1000;
   const speed=Math.max(.98,Math.min(1.02,1+correction/5000));
   target=this.playhead+BigInt(Math.floor(dt*1000*speed));
  }
  this.sampledAt=now;
  if(target<this.playhead)target=this.playhead;
  const latest=this.frames.at(-1)!,ceiling=latest.state.t+(this.player&&!latest.state.finished?600000n:0n);
  if(target>ceiling)target=ceiling;
  this.playhead=target;
  // Choose again by game time: an adaptive delay must never rewind physics.
  a=this.frames[0];b=a;
  for(const next of this.frames.slice(1)){b=next;if(next.state.t>target)break;a=next;}
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
