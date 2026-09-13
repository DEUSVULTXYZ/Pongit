import assert from 'node:assert/strict';
import {test} from 'node:test';
import {announceEffect,emptyEffects,effectPaddleHit,consumeShield,breakChaosBrick,collectChaosPickup,expireEffects} from '../shared/chaos-effects';
import {resolveChaosGoals} from '../shared/chaos-rally';
test('charges, bricks and hot potato keep their own slot and expire',()=>{
 let [es]=announceEffect(emptyEffects(),4,0,0,1,0);[es]=announceEffect(es,6,0,0,2,0);
 const [after,shot]=effectPaddleHit(es,0,0,10n,true,1000);assert.equal(after[0].id,0);assert.equal(after[1].id,6);assert.deepEqual(shot,{numerator:78,denominator:50,curveSign:0,consumedMask:1});
 [es]=announceEffect(emptyEffects(),10,0,0,1,0);[es]=effectPaddleHit(es,1,0,0n,false,4999);[es]=effectPaddleHit(es,0,0,0n,false,5000);assert.equal(es[0].target,1);
 [es]=announceEffect(emptyEffects(),3,0,0,1,0);[es]=announceEffect(es,19,0,0,2,0);
 let saved;[es,saved]=consumeShield(es,0,1000);assert(saved);[,saved]=consumeShield(es,0,1000);assert(!saved);
 es=breakChaosBrick(es,1,0,1000);assert.throws(()=>breakChaosBrick(es,1,0,1000));es=breakChaosBrick(es,1,1,1000);es=breakChaosBrick(es,1,2,1000);assert.deepEqual(es,emptyEffects());
});
test('every mystery reward refreshes without stacking and preserves last hitter ownership',()=>{
 for(let id=1;id<=4;id++){
  let [es]=announceEffect(emptyEffects(),id,0,0,1,0);[es]=announceEffect(es,24,0,id-1,2,0);
  const [next,reward]=collectChaosPickup(es,1,1,2000);assert.equal(reward,id);assert.equal(next[1].id,0);assert.equal(next[0].target,1);assert.equal(next[0].serial,2);
  assert.deepEqual(expireEffects(next,next[0].expiresAt)[0],emptyEffects());
 }
});
test('jackpot finishes at seven, duplicate results are inert, opposite goals void a real rally',()=>{
 for(const a of [5,6]){
  const [s,point,result]=resolveChaosGoals({a,b:6,rally:20,finished:false,winner:0},1,true);
  assert(point&&result);assert.equal(s.a,7);assert.equal(s.rally,21);assert.deepEqual(resolveChaosGoals(s,2,true),[s,false,false]);
 }
 const [s,p,r]=resolveChaosGoals({a:6,b:6,rally:20,finished:false,winner:0},3,true);assert(!p&&!r);assert.equal(s.rally,21);assert.equal(s.a+s.b,12);
});
