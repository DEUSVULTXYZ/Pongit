import type {Page} from '@playwright/test';

/** Test-only instrumentation. Record public court state, never wallet props. */
export async function installSyncProbe(page:Page){
 await page.addInitScript(()=>{
  const data={frames:[] as any[],snapshots:[] as any[]};
  (window as any).__syncProbe=data;
  let observed=-1,source:any;
  const fill=CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){
   fill.call(this,x,y,w,h);
   if(w!==12||h!==12||this.fillStyle!=='#f3fcff'||!this.canvas.closest('.pool-canvas-slot'))return;
   let fiber=(this.canvas as any)[Object.keys(this.canvas).find(k=>k.startsWith('__reactFiber$'))??''];
   while(fiber&&!fiber.memoizedProps?.matchId)fiber=fiber.return;
   // React may retain the previous committed tree as alternate.
   const props=[fiber?.memoizedProps,fiber?.alternate?.memoizedProps].filter(p=>p?.state)
    .sort((a,b)=>b.observedAt-a.observedAt)[0];
   if(props&&props.observedAt!==observed){
    observed=props.observedAt;source=props;
    if(data.snapshots.length<20000)data.snapshots.push(JSON.parse(JSON.stringify({at:performance.now(),
     observedAt:props.observedAt,clock:props.clock,state:props.state,chaos:props.chaos,
     direction:props.direction,side:props.side,controllable:props.controllable,pending:props.pending},
     (_,v)=>typeof v==='bigint'?v.toString():v)));
   }
   if(data.frames.length<40000)data.frames.push({at:performance.now(),x:x+6,y:y+6,
    sourceT:Number(source?.state?.t??0)/1000,clock:Number(source?.clock??0)/1000,
    score:`${source?.state?.scoreA}:${source?.state?.scoreB}`,rally:this.canvas.dataset.rally,finished:source?.state?.finished,observedAt:observed});
  };
 });
}

export function syncMetrics(data:{frames:any[];snapshots:any[]}){
 const intervals:number[]=[],jumps:any[]=[],ages:number[]=[],lags:number[]=[],gaps:number[]=[];
 let hold=0,maxHold=0;
 for(let i=1;i<data.frames.length;i++){
  const a=data.frames[i-1],b=data.frames[i],dt=b.at-a.at,d=Math.hypot(b.x-a.x,b.y-a.y);
  if(dt>500||a.finished||b.finished)continue;intervals.push(dt);
  if(d<.05)hold+=dt;else{maxHold=Math.max(maxHold,hold);hold=0;}
  // A large single-frame displacement exactly on a snapshot boundary is a
  // reconciliation discontinuity. Keep examples; do not label all teleports bugs.
  if(a.observedAt!==b.observedAt&&(a.rally??a.score)===(b.rally??b.score)&&d>30)jumps.push({at:b.at,dt,d,from:[a.x,a.y],to:[b.x,b.y],sourceT:b.sourceT,clock:b.clock});
 }
 for(let i=0;i<data.snapshots.length;i++){
  const s=data.snapshots[i];lags.push((Number(s.clock)-Number(s.state.t))/1000);
  if(i)gaps.push(s.at-data.snapshots[i-1].at);
 }
 const p95=(v:number[])=>v.sort((a,b)=>a-b)[Math.floor((v.length-1)*.95)];
 return{frames:data.frames.length,snapshots:data.snapshots.length,p95FrameMs:p95(intervals),
  maxHoldMs:Math.max(maxHold,hold),snapshotGapP95Ms:p95(gaps),engineLagP95Ms:p95(lags),snapshotJumps:jumps};
}
