import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256,type PublicClient} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {rebroadcastFundedOperation} from '../shared/operator-rebroadcast';

async function fixture(){
 const owner=privateKeyToAccount(generatePrivateKey());
 const raw=await owner.signTransaction({chainId:10143,type:'eip1559',nonce:7,gas:21000n,maxFeePerGas:10n,maxPriorityFeePerGas:1n,
  to:'0x1111111111111111111111111111111111111111',value:5n});
 const job={raw,hash:keccak256(raw)},sent:string[]=[];
 const node=(overrides:Record<string,unknown>={})=>({getChainId:async()=>10143,getBalance:async()=>210005n,
  getTransactionCount:async()=>7,sendRawTransaction:async({serializedTransaction}:any)=>{sent.push(serializedTransaction);return job.hash;},...overrides}) as unknown as PublicClient;
 return{owner:owner.address,job,sent,node};
}
test('funded recovery submits the original bytes and hash exactly once to the recovery node',async()=>{
 const f=await fixture();
 const primary=f.node({sendRawTransaction:async()=>{throw Error('must not retry rejecting endpoint here');}});
 assert(await rebroadcastFundedOperation(primary,f.node(),f.job,f.owner));assert.deepEqual(f.sent,[f.job.raw]);
});
test('no recovery broadcast when either view remains underfunded or the nonce is used or pending',async()=>{
 for(const side of [0,1])for(const replacement of [{getBalance:async()=>210004n},{getTransactionCount:async()=>8},
  {getTransactionCount:async({blockTag}:any)=>blockTag==='pending'?8:7}]){
  const f=await fixture(),nodes=[f.node(),f.node()];nodes[side]=f.node(replacement);
  assert.equal(await rebroadcastFundedOperation(nodes[0],nodes[1],f.job,f.owner),false);assert.deepEqual(f.sent,[]);
 }
});
test('wrong network, altered bytes and wrong signer never produce a recovery send',async()=>{
 const f=await fixture();
 await assert.rejects(rebroadcastFundedOperation(f.node(),f.node({getChainId:async()=>1}),f.job,f.owner),/network/);
 await assert.rejects(rebroadcastFundedOperation(f.node(),f.node(),{...f.job,hash:('0x'+'00'.repeat(32)) as any},f.owner),/hash/);
 await assert.rejects(rebroadcastFundedOperation(f.node(),f.node(),f.job,'0x1111111111111111111111111111111111111111'),/identity/);
 assert.deepEqual(f.sent,[]);
});
test('a response lost after recovery execution propagates without signing or resending a replacement',async()=>{
 const f=await fixture();
 await assert.rejects(rebroadcastFundedOperation(f.node(),f.node({sendRawTransaction:async({serializedTransaction}:any)=>{
  f.sent.push(serializedTransaction);throw Error('response lost');
 }}),f.job,f.owner),/response lost/);assert.deepEqual(f.sent,[f.job.raw]);
});
