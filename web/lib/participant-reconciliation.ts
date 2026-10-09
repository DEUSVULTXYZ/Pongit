export type ConfirmedContact={sequence:number;kind:number;x:number;y:number};
export type ParticipantPose={
 paddles:[number,number]; halves:[number,number];
 contactBoundary?:boolean;
 contactPaddles?:readonly [number,number];
 split?:readonly [boolean,boolean];
 balls:{id:number;x:number;y:number;continuity:string;vx?:number;speed?:number;contactPath?:readonly ConfirmedContact[]}[];
};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
// Keep half a unit for event-dispatch latency within the two-unit stop target.
const STOP_CORRECTION=1.5;
function contacting(pose:ParticipantPose,side:0|1){
 return !!pose.contactBoundary&&!!pose.contactPaddles&&pose.balls.some(b=>
  Math.abs(b.x-(side===0?40:984))<.002&&(side===0?(b.vx??0)<0:(b.vx??0)>0));
}
function contactPaddle(pose:ParticipantPose,side:0|1,shown:number){
 let lower=pose.halves[side],upper=576-lower;
 const anchor=pose.contactPaddles![side],radius=pose.halves[side]+6,margin=.001;
 for(const b of pose.balls){
  if(Math.abs(b.x-(side===0?40:984))>=.002||!(side===0?(b.vx??0)<0:(b.vx??0)>0))continue;
  const distance=Math.abs(b.y-anchor);
  // Keep each ball's hit/miss and split segment, allowing compatible motion.
  // Exact anchor resets made mobile1563 jump12px during a genuine hit. A
  // waiting contact constrains geometry; it does not reset the input clock.
  if(pose.split?.[side]&&distance<2){lower=Math.max(lower,b.y-2+margin);upper=Math.min(upper,b.y+2-margin);}
  else if(distance<=radius){
   lower=Math.max(lower,b.y-radius);upper=Math.min(upper,b.y+radius);
   if(pose.split?.[side]){
    if(anchor<b.y)upper=Math.min(upper,b.y-2);
    else lower=Math.max(lower,b.y+2);
   }
  }
  else if(anchor<b.y)upper=Math.min(upper,b.y-radius-margin);
  else lower=Math.max(lower,b.y+radius+margin);
 }
 return lower<=upper?clamp(shown,lower,upper):anchor;
}
type ParticipantSource={state:unknown;chaos?:unknown;clock:bigint;progressionLimit?:bigint;confirmedInputRevision?:number};
export function participantSourceChanged(previous:ParticipantSource,current:ParticipantSource){
 return previous.state!==current.state||previous.chaos!==current.chaos||previous.clock!==current.clock
  ||previous.progressionLimit!==current.progressionLimit||previous.confirmedInputRevision!==current.confirmedInputRevision;
}
const settle=(n:number,dt:number,speed:number)=>{
 const change=n*(1-Math.exp(-dt/100));
 return n-clamp(change,-speed*dt/1000,speed*dt/1000);
};
export function participantContinuationTime(previous:bigint,elapsedMs:number,ceiling?:bigint){
 const next=previous+BigInt(Math.floor(clamp(elapsedMs,0,50)*1000));
 return ceiling!==undefined&&next>ceiling?ceiling:next;
}
/** An old presence ceiling fences ball/clock prediction, not a fresh local
 * paddle intention. A confirmed pause, disabled controls or stale perception
 * still stops this visual motion. No collision or authoritative state changes. */
export function participantMotionMs(elapsedMs:number,controllable:boolean,stale:boolean,finished:boolean){
 return controllable&&!stale&&!finished?clamp(elapsedMs,0,50):0;
}

/** Reconcile the picture, never the authoritative state or input timestamps.
 * On a new receipt compare both reconstructions for the SAME wall frame. Only
 * their error is blended; ordinary motion and new direction changes keep their
 * full speed. A local held intention carries its timestamp correction until
 * a later acknowledgement cancels it; it never pays that error as resistance.
 * Ball geometry is never moved to make a corrected paddle appear to hit it.
 */
