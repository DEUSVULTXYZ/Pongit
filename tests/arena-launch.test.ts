import test from 'node:test';
import assert from 'node:assert/strict';
import {zeroAddress} from 'viem';
import {readArenaLaunch} from '../shared/arena-launch';

test('tick countdown reads the contract clock atomically without a pinned batch timestamp',async()=>{
 const node:any={getBlock:async()=>assert.fail('A pinned batch timestamp is not the countdown clock'),
  readContract:async(request:any)=>{assert.equal(request.functionName,'launchClock');assert.deepEqual(request.args,[9n]);return [8000n,5100n];}};
 const result=await readArenaLaunch(node,zeroAddress,9n,'engine-ticks-v1');
 assert.equal(result?.deadline,8000);assert.equal(result.clock,5100);
 assert(result.observedAt<=performance.now());
 node.readContract=async()=>[0n,6000n];assert.equal(await readArenaLaunch(node,zeroAddress,9n,'engine-ticks-v1'),undefined);
 node.readContract=async()=>{throw Error('unavailable');};
 await assert.rejects(readArenaLaunch(node,zeroAddress,9n,'engine-ticks-v1'),/unavailable/);
});

test('historical deployments retain their block-pinned timestamp interface',async()=>{
 const node:any={getBlock:async()=>({number:25n,timestamp:101n}),readContract:async(request:any)=>{
  assert.equal(request.functionName,'launchAt');assert.equal(request.blockNumber,25n);return 103n;
 }};
 const result=await readArenaLaunch(node,zeroAddress,9n);
 assert.equal(result?.deadline,103000);assert.equal(result.clock,101000);
});
