import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionResult,multicall3Abi,zeroAddress,zeroHash,type PublicClient} from 'viem';
import {agentAssignments} from '../shared/agent-assignments';
import {reusableAgentPoolAbi} from '../shared/abi-ReusableAgentPool';

test('five assignments share two canonical RPCs; a slow refresh never stops valid planning early',async()=>{
 let now=0,batches=0,head=50n,reorg=false,slow=false,finish!:()=>void;
 const base={getBlock:async()=>({number:head,hash:zeroHash}),request:async(p:any)=>{
  batches++;assert.equal(p.method,'eth_call');assert.deepEqual(p.params[1],{blockHash:zeroHash,requireCanonical:true});
  const calls=decodeFunctionData({abi:multicall3Abi,data:p.params[0].data}).args![0] as any[];
  assert.deepEqual(calls.map(c=>decodeFunctionData({abi:reusableAgentPoolAbi,data:c.callData}).args),[[0],[1],[2],[3],[4]]);
  if(slow)await new Promise<void>(resolve=>finish=resolve);
  if(reorg)throw Error('Requested block is no longer canonical');
  const value={ref:{chainId:10143n,arena:zeroAddress,epoch:1n,id:head},a:zeroAddress,b:zeroAddress,tournament:0n,fixture:0,lane:0,ranked:false,captured:false};
  return encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result:calls.map(()=>({success:true,
   returnData:encodeFunctionResult({abi:reusableAgentPoolAbi,functionName:'laneRecord',result:value})}))});
 }} as unknown as PublicClient;
 const view=agentAssignments(base,zeroAddress,5,()=>now);
 await Promise.all(Array.from({length:5},()=>view.read()));assert.equal(batches,1);
 now=499;await view.read();assert.equal(batches,1);
 now=500;head=51n;slow=true;await view.read();await new Promise(r=>setImmediate(r));assert.equal(batches,2);
 // Previously maxAge=1500 blocked every arena behind this still-valid refresh.
 now=1600;assert.equal((await view.read()).lanes[0].ref.id,50n);
 finish();await new Promise(r=>setImmediate(r));assert.equal((await view.read()).lanes[0].ref.id,51n);
 slow=false;reorg=true;now=5500;await assert.rejects(view.read(),/no longer canonical/);
 assert.throws(()=>agentAssignments(base,zeroAddress,99),/Unsupported/);
});
