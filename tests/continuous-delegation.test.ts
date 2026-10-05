import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAbi,encodeFunctionData,zeroHash,type Address} from 'viem';
import {continuousSubmissionGuard} from '../shared/continuous-delegation';
import {NO_LEASE_HUB} from '../shared/hub-lease';
const app='0x1111111111111111111111111111111111111111' as Address;
const abi=parseAbi(['function closeReusableArena(address)','function closeEngine()','function recoverExpired(address)',
 'function forceClose(address,bytes32)','function releaseStake(address,bytes32)','function openReusableArena(address)']);
test('v3 signing guard rejects direct and indirect closes, preserving openings and release',async()=>{
 let reads=0;const guard=continuousSubmissionGuard({readContract:async()=>{reads++;return NO_LEASE_HUB;}} as any);
 for(const name of ['closeEngine','closeReusableArena','recoverExpired'] as const)
  await assert.rejects(guard(app,encodeFunctionData({abi,functionName:name,args:name==='closeEngine'?[]:[app]} as any)),{code:'CONTINUOUS_DELEGATION'});
 await assert.rejects(guard(NO_LEASE_HUB,encodeFunctionData({abi,functionName:'forceClose',args:[app,zeroHash]})),{code:'CONTINUOUS_DELEGATION'});
 await guard(NO_LEASE_HUB,encodeFunctionData({abi,functionName:'releaseStake',args:[app,zeroHash]}));
 await guard(app,encodeFunctionData({abi,functionName:'openReusableArena',args:[app]}));
 assert.equal(reads,1,'only immutable hub lookup is cached; unrelated calls require no policy RPC');
});
test('unknown hub or failed policy lookup cannot authorize a closing helper',async()=>{
 const guard=continuousSubmissionGuard({readContract:async()=>{throw Error('unavailable');}} as any);
 await assert.rejects(guard(app,encodeFunctionData({abi,functionName:'closeEngine'})),/unavailable/);
});
