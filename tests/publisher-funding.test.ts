import test from 'node:test';import assert from 'node:assert/strict';
import {publisherFunding} from '../shared/publisher-funding';
const a='0x0000000000000000000000000000000000000001';
test('idle arenas share a minimum funding check, cannot claim an empty publisher is ready, and reobserve a top-up',async()=>{
 let now=0,balance=100000000000000000n,reads=0;
 const read=publisherFunding({getBalance:async()=>{reads++;return balance;},getGasPrice:async()=>102000000000n} as any,()=>now);
 const results=await Promise.all(Array.from({length:8},()=>read(a)));
 assert(results.every(r=>!r.funded));assert.equal(reads,1);assert.equal(results[0].minimum,2937600000000000000n);
 balance=10000000000000000000n;now=7600;assert.equal((await read(a)).funded,true);assert.equal(reads,2);
});
test('an expired funding observation with failed RPC does not authorize a new admission',async()=>{
 let now=0,broken=false;const read=publisherFunding({getBalance:async()=>{if(broken)throw Error('offline');return 10n**20n;},getGasPrice:async()=>102000000000n} as any,()=>now);
 assert.equal((await read(a)).funded,true);broken=true;now=7600;await assert.rejects(read(a),/offline/);
});
