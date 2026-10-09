import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedInputMetrics,syncMetrics} from '../scripts/browser-sync-probe';

test('a release after journal entry cannot invalidate the previous immutable command',()=>{
 const intents=[{at:100,direction:-1},{at:203,direction:0}];
 const receipts=[{sentAt:204,confirmedAt:225,direction:-1,sequence:'77',hash:'0xabc'}];
 const timings=[{stage:'transport',command:'input',startedAt:200,ms:20,timeOrigin:0},
  {stage:'acknowledged',command:'input',startedAt:199,ms:21,timeOrigin:0,hash:'0xabc'}];
 assert.equal(confirmedInputMetrics(intents,receipts,timings).mismatches.length,0);
 assert.equal(confirmedInputMetrics(intents,receipts,timings).p95Ms,125);
 assert.equal(confirmedInputMetrics(intents,receipts).mismatches.length,1);
 assert.equal(confirmedInputMetrics([{at:100,direction:-1},{at:199,direction:0}],receipts,timings).mismatches.length,1);
 assert.equal(confirmedInputMetrics(intents,receipts,[...timings,timings[0]]).mismatches.length,1);
 assert.equal(confirmedInputMetrics(intents,receipts,[timings[0],{...timings[1],hash:'0xother'}]).mismatches.length,1);
});

test('render metrics separate explicit contract pauses without hiding unmarked stalls',()=>{
 const frame=(at:number,pauseStatus=0)=>({at,x:10,y:10,sourceT:1000,clock:1000,observedAt:at,score:'0:0',pauseStatus});
 const stalled=syncMetrics({frames:Array.from({length:9},(_,i)=>frame(i*100)),snapshots:[]});
 assert.equal(stalled.maxHoldMs,800);assert.equal(stalled.contractPauseMs,0);
 const paused=syncMetrics({frames:Array.from({length:9},(_,i)=>frame(i*100,3)),snapshots:[]});
 assert.equal(paused.maxHoldMs,0);assert.equal(paused.contractPauseMs,800);
 const mixed=syncMetrics({frames:[...Array.from({length:7},(_,i)=>frame(i*100)),frame(700,2),frame(800,3)],snapshots:[]});
 assert.equal(mixed.maxHoldMs,600);assert.equal(mixed.contractPauseMs,200);
});

test('render gate catches paddle rollback even when the ball looks smooth',()=>{
 const paddle=(at:number,y:number,rally='0')=>({at,y,rally,side:0,observedAt:at,height:96});
 const failed=syncMetrics({frames:[],snapshots:[],paddles:[paddle(0,228),paddle(16,288)]});
 assert.equal(failed.paddleJumps.length,1);assert.equal(failed.paddleJumps[0].d,60);
 const smooth=syncMetrics({frames:[],snapshots:[],paddles:[paddle(0,228),paddle(16,225),paddle(32,200,'1')]});
 assert.equal(smooth.paddleJumps.length,0,'ordinary motion and new rally remain distinct');
});

test('991 enlarged paddle at the wall is an exact confirmed geometry clamp, not rollback',()=>{
 const paddles=[{at:0,y:48,rally:'3',side:0,observedAt:0,height:96},
  {at:16.8,y:60,rally:'3',side:0,observedAt:16,height:120}];
 const snapshots=[{at:16,observedAt:16,rulesVersion:17,clock:'11000000',state:{t:'11000000',left:'60000000',halfA:'48000000'},
  chaos:{physics:{t:'11000000',bettingA:96000000,bettingB:96000000,effects:[
   {id:23,target:2,remaining:0,serial:1,startsAt:11000,expiresAt:19000,variant:476415606},
   {id:0,target:0,remaining:0,serial:0,startsAt:0,expiresAt:0,variant:0},
  ]}}}];
 const result=syncMetrics({frames:[],snapshots,paddles});
 assert.equal(result.paddleJumps.length,0);assert.equal(result.geometryClamps.length,1);
 assert.equal(syncMetrics({frames:[],snapshots:[],paddles}).paddleJumps.length,1);
 for(const change of [
  (d:any)=>d.paddles[1].y=70,
  (d:any)=>d.paddles[1].height=100,
  (d:any)=>d.snapshots[0].state.left='48000000',
  (d:any)=>d.snapshots[0].chaos.physics.effects[0].id=0,
 ]){const d=structuredClone({frames:[],snapshots,paddles});change(d);assert.equal(syncMetrics(d).paddleJumps.length,1);}
});

