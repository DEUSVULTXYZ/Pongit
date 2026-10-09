import {rulesPaddleSpeed} from '../shared/physics-rules';
import type {Page} from '@playwright/test';
import {eventPaddles} from '../web/lib/chaos-presentation';
import {chaosOuterHalf} from '../shared/chaos-modifiers';

/** Same-host epoch timestamps include the browser's queued intent before send.
 * Receipt transport latency alone cannot qualify input-to-confirmation latency. */
export function confirmedInputMetrics(intents:{at:number;direction:number}[],receipts:{sentAt?:number;confirmedAt?:number;direction?:number;sequence?:string;hash?:string}[],timings:{stage:string;command?:string;hash?:string;startedAt:number;ms:number;timeOrigin:number}[]=[]){
 const ordered=[...intents].sort((a,b)=>b.at-a.at),confirmed=new Map<number,number>(),mismatches:any[]=[];
 for(const receipt of receipts){
  if(!receipt.sequence||receipt.sentAt===undefined||receipt.confirmedAt===undefined)continue;
  // CDP's wire observation can arrive after a new release, although the
  // previous immutable command was already handed to its journal/transport.
  // Pair the exact receipt hash with the serialized browser transport span.
  // Missing or ambiguous timing evidence keeps the original strict fallback.
  const ack=receipt.hash?timings.filter(t=>t.stage==='acknowledged'&&t.hash?.toLowerCase()===receipt.hash!.toLowerCase()):[];
  const spans=ack.length===1?timings.filter(t=>t.stage==='transport'&&t.command==='input'
   &&Math.abs((t.timeOrigin+t.startedAt+t.ms)-(ack[0].timeOrigin+ack[0].startedAt+ack[0].ms))<.5
   &&t.timeOrigin+t.startedAt<=receipt.sentAt!&&t.timeOrigin+t.startedAt+t.ms<=receipt.confirmedAt!+5):[];
  const entered=spans.length===1?spans[0].timeOrigin+spans[0].startedAt:receipt.sentAt;
  const intent=ordered.find(i=>i.at<=entered!);
  if(!intent)continue;
  if(intent.direction!==receipt.direction){mismatches.push({sentAt:receipt.sentAt,expected:intent.direction,actual:receipt.direction});continue;}
  const elapsed=receipt.confirmedAt-intent.at;
  confirmed.set(intent.at,Math.min(elapsed,confirmed.get(intent.at)??Infinity));
 }
 const samples=[...confirmed.values()];
 samples.sort((a,b)=>a-b);
 return{samples:samples.length,p95Ms:samples[Math.floor((samples.length-1)*.95)],maxMs:samples.at(-1),mismatches};
}

/** Measure the whole held motion and release, rather than the first pixel.
 * Windows touching bounds, pauses, rally changes or effects changing geometry
 * are excluded explicitly, never counted as a passing speed measurement. */
