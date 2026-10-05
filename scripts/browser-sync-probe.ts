import type {Page} from '@playwright/test';
import {eventPaddles} from '../web/lib/chaos-presentation';

/** Same-host epoch timestamps include the browser's queued intent before send.
 * Receipt transport latency alone cannot qualify input-to-confirmation latency. */
export function confirmedInputMetrics(intents:{at:number;direction:number}[],receipts:{sentAt?:number;confirmedAt?:number;direction?:number;sequence?:string}[]){
 const ordered=[...intents].sort((a,b)=>b.at-a.at),confirmed=new Map<number,number>(),mismatches:any[]=[];
 for(const receipt of receipts){
  if(!receipt.sequence||receipt.sentAt===undefined||receipt.confirmedAt===undefined)continue;
  const intent=ordered.find(i=>i.at<=receipt.sentAt!);
  if(!intent)continue;
  if(intent.direction!==receipt.direction){mismatches.push({sentAt:receipt.sentAt,expected:intent.direction,actual:receipt.direction});continue;}
  const elapsed=receipt.confirmedAt-intent.at;
  confirmed.set(intent.at,Math.min(elapsed,confirmed.get(intent.at)??Infinity));
 }
 const samples=[...confirmed.values()];
 samples.sort((a,b)=>a-b);
 return{samples:samples.length,p95Ms:samples[Math.floor((samples.length-1)*.95)],maxMs:samples.at(-1),mismatches};
}

/** Test-only instrumentation. Record public court state, never wallet props. */
export async function installSyncProbe(page:Page){
 await page.addInitScript(()=>{
  const data={frames:[] as any[],snapshots:[] as any[],paddles:[] as any[],waiting:[] as any[],corrections:[] as any[]};
  window.addEventListener('pongit:presentation-timing',(e:any)=>{if(data.corrections.length<40000)data.corrections.push(e.detail);});
  let waitKey='',frameAt:number|undefined;
  const raf=requestAnimationFrame;window.requestAnimationFrame=callback=>raf(t=>{frameAt=t;try{callback(t);}finally{frameAt=undefined;}});
  setInterval(()=>{const court=document.querySelector('.pool-canvas-slot canvas');if(!court)return;
   const paused=!!document.querySelector('[aria-label="Match paused"]'),sync=!!document.querySelector('.pool-canvas-slot [data-arcade-progress="synchronizing"]'),cause=(court as HTMLElement).dataset.waitCause??'';
   const key=JSON.stringify([paused,sync,cause]);if(key!==waitKey){waitKey=key;data.waiting.push({at:performance.now(),paused,sync,cause});}
  },50);
  (window as any).__syncProbe=data;
  let observed=-1,source:any,paint=0;
  const transform=CanvasRenderingContext2D.prototype.setTransform;
  CanvasRenderingContext2D.prototype.setTransform=function(...args:any[]){
   (transform as any).apply(this,args);
   if(this.canvas.closest('.pool-canvas-slot,.rooms-canvas'))paint++;
  };
  const fill=CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){
   fill.call(this,x,y,w,h);
   const paddle=w===12&&h>=32&&(x===22||x===990)&&this.fillStyle instanceof CanvasGradient;
   const ball=w===12&&h===12&&this.fillStyle==='#f3fcff';
   if((!paddle&&!ball)||!this.canvas.closest('.pool-canvas-slot,.rooms-canvas'))return;
   let fiber=(this.canvas as any)[Object.keys(this.canvas).find(k=>k.startsWith('__reactFiber$'))??''];
   while(fiber&&!fiber.memoizedProps?.matchId)fiber=fiber.return;
   // React may retain the previous committed tree as alternate.
   const props=[fiber?.memoizedProps,fiber?.alternate?.memoizedProps].filter(p=>p?.state)
    .sort((a,b)=>b.observedAt-a.observedAt)[0];
   if(props&&props.observedAt!==observed){
    observed=props.observedAt;source=props;
    if(data.snapshots.length<20000)data.snapshots.push(JSON.parse(JSON.stringify({at:performance.now(),
     observedAt:props.observedAt,clock:props.clock,state:props.state,chaos:props.chaos,
     direction:props.direction,side:props.side,controllable:props.controllable,pending:props.pending,pause:props.housePrediction?.pause,
     housePrediction:props.housePrediction,coherentControls:props.coherentControls,progressionLimit:props.progressionLimit},
     (_,v)=>typeof v==='bigint'?v.toString():v)));
   }
   if(paddle){
    const side=x===22?0:1,last=data.paddles.at(-1);
    // Split-paddle sprites are two pieces of one actor in the same paint.
    if(last?.paint===paint&&last.side===side){last.top=Math.min(last.top,y);last.bottom=Math.max(last.bottom,y+h);last.y=(last.top+last.bottom)/2;last.height=last.bottom-last.top;}
    else if(data.paddles.length<80000)data.paddles.push({at:frameAt??performance.now(),paintedAt:performance.now(),paint,side,y:y+h/2,height:h,top:y,bottom:y+h,
     rally:this.canvas.dataset.rally,finished:props?.state?.finished,observedAt:observed});
    return;
   }
   if(data.frames.length<40000)data.frames.push({at:frameAt??performance.now(),paintedAt:performance.now(),x:x+6,y:y+6,
    sourceT:Number(source?.state?.t??0)/1000,clock:Number(source?.clock??0)/1000,
    score:`${source?.state?.scoreA}:${source?.state?.scoreB}`,rally:this.canvas.dataset.rally,buffering:this.canvas.dataset.buffering==='true',finished:source?.state?.finished,
    pauseStatus:source?.housePrediction?.pause?.status??0,awaitingServe:!!source?.state?.awaitingServe,observedAt:observed});
  };
 });
}

