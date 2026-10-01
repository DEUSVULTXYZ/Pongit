import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256} from 'viem';
import {pinnedEngineCodeHash,pinnedEngineCodeReader} from '../shared/engine-base-code';
const address='0x1111111111111111111111111111111111111111';
test('external strategy code uses the exact agreed opening block, never latest',async()=>{
 const calls:any[]=[];
 const options={address,hubBaseBlock:64187644n,engineBaseBlock:64187644,hubEpoch:1n,engineEpoch:1,
  getCode:async(args:any)=>{calls.push(args);return '0x60006000' as const;}} as const;
 assert.equal(await pinnedEngineCodeHash(options),keccak256('0x60006000'));
 assert.deepEqual(calls,[{address,blockNumber:64187644n}]);
 for(const bad of [{engineBaseBlock:64187645},{engineEpoch:2},{engineBaseBlock:undefined},{engineBaseBlock:Number.MAX_SAFE_INTEGER+1}])
  await assert.rejects(pinnedEngineCodeHash({...options,...bad}));
 assert.equal(calls.length,1,'Mismatched sessions fail before fetching code');
 await assert.rejects(pinnedEngineCodeHash({...options,getCode:async()=>undefined}),/absent/);
});

test('idle code warming coalesces and never crosses epoch, base or controller identity',async()=>{
 let reads=0;const read=pinnedEngineCodeReader(async()=>{reads++;return'0x6000';});
 const o={address,hubBaseBlock:100n,engineBaseBlock:100n,hubEpoch:1n,engineEpoch:1n} as const;
 const [a,b]=await Promise.all([read(o),read(o)]);assert.equal(a,b);assert.equal(reads,1);
 assert.equal(await read(o),a);assert.equal(reads,1);
 await assert.rejects(read({...o,engineEpoch:2n}),/differs/);assert.equal(reads,1,'Cached code cannot bypass a changed engine identity');
 await read({...o,hubEpoch:2n,engineEpoch:2n});assert.equal(reads,2);
 await read({...o,hubBaseBlock:101n,engineBaseBlock:101n});assert.equal(reads,3);
 await read({...o,address:'0x2222222222222222222222222222222222222222'});assert.equal(reads,4);
});

test('failed or empty opening code is retried, never interpreted as a policy',async()=>{
 let reads=0;const read=pinnedEngineCodeReader(async()=>{reads++;if(reads===1)throw Error('429');return reads===2?'0x':'0x6000';});
 const o={address,hubBaseBlock:100n,engineBaseBlock:100n,hubEpoch:1n,engineEpoch:1n} as const;
 await assert.rejects(read(o),/429/);await assert.rejects(read(o),/absent/);
 assert.equal(await read(o),keccak256('0x6000'));assert.equal(reads,3);
});
