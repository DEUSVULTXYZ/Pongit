/** Inspect every painted ball, including multiball. A ball leaving the court
 * through the solid part of a painted paddle is a visual collision failure,
 * even when the server correctly classified a miss. No future bounce excuses it. */
export function paddleCrossings(poses:any[],paddles:any[],snapshots:any[]=[]){
 const geometry=new Map<string,any>();
 for(const p of paddles)geometry.set(`${p.at}:${p.side}`,p);
 const states=new Map<string,any>();
 for(const s of snapshots)states.set(String(s.state?.t),s.chaos?.physics);
 const crossings:any[]=[];
 for(let i=1;i<poses.length;i++){
  const a=poses[i-1],b=poses[i];
  if(a.ref!==b.ref||a.rally!==b.rally||b.at-a.at<=0||b.at-a.at>100)continue;
  for(const next of b.balls??[]){
   const prior=a.balls.find((x:any)=>x.id===next.id);if(!prior)continue;
   for(const side of [0,1]){
    const plane=side===0?40:984,sign=side===0?-1:1;
    if((prior.x-plane)*sign>0||(next.x-plane)*sign<=0)continue;
    const fraction=(plane-prior.x)/(next.x-prior.x);
    if(fraction<0||fraction>1)continue;
    const first=geometry.get(`${a.at}:${side}`),last=geometry.get(`${b.at}:${side}`);
    if(!first||!last||first.height!==last.height)continue;
    const y=prior.y+(next.y-prior.y)*fraction;
    const centre=a.paddles[side]+(b.paddles[side]-a.paddles[side])*fraction;
    const state=states.get(String(b.sourceUs)),ms=Number(b.renderedUs)/1000;
    const split=state?.effects?.some((e:any)=>e.id===11&&e.target===side&&ms>=e.startsAt&&ms<e.expiresAt);
    // Canvas probe combines the two split pieces; subtract their empty gap.
    const half=last.height/2,delta=y-centre;
    const penetration=split?Math.max(Math.min(delta+6+half,-8-(delta-6)),Math.min(delta+6-8,half-(delta-6))):half+6-Math.abs(delta);
    crossings.push({at:a.at+(b.at-a.at)*fraction,ball:next.id,side,rally:b.rally,
     y,paddle:centre,height:last.height,split:!!split,penetration,throughPaddle:penetration>.5});
   }
  }
 }
 return {crossings,throughPaddle:crossings.filter(c=>c.throughPaddle)};
}