export function syncMetrics(data:{frames:any[];snapshots:any[];paddles?:any[];waiting?:any[];corrections?:any[]}){
 const intervals:number[]=[],jumps:any[]=[],lags:number[]=[],gaps:number[]=[],holds:any[]=[],frameGaps:any[]=[];
 let hold=0,maxHold=0,contractPauseMs=0,intermissionMs=0;
 for(let i=1;i<data.frames.length;i++){
  const a=data.frames[i-1],b=data.frames[i],dt=b.at-a.at,d=Math.hypot(b.x-a.x,b.y-a.y);
  if(a.finished||b.finished||!a.sourceT||!b.sourceT||a.buffering||b.buffering){hold=0;continue;}
  if(a.pauseStatus>=2||b.pauseStatus>=2){contractPauseMs+=dt;maxHold=Math.max(maxHold,hold);hold=0;continue;}
  if(a.awaitingServe||b.awaitingServe){intermissionMs+=dt;maxHold=Math.max(maxHold,hold);hold=0;continue;}
  intervals.push(dt);
  if(dt>500){frameGaps.push({at:b.at,ms:dt});hold=0;continue;}
  if(d<.05)hold+=dt;else{maxHold=Math.max(maxHold,hold);if(hold>100)holds.push({at:b.at,ms:hold,sourceT:b.sourceT,rally:b.rally});hold=0;}
  // A large single-frame displacement exactly on a snapshot boundary is a
  // reconciliation discontinuity. Keep examples; do not label all teleports bugs.
  if(a.observedAt!==b.observedAt&&(a.rally??a.score)===(b.rally??b.score)&&d>30)jumps.push({at:b.at,dt,d,from:[a.x,a.y],to:[b.x,b.y],sourceT:b.sourceT,clock:b.clock});
 }
 for(let i=0;i<data.snapshots.length;i++){
  const s=data.snapshots[i];lags.push((Number(s.clock)-Number(s.state.t))/1000);
  if(i)gaps.push(s.at-data.snapshots[i-1].at);
 }
 const p95=(v:number[])=>v.sort((a,b)=>a-b)[Math.floor((v.length-1)*.95)];
 const filling=data.frames.filter(f=>f.sourceT>0&&f.buffering);
 const paddleJumps:any[]=[],last=new Map<number,any>();
 const byObservation=new Map(data.snapshots.map(s=>[s.observedAt,s]));
 for(const b of data.paddles??[]){
  const a=last.get(b.side);last.set(b.side,b);if(!a||a.finished||b.finished||a.rally!==b.rally)continue;
  const dt=b.at-a.at;if(dt<=0||dt>50)continue;
  const snapshot=byObservation.get(b.observedAt);let speed=180;
  if(snapshot?.chaos){
   const raw=snapshot.chaos.physics;
   const mods=eventPaddles({...raw,t:BigInt(raw.t)});
   speed=Number(b.side===0?mods.speedA:mods.speedB)/1e6;
  }
  const d=Math.abs(b.y-a.y),limit=(speed+120)*dt/1000+2;
  if(d>limit)paddleJumps.push({at:b.at,side:b.side,dt,d,limit,from:a.y,to:b.y,observedAt:b.observedAt});
 }
 const playStart=data.frames.find(f=>f.sourceT>0&&!f.finished)?.at??Infinity;
 const playEnd=[...data.frames].reverse().find(f=>!f.finished&&f.sourceT>0)?.at??0;
 const visibleResyncs=(data.waiting??[]).filter(w=>w.at>=playStart&&w.at<=playEnd&&w.sync&&!w.paused).length;
 const correctionValues=(data.corrections??[]).flatMap(c=>c.paddleError.map(Math.abs));
 const correction={samples:correctionValues.length,p95Pixels:p95(correctionValues),maxPixels:correctionValues.length?Math.max(...correctionValues):undefined};
 return{correction,visibleResyncs,frames:data.frames.length,snapshots:data.snapshots.length,startupFillMs:filling.length?filling.at(-1).at-filling[0].at:0,p95FrameMs:p95(intervals),
  maxHoldMs:Math.max(maxHold,hold),contractPauseMs,intermissionMs,holds,frameGaps,snapshotGapP95Ms:p95(gaps),engineLagP95Ms:p95(lags),snapshotJumps:jumps,
  paddleSamples:data.paddles?.length??0,paddleJumps};
}
