import test from 'node:test';
import assert from 'node:assert/strict';
import {zeroAddress,type Address} from 'viem';
import {independentRoomDiscovery} from '../relayer/src/independent-room-discovery';

test('new rooms are discovered at the head independently of the historical backlog',async()=>{
 const app='0x0000000000000000000000000000000000000001' as Address,seen:bigint[]=[];
 let head=10000n,failed=false;
 const base:any={getBlockNumber:async()=>head,getContractEvents:async(args:any)=>{
  assert.equal(args.toBlock,head);assert.equal(args.fromBlock,head>99n?head-99n:0n);
  if(failed)throw Error('RPC unavailable');
  return [
   {address:app,args:{room:9n}}, {address:app,args:{room:9n}},
   {address:app,args:{room:10n},removed:true}, {address:zeroAddress,args:{room:11n}},
   {address:app,args:{room:0n}}, {address:app,args:{room:'12'}}, {address:app,args:{}},
  ];
 }};
 const discover=independentRoomDiscovery(base,app,[],async room=>{seen.push(room);});
 await discover();assert.deepEqual(seen,[9n]);
 failed=true;await assert.rejects(discover(),/RPC unavailable/);assert.deepEqual(seen,[9n]);
 failed=false;head+=2000n;await discover();assert.deepEqual(seen,[9n,9n]);
 // No negative block range at chain genesis. Deduplication in persistent
 // storage is idempotent; candidate IDs never assert a live proposal.
 head=10n;await discover();assert.deepEqual(seen,[9n,9n,9n]);
});
