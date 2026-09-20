import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256} from 'viem';
import {pinnedEngineCodeHash} from '../shared/engine-base-code';
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