test('confirmed input includes the unsent queue and both sides of F5',()=>{
 const value=confirmedInputMetrics([{at:100,direction:-1},{at:800,direction:0},{at:1200,direction:1}],
  [{sentAt:600,confirmedAt:615,direction:-1,sequence:'1'},
   {sentAt:805,confirmedAt:820,direction:0,sequence:'2'},
   {sentAt:1230,confirmedAt:1250,direction:1,sequence:'3'}]);
 assert.equal(value.samples,3);assert.equal(value.maxMs,515);assert.deepEqual(value.mismatches,[]);
});

test('1595 discontinuity uses actual paints after an immediate input microtask',()=>{
 const paddles=[
  {at:25363.60000014305,paintedAt:25364.10000014305,integratedAt:25363.60000014305,y:348,height:96,rally:'1:3',side:0,observedAt:1},
  {at:25364,paintedAt:25372.10000014305,integratedAt:25371.300000190735,y:345.6899999856949,height:96,rally:'1:3',side:0,observedAt:1}];
 const snapshots=[{at:25331,observedAt:1,rulesVersion:17,clock:'15300000',state:{t:'15300000',left:'348000000',halfA:'48000000'}}];
 assert.equal(syncMetrics({frames:[],snapshots,paddles}).paddleJumps.length,0);
 const jumped=structuredClone(paddles);jumped[1].y=330;
 assert.equal(syncMetrics({frames:[],snapshots,paddles:jumped}).paddleJumps.length,1,'Real jumps still fail with actual paint times');
 const unmeasured=paddles.map(({paintedAt,...p})=>p);
 assert.equal(syncMetrics({frames:[],snapshots,paddles:unmeasured}).paddleJumps.length,1,'No inferred paint delay without evidence');
});

test('1581 wall growth preserves a diminishing visual offset without inventing rollback',()=>{
 for(const bottom of [false,true]){
  const y=(v:number)=>bottom?576-v:v;
  const snap=(at:number,t:string,centre:number)=>({at,observedAt:at,rulesVersion:17,clock:t,
   state:{id:'1581',t,right:String(y(centre)*1e6),scoreA:2,scoreB:4},
   chaos:{physics:{t,bettingA:96000000,bettingB:96000000,effects:[{id:1,target:1,remaining:0,serial:3,startsAt:30800,expiresAt:36800,variant:0},
    {id:0,target:0,remaining:0,serial:0,startsAt:0,expiresAt:0,variant:0}]}}});
  const trace={frames:[],snapshots:[snap(0,'30710000',48),snap(16,'30810000',60)],paddles:[
   {at:0,y:y(48.3995062328),rally:'6',side:1,observedAt:0,height:96},
   {at:16.7,y:y(60.3380620189),rally:'6',side:1,observedAt:16,height:120}]};
  const m=syncMetrics(trace);assert.equal(m.paddleJumps.length,0);assert.equal(m.geometryClamps.length,1);
  for(const change of [
   (d:any)=>d.snapshots.shift(),(d:any)=>d.snapshots[0].state.right=String(y(52)*1e6),
   (d:any)=>d.paddles[1].y=y(61),(d:any)=>d.paddles[1].y=y(59.9),
   (d:any)=>d.paddles[1].height=110,(d:any)=>d.snapshots[1].chaos.physics.effects[0].id=0,
  ]){const d=structuredClone(trace);change(d);assert.equal(syncMetrics(d).paddleJumps.length,1);}
 }
});

