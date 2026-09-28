import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {clockProgression,type ClockSample} from '../shared/clock-progression';
const sample=(t:number,p=t,r=t,finished=false):ClockSample=>({sampledAt:String(t),processedUs:String(p*1000),renderedUs:String(r*1000),finished:String(finished)});
describe('Draw-aligned clock measurement',()=>{
 it('deduplicates delayed DOM polls without counting their time as a stall',()=>{
  assert.deepEqual(clockProgression([sample(100),sample(100),sample(1100),sample(1100),sample(2100)],2000),{samples:3,durationMs:2000,processedRatio:1,renderedRatio:1,stalledSamples:0});
 });
 it('reports a genuine rendered slowdown independently of the engine',()=>{
  const result=clockProgression([sample(0),sample(10000,10000,9700)],10000);assert.equal(result.processedRatio,1);assert.equal(result.renderedRatio,.97);
 });
 it('does not let a terminal hold supply the required active duration',()=>{
  assert.throws(()=>clockProgression([sample(0),sample(1000),sample(10000,1000,1000,true)],9000),/Insufficient active/);
 });
 it('rejects a clock reset rather than silently removing it',()=>{
  assert.throws(()=>clockProgression([sample(1000),sample(2000,500,500)],1000),/Clock reset/);
 });
});
