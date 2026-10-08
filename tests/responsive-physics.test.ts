import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zeroHash} from 'viem';
import {initial,move} from '../shared/physics-v2';
import {initialChaosEvents,advanceChaosEvents} from '../shared/physics-chaos-events';
import {responsiveState} from '../shared/physics-rules';
import {chaosPaddles} from '../shared/chaos-modifiers';
import {projectParticipant,projectChaosParticipant} from '../web/lib/participant-projection';
import {sustainedInputMetrics} from '../scripts/browser-sync-probe';

test('Chaos976 release window ends at the next real input, not an earlier RAF timestamp',()=>{
 const frame=(at:number,paintedAt:number,y:number)=>({at,paintedAt,y,side:0,observedAt:0,top:y-48,bottom:y+48,height:96,rally:'1'});
 const trace={snapshots:[{observedAt:0,rulesVersion:17,controllable:true}],
  keys:[{at:121,side:0,direction:1}],releases:[{at:10,side:0}],
  paddles:[frame(0,1,100),...Array.from({length:9},(_,i)=>frame(15+i*11,16+i*11,100)),frame(119,122,105)]};
 assert.equal(sustainedInputMetrics(trace).stopping.maxDrift,0,'a frame painted after the next key is commanded motion');
 const drift=structuredClone(trace);drift.paddles[4].y=103;
 assert.equal(sustainedInputMetrics(drift).stopping.maxDrift,3,'real movement during the released interval must still fail');
});

test('rules 17 and 18 move both paddles at 300 while historical rules retain 180',()=>{
 for(const rules of [14,15,16,17,18]){
  const speed=rules>=17?300:180;
  const classic=move(responsiveState({...initial(zeroHash),leftDir:-1,rightDir:1},rules),500_000n);
  assert.equal(classic.left,BigInt(288-speed/2)*1_000_000n);assert.equal(classic.right,BigInt(288+speed/2)*1_000_000n);
  const [chaos]=advanceChaosEvents(responsiveState({...initialChaosEvents(zeroHash),leftDir:-1,rightDir:1},rules),500_000n,256,true,'complete');
  assert.equal(chaos.left,BigInt(288-speed/2)*1_000_000_000_000n);assert.equal(chaos.right,BigInt(288+speed/2)*1_000_000_000_000n);
 }
});
test('new speed preserves compounded Chaos multipliers before integer rounding',()=>{
 const effects=[{id:2,target:0,startsAt:0n,expiresAt:10000n,consumed:false},{id:8,target:0,startsAt:0n,expiresAt:10000n,consumed:false}] as const;
 const p=chaosPaddles(96000000n,96000000n,effects,10n,300000000n);
 assert.equal(p.speedA,312000000n);assert.equal(p.speedB,300000000n);
});
for(const rules of [16,17,18])test(`rules ${rules}: unacknowledged Classic contact does not reverse the ball; the paddle remains responsive`,()=>{
 const s=responsiveState({...initial(zeroHash),x:60_000_000n,y:288_000_000n,vx:-200_000_000n,vy:1n,left:350_000_000n},rules);
 const pending=[{side:0 as const,direction:-1 as const,at:0n,confirmed:false}];
 const held=projectParticipant(s,200_000n,pending);
 assert(held.contactBoundary);assert(held.state.vx<0n);assert.equal(held.state.scoreB,0);
 assert.equal(held.state.left,BigInt(rules>=17?290:314)*1_000_000n,'the contact fence does not block the next movement');
 const confirmed=projectParticipant(s,200_000n,[{...pending[0],confirmed:true}]);assert(confirmed.state.vx>0n);
});
for(const rules of [16,17,18])test(`rules ${rules}: unacknowledged Chaos impact has neither a reflected trajectory nor an impact event`,()=>{
 const s=responsiveState(initialChaosEvents(zeroHash),rules);s.left=350_000_000_000_000n;
 s.balls[0]={...s.balls[0],x:60_000_000_000_000n,y:288_000_000_000_000n,vx:-200_000_000n,vy:1n};
 const pending=[{side:0 as const,direction:-1 as const,at:0n,confirmed:false}];
 const held=projectChaosParticipant(s,200_000n,pending,'complete');
 assert(held.contactBoundary);assert(held.state.balls[0].vx<0n);assert(!held.collisions.some(c=>c.kind===3));
 assert.equal(held.state.left,BigInt(rules>=17?290:314)*1_000_000_000_000n);
});
test('whole-motion measurement rejects resistance that a first-pixel latency test misses',()=>{
 const trace=(speed:number)=>({snapshots:[{observedAt:0,rulesVersion:17,controllable:true,state:{paddleSpeed:300000000}}],keys:[{at:0,side:0,direction:1}],releases:[{at:600,side:0}],
  paddles:Array.from({length:60},(_,i)=>({at:i*10,side:0,observedAt:0,y:100+speed*i/100,top:52+speed*i/100,bottom:148+speed*i/100,height:96,rally:'1'}))});
 assert.equal(sustainedInputMetrics(trace(300)).held.outsideTarget,0);
 assert(sustainedInputMetrics(trace(180)).held.outsideTarget>0);
});

test('held speed measurement follows the displayed expiry of a Chaos speed effect',()=>{
 const physics=initialChaosEvents(zeroHash);
 physics.effects[0]={...physics.effects[0],id:2,target:0,startsAt:0,expiresAt:300};
 const samples=Array.from({length:60},(_,i)=>{const at=i*10,y=100+390*Math.min(at,300)/1000+300*Math.max(at-300,0)/1000;
  return {at,side:0,observedAt:0,y,top:y-48,bottom:y+48,height:96,rally:'1'};});
 const trace={snapshots:[{observedAt:0,rulesVersion:17,controllable:true,chaos:{physics}}],keys:[{at:0,side:0,direction:1}],releases:[{at:600,side:0}],
  paddles:samples,poses:samples.map(p=>({at:p.at,renderedUs:String(p.at*1000)}))};
 assert.equal(sustainedInputMetrics(trace).held.outsideTarget,0);
 assert(sustainedInputMetrics({...trace,poses:undefined}).held.outsideTarget>0,'A stale snapshot clock misclassifies a legitimate expiry');
});
