import test from 'node:test';
import assert from 'node:assert/strict';
import {rpcQueueMetrics} from '../relayer/src/rpc-queue-metrics';
test('queue and network latency retain distinct bounded windows without payloads',()=>{
 let now=1000;const stats=rpcQueueMetrics(()=>now);
 stats.record('primary','live','eth_getTransactionReceipt','queue',2200);
 stats.record('primary','live','eth_getTransactionReceipt','network',40);
 const value=stats.snapshot();
 assert.equal(value.groups['primary:live:eth_getTransactionReceipt:queue'].max,2200);
 assert.equal(value.groups['primary:live:eth_getTransactionReceipt:network'].max,40);
 value.groups['primary:live:eth_getTransactionReceipt:queue'].histogram[0]=99;
 assert.equal(stats.snapshot().groups['primary:live:eth_getTransactionReceipt:queue'].histogram[0],0);
 now=61000;assert.deepEqual(stats.snapshot().groups,{});
});
test('unrecognized methods and arbitrary variety cannot grow diagnostic storage',()=>{
 const stats=rpcQueueMetrics(()=>0);
 for(let i=0;i<200;i++)stats.record('primary','live','eth_'+String.fromCharCode(65+i%26)+String.fromCharCode(65+Math.floor(i/26)),'queue',i);
 stats.record('primary','live','https://private.invalid/secret','network',10);
 const snapshot=stats.snapshot();assert(Object.keys(snapshot.groups).length<=97);
 assert(!JSON.stringify(snapshot).includes('secret'));
});