test('1322 known small-paddle expiry needs exact geometry and prompt live confirmation',()=>{
 const none={id:0,target:0,remaining:0,serial:0,startsAt:0,expiresAt:0,variant:0};
 const before={at:100,observedAt:100,rulesVersion:17,clock:'46490000',state:{id:'1322',t:'46490000',left:'38400000',scoreA:1,scoreB:2},
  chaos:{physics:{t:'46490000',bettingA:96000000,bettingB:96000000,effects:[{...none,id:7,serial:3,startsAt:40500,expiresAt:46500},none]}}};
 const after={...structuredClone(before),at:150,observedAt:150,state:{...before.state,t:'46540000',left:'48000000'},chaos:{physics:{...before.chaos.physics,t:'46540000',effects:[none,none]}}};
 // Keep the synthetic9.6-unit clamp above the ordinary18ms motion budget.
 const d={frames:[],snapshots:[before,after],paddles:[{at:80,paintedAt:82,y:38.4,height:76.8,rally:'8',side:0,observedAt:100},
  {at:97,paintedAt:100,y:48,height:96,rally:'8',side:0,observedAt:100}]};
 const metrics=syncMetrics(d);assert.equal(metrics.paddleJumps.length,0);assert.equal(metrics.geometryClamps[0].scheduledConfirmation.delayMs,50);
 for(const change of [
  (x:any)=>x.snapshots.pop(),(x:any)=>x.snapshots[1].at=201,
  (x:any)=>x.snapshots[1].state.left='47000000',(x:any)=>x.snapshots[1].state.id='other',
  (x:any)=>x.paddles[1].y=55,(x:any)=>x.paddles[1].height=100,
  (x:any)=>x.snapshots[0].chaos.physics.effects[0].expiresAt=47000,
  (x:any)=>x.snapshots[1].chaos.physics.effects[1]={...none,id:4,serial:4,startsAt:46500,expiresAt:50000},
 ]){const x=structuredClone(d);change(x);assert.equal(syncMetrics(x).paddleJumps.length,1);}
});
test('known paddle-growth start needs an exact rendered boundary and prompt live confirmation',()=>{
 const effect={id:23,target:2,remaining:0,serial:6,startsAt:66060,expiresAt:74060,variant:63647900};
 const before={at:100,observedAt:100,rulesVersion:18,clock:'65950000',state:{id:'24',t:'65950000',left:'48000000',scoreA:6,scoreB:4},
  chaos:{physics:{t:'65950000',bettingA:96000000,bettingB:96000000,effects:[effect,{...effect,id:0,startsAt:0,expiresAt:0}]}}};
 const after={...structuredClone(before),at:250,observedAt:250,state:{...before.state,t:'66100000',left:'60000000'},
  chaos:{physics:{...before.chaos.physics,t:'66100000'}}};
 const d={frames:[],snapshots:[before,after],poses:[{at:180,renderedUs:'66053000',sourceUs:'65950000',ref:'10143:arena:1:24',rally:'11'},
  {at:197,renderedUs:'66070000',sourceUs:'65950000',ref:'10143:arena:1:24',rally:'11'}],
  paddles:[{at:180,paintedAt:183,y:48,height:96,rally:'11',side:0,observedAt:100},
   {at:197,paintedAt:200,y:60,height:120,rally:'11',side:0,observedAt:100}]};
 const metrics=syncMetrics(d);assert.equal(metrics.paddleJumps.length,0);
 assert.equal(metrics.geometryClamps[0].scheduledConfirmation.boundary,'start');
 assert.equal(metrics.geometryClamps[0].scheduledConfirmation.delayMs,50);
 const fullyBound=structuredClone(d) as any;
 for(const snapshot of fullyBound.snapshots)snapshot.matchId='10143:arena:1:24';
 assert.equal(syncMetrics(fullyBound).paddleJumps.length,0,'current probes record the complete match reference');
 for(const wrong of ['10143:other:1:24','10143:arena:2:24','4242:arena:1:24']){
  const x=structuredClone(fullyBound);for(const snapshot of x.snapshots)snapshot.matchId=wrong;
  assert.equal(syncMetrics(x).paddleJumps.length,1,'same numeric ID on another reference is not confirmation');
 }
 for(const change of [
  (x:any)=>x.poses.pop(),(x:any)=>x.poses[0].renderedUs='66061000',
  (x:any)=>x.poses[1].renderedUs='66059000',(x:any)=>x.poses[1].sourceUs='0',
  (x:any)=>x.poses[1].ref='10143:other:1:24',(x:any)=>x.poses[1].rally='12',
  (x:any)=>x.poses.forEach((p:any)=>p.ref='10143:arena:1:25'),
  (x:any)=>x.snapshots.pop(),(x:any)=>x.snapshots[1].at=301,
  (x:any)=>x.snapshots[1].state.left='48000000',(x:any)=>x.paddles[1].y=70,
  (x:any)=>x.snapshots[0].chaos.physics.effects[0].startsAt=67000,
 ]){const x=structuredClone(d);change(x);assert.equal(syncMetrics(x).paddleJumps.length,1);}
});

