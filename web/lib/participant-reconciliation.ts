export type ParticipantPose={
 paddles:[number,number]; halves:[number,number];
 balls:{id:number;x:number;y:number;continuity:string}[];
};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
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

/** Reconcile the picture, never the authoritative state or input timestamps.
 * On a new receipt compare both reconstructions for the SAME wall frame. Only
 * their error is blended; ordinary motion and new direction changes keep their
 * full speed. A local held intention carries its timestamp correction until
 * a later acknowledgement cancels it; it never pays that error as resistance.
 * Ball geometry is never moved to make a corrected paddle appear to hit it.
 */
export class ParticipantReconciliation {
 private paddles:[number,number]=[0,0];
 private balls=new Map<number,{x:number;y:number;continuity:string}>();
 private localDirection=0;
 private stopCorrection=2;
 private localPicture?:{side:0|1;y:number};
 private stoppedAt?:number;
 reset(){this.paddles=[0,0];this.balls.clear();this.localDirection=0;this.stopCorrection=2;this.localPicture=undefined;this.stoppedAt=undefined;}
 sample(current:ParticipantPose,previous:ParticipantPose|undefined,elapsedMs:number,local?:{side:0|1;direction:number;speed?:number}):ParticipantPose{
  const dt=clamp(elapsedMs,0,50);
  const released=!!local&&local.direction===0&&this.localDirection!==0;
  if(local&&local.direction!==this.localDirection){
   this.localDirection=local.direction;this.stopCorrection=2;
   this.stoppedAt=released&&this.localPicture?.side===local.side?this.localPicture.y:undefined;
  }
  for(const side of [0,1] as const){
   if(previous)this.paddles[side]+=previous.paddles[side]-current.paddles[side];
   if(local?.side===side){
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
     this.paddles[side]=clamp(current.paddles[side]+this.paddles[side],this.stoppedAt-2,this.stoppedAt+2)-current.paddles[side];
    // A reconciled paddle can trail its live position. When live physics has
    // already reached a wall, its zero delta must not strand the picture away
    // from that wall (public match941: live48, picture79.5057, held up).
    // Finish only that remaining visual distance at the rules' actual speed.
    const wall=local.direction<0?current.halves[side]:576-current.halves[side];
    if(local.direction!==0&&local.speed!==undefined&&this.localPicture?.side===side
      &&Math.abs(current.paddles[side]-wall)<.001){
     this.paddles[side]=clamp(this.localPicture.y+local.direction*local.speed*dt/1000,
      current.halves[side],576-current.halves[side])-current.paddles[side];
    }
   }else this.paddles[side]=settle(this.paddles[side],dt,120);
   this.paddles[side]=clamp(current.paddles[side]+this.paddles[side],current.halves[side],576-current.halves[side])-current.paddles[side];
  }
  const balls=current.balls.map(ball=>{
   let error=this.balls.get(ball.id);
   if(!error||error.continuity!==ball.continuity)error={x:0,y:0,continuity:ball.continuity};
   const before=previous?.balls.find(b=>b.id===ball.id&&b.continuity===ball.continuity);
   if(before){error.x+=before.x-ball.x;error.y+=before.y-ball.y;}
   error.x=settle(error.x,dt,120);error.y=settle(error.y,dt,120);
   this.balls.set(ball.id,error);
   // Preserve paddle-plane contacts (x=40/984), including real misses. Blend
   // continuously back to the ball's own correction away from the paddles.
   // Once a missed ball is outside the paddle plane it is awaiting the point,
   // not a contact. Borrowing a newly corrected paddle's error here teleported
   // the stationary ball vertically (observed PvP 26480ms: +99px, then -54px).
   const left=ball.x<40?0:clamp((168-ball.x)/128,0,1),right=ball.x>984?0:clamp((ball.x-856)/128,0,1),free=1-left-right;
   const x=ball.x+error.x*free;
   // The contact position belongs to live physics. Never borrow a paddle's
   // error to manufacture a visible hit, or shift a real miss into a hit.
   return {...ball,x:ball.x<40?Math.min(40,x):ball.x>984?Math.max(984,x):clamp(x,40,984),
    y:clamp(ball.y+error.y*free,6,570)};
  });
  for(const id of this.balls.keys())if(!current.balls.some(b=>b.id===id))this.balls.delete(id);
  const paddles=current.paddles.map((y,i)=>y+this.paddles[i]) as [number,number];
  if(local)this.localPicture={side:local.side,y:paddles[local.side]};
  return {paddles,halves:current.halves,balls};
 }
}
