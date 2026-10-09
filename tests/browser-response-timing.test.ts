import test from 'node:test';
import assert from 'node:assert/strict';
import {browserResponseTiming,browserSocketErrorTiming} from '../scripts/browser-response-timing';
import {deliveryEvidence} from '../scripts/browser-delivery-evidence';

test('delayed harness callbacks do not reverse browser receipt and duplicate order',()=>{
 const native=browserResponseTiming({startTime:1000,requestStart:.1,responseStart:11.7,responseEnd:12.2},1218,{offsetMs:-.3,uncertaintyMs:.3});
 assert(native);assert.equal(native.confirmedAt,1012.2);assert.equal(native.ms,12.1);
 const hash=`0x${'ab'.repeat(32)}`,error={at:1200,hash,error:true,message:'nonce 78 too low, expected 80'};
 assert.equal(deliveryEvidence([error],[{hash,status:'0x1',confirmedAt:1218}]).unresolved.length,1);
 assert.equal(deliveryEvidence([error],[{hash,status:'0x1',confirmedAt:native.confirmedAt}]).unresolved.length,0);
});

test('receipt body completion, not headers, establishes confirmation',()=>{
 const result=browserResponseTiming({startTime:1000,requestStart:1,responseStart:12,responseEnd:250},1300,{offsetMs:0,uncertaintyMs:1});
 assert.equal(result?.confirmedAt,1251);
 assert.equal(result?.ms,249);
});

test('invalid clocks and incomplete or future bodies cannot backdate a receipt',()=>{
 const t={startTime:1000,requestStart:1,responseStart:12,responseEnd:14},a={offsetMs:0,uncertaintyMs:1};
 for(const timing of [{...t,responseEnd:-1},{...t,startTime:NaN},{...t,responseEnd:11},{...t,requestStart:-1}])
  assert.equal(browserResponseTiming(timing,1100,a),undefined);
 assert.equal(browserResponseTiming(t,1010,a),undefined);
 for(const alignment of [undefined,{...a,uncertaintyMs:6},{...a,offsetMs:NaN}])
  assert.equal(browserResponseTiming(t,1100,alignment),undefined);
});

test('socket error uses the earliest aligned time, never delayed callback time',()=>{
 assert.equal(browserSocketErrorTiming(1200,{offsetMs:-2,uncertaintyMs:1}),1197);
 for(const alignment of [undefined,{offsetMs:0,uncertaintyMs:6},{offsetMs:NaN,uncertaintyMs:1}])
  assert.equal(browserSocketErrorTiming(1200,alignment),undefined);
 assert.equal(browserSocketErrorTiming(NaN,{offsetMs:0,uncertaintyMs:1}),undefined);
});