test('coalesced inputs measure the latest intention and flag obsolete directions',()=>{
 const intents=[{at:100,direction:-1},{at:120,direction:1}];
 const result=confirmedInputMetrics(intents,[{sentAt:10,confirmedAt:15,direction:0,sequence:'1'},
  {sentAt:130,confirmedAt:140,direction:1,sequence:'2'},
  {sentAt:160,confirmedAt:170,direction:-1,sequence:'3'}]);
 assert.equal(result.samples,1);assert.equal(result.p95Ms,20);assert.equal(result.mismatches.length,1);
 assert.equal(confirmedInputMetrics(intents,[]).p95Ms,undefined);
});
test('automatic neutral resend after F5 cannot count one already confirmed keyup twice',()=>{
 const value=confirmedInputMetrics([{at:100,direction:0}],
  [{sentAt:110,confirmedAt:125,direction:0,sequence:'2'},
   {sentAt:4000,confirmedAt:4020,direction:0,sequence:'3'}]);
 assert.equal(value.samples,1);assert.equal(value.maxMs,25);
});

test('release drift measures the stopped interval and excludes the next movement',()=>{
 const paddles=Array.from({length:30},(_,i)=>({at:100+i*10,side:0,y:i<15?200+i/10:260,finished:false}));
 const result=syncMetrics({frames:[],snapshots:[],paddles,releases:[{at:100,side:0}],keys:[{at:250,side:0,direction:1}]});
 assert.equal(result.stopping.samples,1);
 assert(Math.abs(result.stopping.maxDriftPixels!-.9)<.00001);
 const short=syncMetrics({frames:[],snapshots:[],paddles:paddles.slice(0,8),releases:[{at:100,side:0}]});
 assert.equal(short.stopping.samples,0,'A few frames cannot qualify the full release interval');
});

test('known small-paddle expiry beyond 100 ms needs an exact rendered boundary and prompt live confirmation',()=>{
 const effect={id:9,target:0,remaining:0,serial:6,startsAt:58060,expiresAt:66060,variant:63647900};
 const before={at:100,observedAt:100,rulesVersion:18,clock:'65950000',matchId:'24',state:{t:'65950000',left:'38400000',scoreA:6,scoreB:4},
  chaos:{physics:{t:'65950000',bettingA:96000000,bettingB:96000000,effects:[effect,{...effect,id:0,startsAt:0,expiresAt:0}]}}};
 const after={...structuredClone(before),at:250,observedAt:250,state:{...before.state,t:'66100000',left:'48000000'},
  chaos:{physics:{...before.chaos.physics,t:'66100000'}}};
 const d={frames:[],snapshots:[before,after],poses:[{at:180,renderedUs:'66053000',sourceUs:'65950000',ref:'10143:arena:1:24',rally:'11'},
  {at:197,renderedUs:'66070000',sourceUs:'65950000',ref:'10143:arena:1:24',rally:'11'}],
  paddles:[{at:180,paintedAt:183,y:38.4,height:76.8,rally:'11',side:0,observedAt:100},
   {at:197,paintedAt:200,y:48,height:96,rally:'11',side:0,observedAt:100}]};
 const metrics=syncMetrics(d);assert.equal(metrics.paddleJumps.length,0);
 assert.equal(metrics.geometryClamps[0].scheduledConfirmation.boundary,'expiry');
 assert.equal(metrics.geometryClamps[0].scheduledConfirmation.delayMs,50);
 for(const change of [
  (x:any)=>x.poses.pop(),(x:any)=>x.poses[0].renderedUs='66061000',
  (x:any)=>x.poses[1].renderedUs='66059000',(x:any)=>x.poses[1].sourceUs='0',
  (x:any)=>x.poses[1].ref='10143:other:1:24',(x:any)=>x.poses[1].rally='12',
  (x:any)=>x.poses.forEach((p:any)=>p.ref='10143:arena:1:25'),
  (x:any)=>x.snapshots.pop(),(x:any)=>x.snapshots[1].at=301,
  (x:any)=>x.snapshots[1].state.left='38000000',(x:any)=>x.paddles[1].y=70,
  (x:any)=>x.snapshots[0].chaos.physics.effects[0].expiresAt=67000,
 ]){const x=structuredClone(d);change(x);assert.equal(syncMetrics(x).paddleJumps.length,1);}
});