export class ParticipantReconciliation {
 private paddles:[number,number]=[0,0];
 private balls=new Map<number,{x:number;y:number;continuity:string;handoff?:number;route?:{side:0|1;sequence:number;points:ConfirmedContact[];entry:ParticipantPose}}>();
 private ballPictures=new Map<number,ParticipantPose['balls'][number]>();
 private localDirection=0;
 private stopCorrection=STOP_CORRECTION;
 private localPicture?:{side:0|1;y:number};
 private stoppedAt?:number;
 reset(){this.paddles=[0,0];this.balls.clear();this.ballPictures.clear();this.localDirection=0;this.stopCorrection=STOP_CORRECTION;this.localPicture=undefined;this.stoppedAt=undefined;}
 sample(current:ParticipantPose,previous:ParticipantPose|undefined,elapsedMs:number,local?:{side:0|1;direction:number;speed?:number;motionMs?:number;motion?:readonly {direction:number;ms:number}[];stopConfirmed?:boolean}):ParticipantPose{
  const dt=clamp(elapsedMs,0,50);
  const released=!!local&&local.direction===0&&this.localDirection!==0;
  if(local&&local.direction!==this.localDirection){
   this.localDirection=local.direction;this.stopCorrection=STOP_CORRECTION;
   this.stoppedAt=released&&this.localPicture?.side===local.side?this.localPicture.y:undefined;
  }
  for(const side of [0,1] as const){
   if(previous)this.paddles[side]+=previous.paddles[side]-current.paddles[side];
   if(local?.side===side){
    if(local.motion&&local.speed!==undefined&&this.localPicture?.side===side){
     // Integrate the actual portions before/after each key event. Rounding an
     // 80ms press to whole RAFs repeatedly accumulated tens of pixels, then
     // the old release lock preserved a paddle different from live physics.
     let y=this.localPicture.y;
     for(const part of local.motion)y=clamp(y+part.direction*local.speed*part.ms/1000,current.halves[side],576-current.halves[side]);
     if(local.direction===0&&local.stopConfirmed!==false){
      // Receipt quantization can still differ slightly from local input time.
      // Spend at most1.5 units in total for this stop, never subtract a
      // reconciliation velocity from a held direction or leave a long tail.
      const correction=clamp(current.paddles[side]-y,-this.stopCorrection,this.stopCorrection);
      y+=correction;this.stopCorrection-=Math.abs(correction);
     }
     this.paddles[side]=y-current.paddles[side];
    }else{
    if(released&&this.stoppedAt!==undefined){
     // A release can land between animation frames. Freeze the last painted
     // location, not an extra partial frame reconstructed from the new ACK.
     this.paddles[side]=this.stoppedAt-current.paddles[side];
     this.stopCorrection=0;
    }else if(local.direction===0){
     const correction=clamp(this.paddles[side],-this.stopCorrection,this.stopCorrection);
     this.paddles[side]-=correction;this.stopCorrection-=Math.abs(correction);
    }
    if(local.direction===0&&this.stoppedAt!==undefined)
     this.paddles[side]=clamp(current.paddles[side]+this.paddles[side],this.stoppedAt-STOP_CORRECTION,this.stoppedAt+STOP_CORRECTION)-current.paddles[side];
    // A reconciled paddle can trail its live position. When live physics has
    // already reached a wall, its zero delta must not strand the picture away
    // from that wall (public match941: live48, picture79.5057, held up).
    // Finish only that remaining visual distance at the rules' actual speed.
    const wall=local.direction<0?current.halves[side]:576-current.halves[side];
    if(local.direction!==0&&local.speed!==undefined&&this.localPicture?.side===side
      &&(local.motionMs!==undefined||Math.abs(current.paddles[side]-wall)<.001)){
     // A fresh anchor can make LiveClock hold its previous target for a frame.
     // The local paddle follows real input time, within the caller's verified
     // presence/staleness budget, rather than inheriting that clock slowdown.
     const motionMs=local.motionMs===undefined?dt:clamp(local.motionMs,0,dt);
     this.paddles[side]=clamp(this.localPicture.y+local.direction*local.speed*motionMs/1000,
      current.halves[side],576-current.halves[side])-current.paddles[side];
    }
    }
   }else this.paddles[side]=settle(this.paddles[side],dt,120);
   this.paddles[side]=clamp(current.paddles[side]+this.paddles[side],current.halves[side],576-current.halves[side])-current.paddles[side];
   const atContact=contacting(current,side);
   if(atContact)this.paddles[side]=contactPaddle(current,side,current.paddles[side]+this.paddles[side])-current.paddles[side];
  }
  const balls=current.balls.map(ball=>{
   let error=this.balls.get(ball.id);
   if(!error||error.continuity!==ball.continuity)error={x:0,y:0,continuity:ball.continuity};
   const before=previous?.balls.find(b=>b.id===ball.id&&b.continuity===ball.continuity);
   if(before){error.x+=before.x-ball.x;error.y+=before.y-ball.y;}
   // Public Chaos1121: the old reconstruction waited at x40. When the live
   // impact arrived110ms later, fading its correction at the paddle plane
   // jumped35 units in one frame. Complete only this confirmed outgoing
   // transition with bounded catch-up. Never invent a speculative bounce.
   if(previous?.contactBoundary&&before&&ball.vx!==undefined&&before.vx!==undefined
     &&((Math.abs(before.x-40)<.002&&before.vx<0&&ball.vx>0&&ball.x>40&&ball.x<168)
       ||(Math.abs(before.x-984)<.002&&before.vx>0&&ball.vx<0&&ball.x<984&&ball.x>856)))error.handoff=80;
   // A single live update can cross a missed paddle, a Last Chance shield
   // and a wall. Preserve those confirmed waypoints rather than reflecting
   // the waiting picture at the paddle plane (human Chaos73).
   const shield=ball.contactPath?.find(hit=>hit.kind===7||hit.kind===8);
   if(shield&&previous?.contactBoundary&&before&&
    (shield.kind===7&&Math.abs(before.x-40)<.002&&(before.vx??0)<0||shield.kind===8&&Math.abs(before.x-984)<.002&&(before.vx??0)>0))
    error.route={side:shield.kind===7?0:1,sequence:0,points:[],entry:{...previous,contactPaddles:previous.contactPaddles??previous.paddles,balls:[before]}};
   if(error.route){
    for(const hit of ball.contactPath??[])if(hit.sequence>error.route.sequence){error.route.points.push(hit);error.route.sequence=hit.sequence;}
    const last=this.ballPictures.get(ball.id);
    if(last?.continuity===ball.continuity){
     const side=error.route.side;
     // The first displayed crossing still belongs to the earlier miss. Do
     // not free the paddle while its ball picture is only now passing it.
     if(side===0?last.x>=40-.002:last.x<=984+.002)
      this.paddles[side]=contactPaddle(error.route.entry,side,current.paddles[side]+this.paddles[side])-current.paddles[side];
     let x=last.x,y=last.y,budget=((ball.speed??Math.abs(ball.vx??0)/1e6)+120)*dt/1000;
     while(budget>0){
      const point=error.route.points[0]??ball,dx=point.x-x,dy=point.y-y,distance=Math.hypot(dx,dy);
      if(distance<=budget){x=point.x;y=point.y;budget-=distance;if(error.route.points.length){error.route.points.shift();continue;}break;}
      x+=dx*budget/distance;y+=dy*budget/distance;break;
     }
     error.x=x-ball.x;error.y=y-ball.y;error.handoff=Math.max(80,Math.hypot(error.x,error.y)*1000/120);
     if(!error.route.points.length&&(error.route.side===0?x>=40:x<=984))error.route=undefined;
     const picture={...ball,x,y};this.balls.set(ball.id,error);this.ballPictures.set(ball.id,picture);return picture;
    }
    error.route=undefined;
   }
   // Bound extra catch-up speed. A fixed80ms deadline turned a late600u/s
   // return into a31-unit single-frame jump. Small corrections still finish
   // in80ms; larger ones retain only their existing spatial delay.
   if((error.handoff??0)>0)error.handoff=Math.max(error.handoff!,Math.hypot(error.x,error.y)*1000/120);
   const handoff=error.handoff??0;
   if(handoff>0){
    const remaining=Math.max(0,handoff-dt);
    error.x*=remaining/handoff;error.y*=remaining/handoff;error.handoff=remaining;
   }else{error.x=settle(error.x,dt,120);error.y=settle(error.y,dt,120);}
   this.balls.set(ball.id,error);
   // Preserve paddle-plane contacts (x=40/984), including real misses. Blend
   // continuously back to the ball's own correction away from the paddles.
   // Once a missed ball is outside the paddle plane it is awaiting the point,
   // not a contact. Borrowing a newly corrected paddle's error here teleported
   // the stationary ball vertically (observed PvP 26480ms: +99px, then -54px).
   const left=ball.x<40?0:clamp((168-ball.x)/128,0,1),right=ball.x>984?0:clamp((ball.x-856)/128,0,1),free=1-left-right;
   const ownContact=current.contactBoundary&&(Math.abs(ball.x-40)<.002&&(ball.vx??0)<0||Math.abs(ball.x-984)<.002&&(ball.vx??0)>0);
   const blend=handoff>0&&!ownContact&&ball.x>40&&ball.x<984?1:free;
   const x=ball.x+error.x*blend;
   // The contact position belongs to live physics. Never borrow a paddle's
   // error to manufacture a visible hit, or shift a real miss into a hit.
   const picture={...ball,x:ball.x<40?Math.min(40,x):ball.x>984?Math.max(984,x):clamp(x,40,984),y:clamp(ball.y+error.y*blend,6,570)};
   const last=this.ballPictures.get(ball.id);
   // Match970: decaying clock correction reversed a miss by0.44 units after
   // it had passed x40, although live velocity still pointed toward the goal.
   // Keep that outgoing miss monotonic; real reversals and teleports retain
   // their velocity/continuity change. This never invents a paddle contact.
   if(last?.continuity===ball.continuity&&ball.vx!==undefined&&last.vx!==undefined){
    if(ball.x<40&&last.x<40&&ball.vx<0&&last.vx<0)picture.x=Math.min(last.x,picture.x);
    if(ball.x>984&&last.x>984&&ball.vx>0&&last.vx>0)picture.x=Math.max(last.x,picture.x);
   }
   this.ballPictures.set(ball.id,picture);return picture;
  });
  for(const id of this.balls.keys())if(!current.balls.some(b=>b.id===id)){this.balls.delete(id);this.ballPictures.delete(id);}
  const paddles=current.paddles.map((y,i)=>y+this.paddles[i]) as [number,number];
  if(local)this.localPicture={side:local.side,y:paddles[local.side]};
  return {paddles,halves:current.halves,balls,...(current.split?{split:current.split}:{})};
 }
}