export function sustainedInputMetrics(data:{paddles?:any[];snapshots:any[];keys?:any[];releases?:any[];poses?:any[]}){
 const observations=new Map(data.snapshots.map(s=>[s.observedAt,s]));
 const displayedTime=new Map((data.poses??[]).map(p=>[p.at,BigInt(p.renderedUs)]));
 const changes=[...(data.keys??[]),...(data.releases??[]).map(r=>({...r,direction:0}))].sort((a,b)=>a.at-b.at);
 const ratios:number[]=[],outliers:any[]=[],stops:any[]=[],excluded:Record<string,number>={};
 // RAF's supplied time can precede a key event even when its callback paints
 // after that event. Use the actual canvas-call timestamp for input ownership;
 // retain RAF deltas for the renderer's integrated velocity calculation.
 const paintedAt=(frame:any)=>Number.isFinite(frame.paintedAt)&&frame.paintedAt>=frame.at?frame.paintedAt:frame.at;
 const reject=(reason:string)=>{excluded[reason]=(excluded[reason]??0)+1;};
 const speed=(frame:any)=>{const s=observations.get(frame.observedAt);
  if(!s||!s.controllable||(s.pause?.status??0)>=2)return;
  if(s.chaos){const raw=s.chaos.physics,p=eventPaddles({...raw,t:displayedTime.get(frame.at)??BigInt(raw.t),paddleSpeed:rulesPaddleSpeed(s.rulesVersion??0)});
   return Number(frame.side===0?p.speedA:p.speedB)/1e6;}
  return Number(rulesPaddleSpeed(s.rulesVersion??0))/1e6;
 };
 for(let index=0;index<changes.length;index++){
  const input=changes[index],end=changes.slice(index+1).find(c=>c.side===input.side)?.at??Infinity;
  const frames=(data.paddles??[]).filter(p=>p.side===input.side&&paintedAt(p)>=input.at&&paintedAt(p)<end&&!p.finished);
  if(input.direction===0){
   const prior=[...(data.paddles??[])].reverse().find(p=>p.side===input.side&&paintedAt(p)<=input.at);
   const sample=frames.filter(p=>paintedAt(p)<input.at+250&&p.rally===prior?.rally);
   if(prior&&sample.length>=7&&sample.every(p=>speed(p)!==undefined))stops.push({at:input.at,drift:Math.max(...sample.map(p=>Math.abs(p.y-prior.y)))});
   continue;
  }
  if(end-input.at<500){reject('short-intent');continue;}
  for(let i=0;i<frames.length;){
   const a=frames[i],j=frames.findIndex((p,k)=>k>i&&p.at>=a.at+100);
   if(j<0)break;
   const b=frames[j],window=frames.slice(i,j+1);i=j;
   if(window.some(p=>p.rally!==a.rally||p.height!==a.height)){reject('rally-or-geometry');continue;}
   if(window.some(p=>p.top<=2||p.bottom>=574)){reject('wall');continue;}
   if(window.some((p,k)=>k&&p.at-window[k-1].at>50)){reject('render-gap');continue;}
   const velocities=window.map(speed);
   if(velocities.some(v=>v===undefined)){reject('pause-or-unavailable');continue;}
   let expected=0;for(let k=1;k<window.length;k++)expected+=velocities[k-1]!*(window[k].at-window[k-1].at)/1000;
   if(expected>0){
    const ratio=(b.y-a.y)*input.direction/expected;ratios.push(ratio);
    if(ratio<.95||ratio>1.05)outliers.push({from:a.at,to:b.at,side:input.side,direction:input.direction,fromY:a.y,toY:b.y,expected,ratio});
   }
  }
 }
 const q=(values:number[],p:number)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*p)];
 return{held:{samples:ratios.length,p05Ratio:q(ratios,.05),p95Ratio:q(ratios,.95),minRatio:ratios.length?Math.min(...ratios):undefined,maxRatio:ratios.length?Math.max(...ratios):undefined,
  outsideTarget:ratios.filter(r=>r<.95||r>1.05).length,outliers},stopping:{samples:stops.length,p95Drift:q(stops.map(s=>s.drift),.95),maxDrift:stops.length?Math.max(...stops.map(s=>s.drift)):undefined,stops},excluded};
}

