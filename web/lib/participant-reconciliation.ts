export type ParticipantPose={
 paddles:[number,number]; halves:[number,number];
 balls:{id:number;x:number;y:number;continuity:string}[];
};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
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
 * full speed. Ball corrections vanish at paddle planes, where the ball shares
 * that paddle's correction. A visible contact therefore uses the same geometry
 * as the projected collision, rather than an independently animated rectangle.
 */
export class ParticipantReconciliation {
 private paddles:[number,number]=[0,0];
 private balls=new Map<number,{x:number;y:number;continuity:string}>();
 reset(){this.paddles=[0,0];this.balls.clear();}
 sample(current:ParticipantPose,previous:ParticipantPose|undefined,elapsedMs:number,local?:{side:0|1;direction:number}):ParticipantPose{
  const dt=clamp(elapsedMs,0,50);
  for(const side of [0,1] as const){
   if(previous)this.paddles[side]+=previous.paddles[side]-current.paddles[side];
   // Slower than the 180 px/s base paddle: acknowledging a held direction
   // must not visibly reverse it. Bounds consume excess error, not bank it.
   // A stopped local paddle must not retain the asymptotic tail of an ACK.
   // Consume the error at the same bounded correction speed. A normal 3px
   // receipt difference ends within 25ms instead of sliding for ~400ms.
   // Large discrepancies still reconcile honestly; never pin a false position.
   this.paddles[side]=local?.side===side&&local.direction===0
    ?this.paddles[side]-clamp(this.paddles[side],-120*dt/1000,120*dt/1000)
    :settle(this.paddles[side],dt,120);
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
   const ownY=ball.y+error.y;
   const contact=(side:0|1)=>{
    const distance=ball.y-current.paddles[side],edge=current.halves[side]+6;
    if(Math.abs(distance)<=edge)return this.paddles[side]-error.y;
    // A distant miss has no contact with this paddle. Its correction cannot
    // drag the ball vertically (+40px in contpvp8 while 178px above it).
    // Only move a miss if the drawn paddle would otherwise cover its path.
    const boundary=current.paddles[side]+this.paddles[side]+Math.sign(distance)*(edge+.001);
    return distance<0?Math.min(0,boundary-ownY):Math.max(0,boundary-ownY);
   };
   // Even a large correction must not move a real bounce through its paddle,
   // or turn an already missed plane into a second chance.
   return {...ball,x:ball.x<40?Math.min(40,x):ball.x>984?Math.max(984,x):clamp(x,40,984),
    y:clamp(ownY+contact(0)*left+contact(1)*right,6,570)};
  });
  for(const id of this.balls.keys())if(!current.balls.some(b=>b.id===id))this.balls.delete(id);
  return {paddles:current.paddles.map((y,i)=>y+this.paddles[i]) as [number,number],halves:current.halves,balls};
 }
}
