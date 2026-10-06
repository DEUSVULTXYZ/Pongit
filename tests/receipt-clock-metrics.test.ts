import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptClockMetrics} from '../scripts/receipt-clock-metrics';

const receipt=(hash:string,block:string,confirmedAt:number,status='0x1')=>({hash,block,confirmedAt,status});
test('successful fast receipts can expose a stalled node clock',()=>{
 const result=receiptClockMetrics([
  receipt('a','0x9c9d6d',1791292242724.2524),
  receipt('b','0x9c9d74',1791292242819.0986),
  receipt('c','0x9c9d74',1791292244605.936),
  receipt('d','0x9c9d74',1791292245272.4602),
  receipt('e','0x9c9d78',1791292245319.3074),
 ]);
 assert.equal(result.stalls.length,1);assert.equal(result.stalls[0].receipts,3);
 assert.equal(result.stalls[0].firstHash,'b');assert.equal(result.stalls[0].lastHash,'d');
 assert.ok(result.maxSameBlockMs>2453&&result.maxSameBlockMs<2454);assert.deepEqual(result.rewinds,[]);
});
test('late polling of the same receipt, failures and missing block metadata are not new executions',()=>{
 const result=receiptClockMetrics([receipt('A','0x1',3000),receipt('a','0x1',100),
  receipt('b','0x1',4000,'0x0'),receipt('c','',5000),receipt('d','0x2',9000)]);
 assert.equal(result.samples,2);assert.equal(result.maxSameBlockMs,0);assert.deepEqual(result.stalls,[]);
});
test('long silence is not a frozen block and a rewind is reported separately',()=>{
 const result=receiptClockMetrics([receipt('c','0x10',2100),receipt('a','0x10',0),receipt('b','0x11',2000)]);
 assert.equal(result.maxSameBlockMs,0);assert.deepEqual(result.stalls,[]);
 assert.deepEqual(result.rewinds,[{at:2100,from:'0x11',to:'0x10',hash:'c'}]);
});
