import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zeroHash,type Hex} from 'viem';
import {ChaosBeaconPump} from '../shared/chaos-beacon-pump';
const signature=`0x${'12'.repeat(64)}` as Hex;
const proof={round:1n,signature,randomness:zeroHash};
test('a delayed beacon is deduplicated and never sent to a changed epoch or completed game',async()=>{
 let release!:()=>void,reads=0,sends=0;const ready=new Promise<void>(resolve=>release=resolve);
 const pump=new ChaosBeaconPump({read:async()=>{reads++;await ready;return proof;}},()=>1727521076000);
 const state={playing:true,request:1n,pending:0n};
 const first=pump.offer('a:1:1',state,async()=>({...state,request:2n}),async()=>{sends++;});
 const second=pump.offer('a:1:1',state,async()=>state,async()=>{sends++;});
 assert.equal(first,second);release();await first;assert.equal(reads,1);assert.equal(sends,0);
 await pump.offer('a:1:1',state,async()=>({...state,playing:false}),async()=>{sends++;});assert.equal(sends,0);
});
test('only the committed round is transported; future, pending and competing proofs wait',async()=>{
 let count=0;const state={playing:true,request:1n,pending:0n};
 const pump=new ChaosBeaconPump({read:async round=>{assert.equal(round,1n);return proof;}},()=>1727521076000);
 await pump.offer('a',state,async()=>state,async(q,s)=>{assert.equal(q,1n);assert.equal(s,signature);count++;});
 await pump.offer('a',{...state,request:10n},async()=>state,async()=>{count++;});
 await pump.offer('a',{...state,pending:3n},async()=>state,async()=>{count++;});
 await pump.offer('a',state,async()=>({...state,pending:1n}),async()=>{count++;});assert.equal(count,1);
});
test('failed retrieval respects retryAt without suspending any other arena',async()=>{
 let now=1727521076000,reads=0;const state={playing:true,request:1n,pending:0n};
 const pump=new ChaosBeaconPump({read:async()=>{reads++;throw Object.assign(Error('later'),{retryAt:now+10000});}},()=>now);
 await assert.rejects(pump.offer('a',state,async()=>state,async()=>{}));
 await pump.offer('a',state,async()=>state,async()=>{});assert.equal(reads,1);
 await assert.rejects(pump.offer('b',state,async()=>state,async()=>{}));assert.equal(reads,2);
 now+=10001;await assert.rejects(pump.offer('a',state,async()=>state,async()=>{}));assert.equal(reads,3);
});
