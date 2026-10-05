export type ParticipantPose={
 paddles:[number,number]; halves:[number,number];
 balls:{id:number;x:number;y:number;continuity:string}[];
};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const settle=(n:number,dt:number,speed:number)=>{
 const change=n*(1-Math.exp(-dt/100));
 return n-clamp(change,-speed*dt/1000,speed*dt/1000);
};

/** Reconcile the picture, never the authoritative state or input timestamps.
 * On a new receipt compare both reconstructions at the SAME display time. Only
 * their error is blended; ordinary motion and new direction changes keep their
 * full speed. Ball corrections vanish at paddle planes, where the ball shares
 * that paddle's correction. A visible contact therefore uses the same geometry
 * as the projected collision, rather than an independently animated rectangle.
 */
export class ParticipantReconciliation {
 private paddles:[number,number]=[0,0];
 private balls=new Map<number,{x:number;y:number;continuity:string}>();
 reset(){this.paddles=[0,0];this.balls.clear();}
 sample(current:ParticipantPose,previous:ParticipantPose|undefined,elapsedMs:number):ParticipantPose{
  const dt=clamp(elapsedMs,0,50);
  for(const side of [0,1] as const){
   if(previous)this.paddles[side]+=previous.paddles[side]-current.paddles[side];
   // Slower than the 180 px/s base paddle: acknowledging a held direction
   // must not visibly reverse it. Bounds consume excess error, not bank it.
   this.paddles[side]=settle(this.paddles[side],dt,120);
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
   const left=clamp((168-ball.x)/128,0,1),right=clamp((ball.x-856)/128,0,1),free=1-left-right;
   return {...ball,x:ball.x+error.x*free,
    y:clamp(ball.y+error.y*free+this.paddles[0]*left+this.paddles[1]*right,6,570)};
  });
  for(const id of this.balls.keys())if(!current.balls.some(b=>b.id===id))this.balls.delete(id);
  return {paddles:current.paddles.map((y,i)=>y+this.paddles[i]) as [number,number],halves:current.halves,balls};
 }
}
