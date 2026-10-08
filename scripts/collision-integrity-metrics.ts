/** Drawn poses come from the same values passed to the canvas primitives.
 * Match every visible paddle reflection to a live collision, not to another
 * predicted frame. HTTP reads omit event logs, but preserve the authoritative
 * contact counter and last hitter. Missing evidence still fails. */
export function collisionIntegrity(poses:any[],snapshots:any[]=[]){
 const byTime=new Map<string,any[]>();
 for(const s of snapshots){const key=String(s.state?.t);byTime.set(key,[...(byTime.get(key)??[]),s]);}
 const source=(p:any)=>byTime.get(String(p.sourceUs))?.find(s=>s.at<=p.at+5
  &&s.state.vx===p.sourceVelocity?.vx&&s.state.x===p.sourceVelocity?.x
  &&s.state.scoreA===p.sourceVelocity?.score?.[0]&&s.state.scoreB===p.sourceVelocity?.score?.[1])?.chaos?.physics;
 const liveContact=(old:any,p:any,id:number,side:number,dir:number,plane:number)=>{
  const a=source(old),b=source(p),x=a?.balls?.[id-1],y=b?.balls?.[id-1];
  if(!a||!b||!x?.alive||!y?.alive)return false;
  const elapsed=Number(b.t)-Number(a.t);
  // lastHitter changes only on an actual paddle collision. Require exactly one
  // intervening collision and the same live ball/rally/score; a wall, portal,
  // new serve, predicted velocity or later event cannot satisfy this proof.
  // HTTP fallback can observe 310–400 ms apart under the explicit 150 ms RTT
  // trial. The counter, last hitter and same-pose source prove the collision;
  // a 150 ms sampling assumption must not discard that proof. Keep the 500 ms
  // freshness bound and reject every ambiguous multi-collision transition.
  return elapsed>0&&elapsed<=500000&&Number(a.score.rally)===Number(p.rally)&&a.score.rally===b.score.rally
   &&a.score.a===b.score.a&&a.score.b===b.score.b&&b.collisionSequence===a.collisionSequence+1
   &&x.lastHitter!==side&&y.lastHitter===side&&x.trailRevision===y.trailRevision
   &&Math.sign(Number(x.vx))===-dir&&Math.sign(Number(y.vx))===dir
   &&Math.abs(Number(x.x)/1e12-plane)<100&&Math.abs(Number(y.x)/1e12-plane)<100;
 };
 const hits=poses.flatMap(p=>(p.collisions??[]).map((h:any)=>({...h,observedAt:p.at})));
 const previous=new Map<number,{pose:any;ball:any;direction:number}>(),bounces:any[]=[],subpixelCorrections:any[]=[],shieldBounces:any[]=[];
 for(const [frameIndex,p] of poses.entries())for(const ball of p.balls??[]){
  const old=previous.get(ball.id),dx=old?ball.x-old.ball.x:0;
  const dir=Math.abs(dx)>.05?Math.sign(dx):old?.direction??0;
  previous.set(ball.id,{pose:p,ball,direction:dir});
  if(!old||p.rally!==old.pose.rally||p.at-old.pose.at>100||old.direction===0||dir===old.direction)continue;
  const side=old.direction<0&&dir>0?0:1,plane=side===0?40:984;
  if(Math.abs(old.ball.x-plane)>30||Math.abs(ball.x-plane)>60)continue;
  const next=poses[frameIndex+1],nextBall=next?.balls?.find((b:any)=>b.id===ball.id);
  // A tiny reconciliation before the contact plane is not a paddle hit. Keep
  // it separately observable, and only classify it when the very next frame
  // and both authoritative velocities still travel toward the same paddle.
  // Larger, sustained, at-contact or velocity-reversing movements still fail.
  if(ball.id===1&&Math.abs(dx)<=.25&&(old.ball.x-plane)*dir>6&&(ball.x-plane)*dir>6
   &&Math.sign(Number(old.pose.sourceVelocity?.vx))===old.direction
   &&Math.sign(Number(p.sourceVelocity?.vx))===old.direction
   &&next?.rally===p.rally&&next.at-p.at>0&&next.at-p.at<=50&&nextBall
   &&(nextBall.x-ball.x)*old.direction>.25){
   subpixelCorrections.push({at:p.at,ball:ball.id,units:Math.abs(dx),x:ball.x});
   previous.set(ball.id,{pose:p,ball,direction:old.direction});continue;
  }
  const time=Number(p.renderedUs),kind=side===0?3:4;
  const shieldPlane=side===0?16:1008;
  const incoming=ball.id===1?old.pose.sourceVelocity?.vx:source(old.pose)?.balls?.[ball.id-1]?.vx;
  const outgoing=ball.id===1?p.sourceVelocity?.vx:source(p)?.balls?.[ball.id-1]?.vx;
  const shield=(p.collisions??[]).find((h:any)=>h.rally===Number(p.rally)&&h.ball===ball.id&&h.kind===(side===0?7:8)
   &&Math.abs(Number(h.at)-time)<=150000&&Number(h.at)<=Number(p.sourceUs??time)
   &&Math.abs(Number(h.x)/1e12-shieldPlane)<.01);
  if(shield&&(old.ball.x-plane)*dir<0&&(ball.x-plane)*dir<0
    &&Math.sign(Number(incoming))===-dir&&Math.sign(Number(outgoing))===dir){
   shieldBounces.push({at:p.at,ball:ball.id,side,rally:p.rally,kind:shield.kind,sequence:shield.sequence,evidence:'live-shield-event'});continue;
  }
  const confirmed=p.rules>=9
   ?hits.some(h=>h.rally===Number(p.rally)&&h.ball===ball.id&&h.kind===kind&&Math.abs(Number(h.at)-time)<=150000&&h.observedAt<=p.at+500)
   :false;
  // Classic has no collision log: require an actual live velocity reversal
  // within the contact region and unchanged score, never a renderer reversal.
  const classic=!p.collisions?.length&&!String(p.rally).match(/^\d+$/);
  const liveClassic=classic&&poses.some(q=>q.at>=old.pose.at-150&&q.at<=p.at+500&&q.rally===p.rally
   &&Math.sign(Number(q.sourceVelocity?.vx))===dir&&Math.abs(Number(q.sourceVelocity?.x)/1e6-plane)<100);
  const transition=!confirmed&&liveContact(old.pose,p,ball.id,side,dir,plane);
  bounces.push({at:p.at,ball:ball.id,side,rally:p.rally,renderedUs:p.renderedUs,confirmed:confirmed||transition||liveClassic,
   evidence:confirmed?'live-event':transition?'live-contact-transition':liveClassic?'live-classic-reversal':null});
 }
 return{samples:poses.length,visiblePaddleBounces:bounces.length,unconfirmed:bounces.filter(b=>!b.confirmed),bounces,subpixelCorrections,shieldBounces};
}
