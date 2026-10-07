/** Drawn poses come from the same values passed to the canvas primitives.
 * Match every visible paddle reflection to a live collision, not to another
 * predicted frame. Missing evidence is a failure, not an inferred success. */
export function collisionIntegrity(poses:any[]){
 const hits=poses.flatMap(p=>(p.collisions??[]).map((h:any)=>({...h,observedAt:p.at})));
 const previous=new Map<number,{pose:any;ball:any;direction:number}>(),bounces:any[]=[];
 for(const p of poses)for(const ball of p.balls??[]){
  const old=previous.get(ball.id),dx=old?ball.x-old.ball.x:0;
  const dir=Math.abs(dx)>.05?Math.sign(dx):old?.direction??0;
  previous.set(ball.id,{pose:p,ball,direction:dir});
  if(!old||p.rally!==old.pose.rally||p.at-old.pose.at>100||old.direction===0||dir===old.direction)continue;
  const side=old.direction<0&&dir>0?0:1,plane=side===0?40:984;
  if(Math.abs(old.ball.x-plane)>30||Math.abs(ball.x-plane)>60)continue;
  const time=Number(p.renderedUs),kind=side===0?3:4;
  const confirmed=p.rules>=9
   ?hits.some(h=>h.rally===Number(p.rally)&&h.ball===ball.id&&h.kind===kind&&Math.abs(Number(h.at)-time)<=150000&&h.observedAt<=p.at+500)
   :false;
  // Classic has no collision log: require an actual live velocity reversal
  // within the contact region and unchanged score, never a renderer reversal.
  const classic=!p.collisions?.length&&!String(p.rally).match(/^\d+$/);
  const liveClassic=classic&&poses.some(q=>q.at>=old.pose.at-150&&q.at<=p.at+500&&q.rally===p.rally
   &&Math.sign(Number(q.sourceVelocity?.vx))===dir&&Math.abs(Number(q.sourceVelocity?.x)/1e6-plane)<100);
  bounces.push({at:p.at,ball:ball.id,side,rally:p.rally,renderedUs:p.renderedUs,confirmed:confirmed||liveClassic});
 }
 return{samples:poses.length,visiblePaddleBounces:bounces.length,unconfirmed:bounces.filter(b=>!b.confirmed),bounces};
}
