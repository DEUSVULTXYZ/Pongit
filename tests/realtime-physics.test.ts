import test from 'node:test';
import assert from 'node:assert/strict';
import {toHex} from 'viem';
import {initial as initialClassic,advance as classic} from '../shared/physics-interlude';
import {initial as initialChaos} from '../shared/physics-rooms-chaos';
import {advance as chaos} from '../shared/physics-realtime-chaos';
test('Realtime Chaos has exactly Classic timing and motion without pressure, including point boundaries',()=>{
 let random=0xabc123;const rand=()=>random=(Math.imul(random,1664525)+1013904223)>>>0;
 for(let i=0;i<1000;i++){
  const seed=toHex(BigInt(rand()),{size:32}),a=initialClassic(seed),b=initialChaos(seed);
  a.leftDir=b.leftDir=rand()%3-1;a.rightDir=b.rightDir=rand()%3-1;
  const target=BigInt(rand()%180000000),limit=[1,2,32,128][rand()%4];
  const [ca,completeA]=classic(a,target,limit),[cb,completeB]=chaos(b,target,limit);
  assert.deepEqual({...cb,mode:0},ca);assert.equal(completeB,completeA);
 }
});