/** Test-only instrumentation. Record public court state, never wallet props. */
export async function installSyncProbe(page:Page){
 await page.addInitScript(()=>{
  const data={poses:[] as any[],frames:[] as any[],snapshots:[] as any[],paddles:[] as any[],waiting:[] as any[],layout:[] as any[],corrections:[] as any[],keys:[] as any[],releases:[] as any[]};
  window.addEventListener('keydown',e=>{const direction=['ArrowUp','KeyW'].includes(e.code)?-1:['ArrowDown','KeyS'].includes(e.code)?1:0;
   if(direction&&!e.repeat){const s=data.snapshots.at(-1);if(s?.controllable&&s.side>=0)data.keys.push({at:performance.now(),direction,side:s.side});}
  });
  window.addEventListener('keyup',e=>{if(['ArrowUp','KeyW','ArrowDown','KeyS'].includes(e.code)){
   const s=data.snapshots.at(-1);if(s?.controllable&&s.side>=0)data.releases.push({at:performance.now(),side:s.side});
  }});
  window.addEventListener('pointerup',e=>{if((e.target as Element)?.closest('button[aria-label="Move up"],button[aria-label="Move down"]')){
   const s=data.snapshots.at(-1);if(s?.controllable&&s.side>=0)data.releases.push({at:performance.now(),side:s.side});
  }});
  window.addEventListener('pointerdown',e=>{const label=(e.target as Element)?.closest('button')?.getAttribute('aria-label');
   if(label==='Move up'||label==='Move down'){const s=data.snapshots.at(-1);if(s?.controllable&&s.side>=0)data.keys.push({at:performance.now(),side:s.side,direction:label==='Move up'?-1:1});}
  });
  window.addEventListener('pongit:court-frame',(e:any)=>{if(data.poses.length<40000)data.poses.push(e.detail);});
  window.addEventListener('pongit:presentation-timing',(e:any)=>{if(data.corrections.length<40000)data.corrections.push(e.detail);});
  let waitKey='',layoutKey='',frameAt:number|undefined;
  const raf=requestAnimationFrame;window.requestAnimationFrame=callback=>raf(t=>{frameAt=t;try{callback(t);}finally{frameAt=undefined;}});
  setInterval(()=>{const court=document.querySelector('.pool-canvas-slot canvas,.rooms-canvas canvas');if(!court)return;
   const paused=!!document.querySelector('[aria-label="Match paused"]'),sync=!!document.querySelector('.pool-canvas-slot [data-arcade-progress="synchronizing"],.rooms-canvas [data-arcade-progress="synchronizing"]'),cause=(court as HTMLElement).dataset.waitCause??'';
   const key=JSON.stringify([paused,sync,cause]);if(key!==waitKey){waitKey=key;data.waiting.push({at:performance.now(),paused,sync,cause});}
   const rect=court.getBoundingClientRect();
   const layout={x:rect.x,y:rect.y,width:rect.width,height:rect.height,viewportWidth:innerWidth,viewportHeight:innerHeight,
    scrollY,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight};
   const nextLayout=JSON.stringify(layout);
   if(rect.width>0&&nextLayout!==layoutKey&&data.layout.length<10000){layoutKey=nextLayout;data.layout.push({at:performance.now(),...layout});}
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
     observedAt:props.observedAt,matchId:props.matchId,rulesVersion:props.rulesVersion,clock:props.clock,state:props.state,chaos:props.chaos,
     direction:props.direction,side:props.side,controllable:props.controllable,pending:props.pending,pause:props.housePrediction?.pause,
     housePrediction:props.housePrediction,coherentControls:props.coherentControls,progressionLimit:props.progressionLimit},
     (_,v)=>typeof v==='bigint'?v.toString():v)));
   }
   if(paddle){
    const side=x===22?0:1,last=data.paddles.at(-1);
    // Split-paddle sprites are two pieces of one actor in the same paint.
    if(last?.paint===paint&&last.side===side){last.top=Math.min(last.top,y);last.bottom=Math.max(last.bottom,y+h);last.y=(last.top+last.bottom)/2;last.height=last.bottom-last.top;}
    else if(data.paddles.length<80000)data.paddles.push({at:this.canvas.dataset.frameAt?Number(this.canvas.dataset.frameAt):frameAt??performance.now(),paintedAt:performance.now(),paint,side,y:y+h/2,height:h,top:y,bottom:y+h,
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

export function syncMetrics(data:{frames:any[];snapshots:any[];paddles?:any[];waiting?:any[];corrections?:any[];keys?:any[];releases?:any[];poses?:any[]}){
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
 const paddleJumps:any[]=[],geometryClamps:any[]=[],last=new Map<number,any>();
 const byObservation=new Map(data.snapshots.map(s=>[s.observedAt,s]));
 const snapshotIndex=new Map(data.snapshots.map((s,i)=>[s.observedAt,i]));
 const poses=new Map((data.poses??[]).map(p=>[p.at,p]));
 for(const b of data.paddles??[]){
  const a=last.get(b.side);last.set(b.side,b);if(!a||a.finished||b.finished||a.rally!==b.rally)continue;
  const dt=b.at-a.at;if(dt<=0||dt>50)continue;
  const snapshot=byObservation.get(b.observedAt);let speed=Number(rulesPaddleSpeed(snapshot?.rulesVersion??0))/1e6;
  let confirmedHalf=Number(snapshot?.state?.[b.side===0?'halfA':'halfB'])/1e6;
  if(snapshot?.chaos){
   const raw=snapshot.chaos.physics;
   const mods=eventPaddles({...raw,t:BigInt(raw.t),paddleSpeed:rulesPaddleSpeed(snapshot?.rulesVersion??0)});
   speed=Number(b.side===0?mods.speedA:mods.speedB)/1e6;
   confirmedHalf=Number(chaosOuterHalf(b.side===0?mods.heightA:mods.heightB,b.side===0?mods.splitA:mods.splitB))/1e6;
  }
  const d=Math.abs(b.y-a.y),limit=(speed+120)*dt/1000+2;
  if(d>limit){
   const clamped=Math.max(confirmedHalf,Math.min(576-confirmedHalf,a.y));
   const liveCenter=Number(snapshot?.state?.[b.side===0?'left':'right'])/1e6;
   // An enlarged paddle at the wall must move its centre to stay in bounds.
   // Classify only the exact live-confirmed clamp, never any jump merely
   // coinciding with an effect or a different sprite height.
   let scheduledConfirmation:any;
   if(b.height>a.height&&snapshot?.chaos){
    const raw=snapshot.chaos.physics,t=BigInt(raw.t),index=snapshotIndex.get(b.observedAt)!;
    // The mirror may cross an already known effect boundary before the next live
    // frame. Accept only the exact scheduled size/clamp, then require a live
    // confirmation within 100 ms. Unknown effects or unconfirmed predictions
    // remain failures; this is not a general exemption for Chaos jumps.
    boundaries:for(const effect of raw.effects)for(const boundary of ['start','expiry'] as const){
     const end=BigInt(boundary==='start'?effect.startsAt:effect.expiresAt)*1000n;if(!effect.id||end<=t)continue;
     if(boundary==='start'||end>t+100000n){
      // A known future draw can start beyond the old 100 ms expiry window.
      // Require the two actual rendered poses to straddle its exact time.
      // Missing poses, changed reference/source/rally or early resizing fail.
      const previous=poses.get(a.at),current=poses.get(b.at);
      const identity=String(snapshot.matchId??snapshot.state.id);
      const matchingRef=identity.includes(':')?current?.ref===identity:String(current?.ref).split(':').at(-1)===identity;
      if(!previous||!current||previous.ref!==current.ref||!matchingRef
       ||previous.rally!==a.rally||current.rally!==b.rally
       ||BigInt(previous.sourceUs)!==t||BigInt(current.sourceUs)!==t
       ||BigInt(previous.renderedUs)>=end||BigInt(current.renderedUs)<end)continue;
     }
     const predicted=eventPaddles({...raw,t:end,paddleSpeed:rulesPaddleSpeed(snapshot.rulesVersion)});
     const half=Number(chaosOuterHalf(b.side===0?predicted.heightA:predicted.heightB,b.side===0?predicted.splitA:predicted.splitB))/1e6;
     const expected=Math.max(half,Math.min(576-half,a.y));
     if(Math.abs(b.height/2-half)>.001||Math.abs(b.y-expected)>.001||Math.abs(expected-a.y)<=.001)continue;
     const next=data.snapshots.slice(index+1,index+5).find(s=>s.at>=b.paintedAt&&s.at-b.paintedAt<=100&&BigInt(s.state.t)>=end);
     if(!next?.chaos||next.rulesVersion!==snapshot.rulesVersion||(next.matchId??next.state.id)!==(snapshot.matchId??snapshot.state.id)
      ||next.state.scoreA!==snapshot.state.scoreA||next.state.scoreB!==snapshot.state.scoreB)continue;
     if(next.chaos.physics.effects.some((e:any)=>e.id&&!raw.effects.some((old:any)=>old.id===e.id&&old.serial===e.serial&&old.startsAt===e.startsAt&&old.expiresAt===e.expiresAt)))continue;
     const actual=eventPaddles({...next.chaos.physics,t:BigInt(next.chaos.physics.t),paddleSpeed:rulesPaddleSpeed(next.rulesVersion)});
     const actualHalf=Number(chaosOuterHalf(b.side===0?actual.heightA:actual.heightB,b.side===0?actual.splitA:actual.splitB))/1e6;
     if(Math.abs(actualHalf-half)<.001&&Math.abs(Number(next.state[b.side===0?'left':'right'])/1e6-expected)<.001){scheduledConfirmation={effect:effect.id,boundary,startsAt:effect.startsAt,expiresAt:effect.expiresAt,confirmedAt:next.at,delayMs:next.at-b.paintedAt};break boundaries;}
    }
   }
   if(scheduledConfirmation){
    geometryClamps.push({at:b.at,side:b.side,from:a.y,to:b.y,oldHeight:a.height,newHeight:b.height,observedAt:b.observedAt,scheduledConfirmation});
   }else if(b.height>a.height&&Math.abs(b.height/2-confirmedHalf)<.001&&Math.abs(clamped-a.y)>.001
    &&Math.abs(b.y-clamped)<.001&&Math.abs(liveCenter-clamped)<.001){
    geometryClamps.push({at:b.at,side:b.side,from:a.y,to:b.y,oldHeight:a.height,newHeight:b.height,observedAt:b.observedAt});
   }else paddleJumps.push({at:b.at,side:b.side,dt,d,limit,from:a.y,to:b.y,observedAt:b.observedAt});
  }
 }
 const playStart=data.frames.find(f=>f.sourceT>0&&!f.finished)?.at??Infinity;
 const playEnd=[...data.frames].reverse().find(f=>!f.finished&&f.sourceT>0)?.at??0;
 const visibleResyncs=(data.waiting??[]).filter(w=>w.at>=playStart&&w.at<=playEnd&&w.sync&&!w.paused).length;
 const correctionValues=(data.corrections??[]).flatMap(c=>c.paddleError.map(Math.abs));
 const correction={samples:correctionValues.length,p95Pixels:p95(correctionValues),maxPixels:correctionValues.length?Math.max(...correctionValues):undefined};
 const localSamples:number[]=[],localMisses:any[]=[];
 for(const key of data.keys??[]){const paddles=(data.paddles??[]).filter(p=>p.side===key.side),before=[...paddles].reverse().find(p=>(p.paintedAt??p.at)<=key.at);
  if(!before||before.finished)continue;
  // A paddle held at the physical wall cannot move further in that direction.
  if(key.direction<0&&before.top<=1||key.direction>0&&before.bottom>=575)continue;
  const after=paddles.find(p=>(p.paintedAt??p.at)>key.at&&(p.paintedAt??p.at)<=key.at+500&&(p.y-before.y)*key.direction>.1);
  if(after)localSamples.push((after.paintedAt??after.at)-key.at);else localMisses.push(key);
 }
 const localInput={samples:localSamples.length,p95Ms:p95(localSamples),misses:localMisses};
 const stops=(data.releases??[]).flatMap(release=>{
  const next=(data.keys??[]).find(k=>k.at>release.at)?.at??Infinity;
  const frames=(data.paddles??[]).filter(p=>p.side===release.side&&p.at>=release.at+50&&p.at<Math.min(next,release.at+250)&&!p.finished);
  if(frames.length<7)return [];
  return [{at:release.at,driftPixels:Math.max(...frames.map(p=>p.y))-Math.min(...frames.map(p=>p.y))}];
 });
 const stopping={samples:stops.length,p95DriftPixels:p95(stops.map(s=>s.driftPixels)),maxDriftPixels:stops.length?Math.max(...stops.map(s=>s.driftPixels)):undefined,stops};
 return{localInput,stopping,correction,visibleResyncs,frames:data.frames.length,snapshots:data.snapshots.length,startupFillMs:filling.length?filling.at(-1).at-filling[0].at:0,p95FrameMs:p95(intervals),
  maxHoldMs:Math.max(maxHold,hold),contractPauseMs,intermissionMs,holds,frameGaps,snapshotGapP95Ms:p95(gaps),engineLagP95Ms:p95(lags),snapshotJumps:jumps,
  paddleSamples:data.paddles?.length??0,paddleJumps,geometryClamps};
}
