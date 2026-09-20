import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSponsoredTransaction} from '../relayer/src/sponsor-prepare';
const owner='0x0000000000000000000000000000000000000001',tx={to:owner,data:'0x1234',value:0n} as const;
const base=()=>({getTransactionCount:async()=>17,getBlock:async()=>({gasLimit:30_000_000n}),estimateGas:async()=>100_000n,estimateFeesPerGas:async()=>({maxFeePerGas:20n,maxPriorityFeePerGas:2n})});
test('all five preparations run concurrently and bind the explicit operator nonce and chain',async()=>{
 let started=0,release!:()=>void;const gate=new Promise<void>(r=>release=r),b=base();
 const client=Object.fromEntries(Object.entries(b).map(([name,fn])=>[name,async()=>{started++;if(started===5)release();await gate;return fn();}]));
 const result=await prepareSponsoredTransaction(client as any,owner,tx);
 assert.deepEqual(result,{...tx,chainId:10143,nonce:17,gas:120_000n,type:'eip1559',maxFeePerGas:20n,maxPriorityFeePerGas:2n});
});
test('unknown operator nonce, excess gas and incomplete fees prevent transaction preparation',async()=>{
 await assert.rejects(prepareSponsoredTransaction({...base(),getTransactionCount:async({blockTag}:any)=>blockTag==='pending'?18:17} as any,owner,tx),/reconciliation/);
 for(const limit of [30_000_000n,10_000n]){
  const b={...base(),getBlock:async()=>({gasLimit:limit}),estimateGas:async()=>26_000_000n};
  await assert.rejects(prepareSponsoredTransaction(b as any,owner,tx),/gas estimate exceeds/);
 }
 await assert.rejects(prepareSponsoredTransaction({...base(),estimateFeesPerGas:async()=>({gasPrice:1n})} as any,owner,tx),/fee estimate unavailable/);
});
test('simulation reverts and transport errors remain distinguishable to the journal dispatcher',async()=>{
 for(const error of [{name:'ExecutionRevertedError'},Error('RPC offline')]){
  await assert.rejects(prepareSponsoredTransaction({...base(),estimateGas:async()=>{throw error;}} as any,owner,tx),e=>e===error);
 }
});
