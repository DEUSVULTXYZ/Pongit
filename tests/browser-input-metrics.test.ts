import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedInputMetrics,syncMetrics} from '../scripts/browser-sync-probe';

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

test('confirmed input includes the unsent queue and both sides of F5',()=>{
 const value=confirmedInputMetrics([{at:100,direction:-1},{at:800,direction:0},{at:1200,direction:1}],
  [{sentAt:600,confirmedAt:615,direction:-1,sequence:'1'},
   {sentAt:805,confirmedAt:820,direction:0,sequence:'2'},
   {sentAt:1230,confirmedAt:1250,direction:1,sequence:'3'}]);
 assert.equal(value.samples,3);assert.equal(value.maxMs,515);assert.deepEqual(value.mismatches,[]);
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
