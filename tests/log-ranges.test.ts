import test from 'node:test';import assert from 'node:assert/strict';import {chunkedLogs} from '../relayer/src/log-ranges';
test('historical log chunks preserve filters, exact bounds and canonical ordering',async()=>{
 const filter={fromBlock:'0x64',toBlock:'0x190',address:['0xaa','0xbb'],topics:[['0xcc']]},calls:any[]=[];let running=0,max=0;
 const logs=await chunkedLogs(filter,async f=>{calls.push(f);max=Math.max(max,++running);await new Promise(r=>setTimeout(r,2));running--;return [{blockNumber:f.toBlock,transactionIndex:'0x1',logIndex:'0x2'},{blockNumber:f.fromBlock,transactionIndex:'0x0',logIndex:'0x1'}];},100,2000);
 assert.deepEqual(calls.map(x=>[x.fromBlock,x.toBlock]),[['0x64','0xc7'],['0xc8','0x12b'],['0x12c','0x18f'],['0x190','0x190']]);assert(calls.every(x=>x.address===filter.address&&x.topics===filter.topics));assert(max<=4);assert.equal(logs?.length,8);assert(logs!.every((x,i)=>i===0||BigInt(x.blockNumber)>=BigInt(logs![i-1].blockNumber)));
});
test('historical reads reject oversized or failed ranges and leave small/block-hash requests alone',async()=>{
 let calls=0;const send=async()=>{calls++;return [];};assert.equal(await chunkedLogs({fromBlock:'0x0',toBlock:'0x63'},send,100,2000),null);assert.equal(await chunkedLogs({blockHash:'0xaa'},send,100,2000),null);assert.equal(calls,0);
 await assert.rejects(()=>chunkedLogs({fromBlock:'0x0',toBlock:'0x7d0'},send,100,2000),/bound/);await assert.rejects(()=>chunkedLogs({fromBlock:'0x0',toBlock:'0xc8'},async()=>{throw Error('provider unavailable');},100,2000),/provider unavailable/);
});
