import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256,zeroHash,type Address,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {settleCreatorTransaction} from '../shared/creator-transaction';
const to='0x0000000000000000000000000000000000000022' as Address,data='0x12345678' as Hex;
async function fixture(){
 const owner=privateKeyToAccount(generatePrivateKey());
 const tx={chainId:10143,nonce:3,to,data,value:0n,gas:60000n,maxFeePerGas:10n,maxPriorityFeePerGas:1n} as const;
 const raw=await owner.signTransaction(tx),saved={raw,hash:keccak256(raw),nonce:3,value:true},expected={owner:owner.address,to,data};
 const receipt={status:'success' as const,transactionHash:saved.hash};let sends=0;
 const transport={receipt:async()=>null as typeof receipt|null,nonce:async()=>3,
  send:async(bytes:Hex)=>{assert.equal(bytes,raw);sends++;return saved.hash;},wait:async()=>receipt};
 return{owner,tx,saved,expected,receipt,transport,sends:()=>sends};
}
test('lost availability response resumes the exact signed transaction; a known receipt sends nothing',async()=>{
 const f=await fixture();f.transport.send=async()=>{throw Error('reply lost');};
 await assert.rejects(settleCreatorTransaction(f.saved,f.expected,f.transport),/uncertain/);
 f.transport.receipt=async()=>f.receipt;
 assert.deepEqual(await settleCreatorTransaction(f.saved,f.expected,f.transport),f.receipt);assert.equal(f.sends(),0);
 const g=await fixture();assert.deepEqual(await settleCreatorTransaction(g.saved,g.expected,g.transport),g.receipt);assert.equal(g.sends(),1);
});
test('consumed nonce without the exact receipt and an RPC outage never trigger a new send',async()=>{
 const f=await fixture();f.transport.nonce=async()=>4;
 await assert.rejects(settleCreatorTransaction(f.saved,f.expected,f.transport),/nonce was consumed/);assert.equal(f.sends(),0);
 f.transport.receipt=async()=>{throw Error('503');};await assert.rejects(settleCreatorTransaction(f.saved,f.expected,f.transport),/503/);assert.equal(f.sends(),0);
});
test('journal replay is bound to creator, chain, zero value, target, calldata, nonce and exact receipt',async()=>{
 const f=await fixture();
 for(const change of [{chainId:1},{value:1n},{nonce:4},{to:'0x0000000000000000000000000000000000000033' as Address},{data:'0xffffffff' as Hex}]){
  const raw=await f.owner.signTransaction({...f.tx,...change});
  await assert.rejects(settleCreatorTransaction({...f.saved,raw,hash:keccak256(raw)},f.expected,f.transport),/differs/);
 }
 await assert.rejects(settleCreatorTransaction(f.saved,{...f.expected,owner:to},f.transport),/differs/);
 f.transport.receipt=async()=>({...f.receipt,transactionHash:zeroHash});
 await assert.rejects(settleCreatorTransaction(f.saved,f.expected,f.transport),/receipt differs/);assert.equal(f.sends(),0);
});
