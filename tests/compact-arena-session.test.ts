import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionData,keccak256,parseAbi,parseTransaction,recoverTransactionAddress,toFunctionSelector,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {delegatableAbi} from '@interludelayer-sdk/sdk';
import {compactArenaSession} from '../shared/compact-arena-session';
import {RoomsCommandJournal} from '../web/lib/rooms-command-journal';
const app='0x0000000000000000000000000000000000000011';
const abi=parseAbi(['function input(uint256,int8,uint256,uint256)','function tick(uint256)','function concede(uint256)','function withdraw(uint256)','error StaleInput()']);
async function fixture(handler?:(raw:Hex)=>any){
 const key=generatePrivateKey(),account=privateKeyToAccount(key),sent:Hex[]=[];
 let stored:string|null=null,reads=0;
 const store={getItem:()=>stored,setItem:(_:string,v:string)=>{stored=v;}};
 const journal=new RoomsCommandJournal(store,app,abi);
 journal.received('interlude_session',{app,chainId:4242,epoch:2});
 journal.bindDirect(account.address,2n,8n,9000000000n);
 const node:any={getTransactionCount:async()=>{reads++;return 5;},request:async({params} :any)=>{
  await journal.beforeSend(params[0]);sent.push(params[0]);
  const result=handler?await handler(params[0]):{transactionHash:keccak256(params[0]),status:'0x1',logs:[]};
  journal.received('interlude_sendTransaction',result);return result;
 }};
 return {key,account,sent,journal,store,reads:()=>reads,node,sender:compactArenaSession({node,abi,app,key,match:8n,expires:9000000000n})};
}
test('compact controls use the bound key, zero value, exact match and sequential nonces',async()=>{
 const f=await fixture();await f.sender.send('input',[8n,1,1n,200n]);await f.sender.send('tick',[8n]);
 assert.equal(f.reads(),1);assert.equal(f.journal.pending(f.account.address),undefined);
 for(const [i,raw] of f.sent.entries()){
  const tx=parseTransaction(raw);assert.equal(tx.chainId,4242);assert.equal(tx.to?.toLowerCase(),app);assert.equal(tx.value??0n,0n);assert.equal(tx.nonce,5+i);
  assert.equal(await recoverTransactionAddress({serializedTransaction:raw as `0x02${string}`}),f.account.address);
  assert.equal(decodeFunctionData({abi,data:tx.data!}).args?.[0],8n);
 }
 await assert.rejects(f.sender.send('withdraw',[8n]),/only permits/);await assert.rejects(f.sender.send('input',[9n,1,1n,200n]),/only permits/);
 assert.equal(f.sent.length,2);
});
test('lost response keeps exact bytes and blocks any replacement until reconciliation',async()=>{
 const f=await fixture(()=>{throw Error('lost response');});
 await assert.rejects(f.sender.send('tick',[8n]),/lost/);
 await assert.rejects(f.sender.send('concede',[8n]),/Reconcile/);
 assert.equal(f.sent.length,1);assert.equal(f.journal.pending(f.account.address)?.raw,f.sent[0]);
 const restored=new RoomsCommandJournal(f.store,app,abi);restored.received('interlude_session',{app,chainId:4242,epoch:2});
 restored.bindDirect(f.account.address,2n,8n,1n);await restored.beforeSend(f.sent[0]);
 restored.received('eth_getTransactionReceipt',{transactionHash:keccak256(f.sent[0]),status:'0x1'});
 assert.equal(restored.pending(f.account.address),undefined);
});
test('mismatched receipt is uncertain; confirmed revert consumes the nonce',async()=>{
 const wrong=await fixture(()=>({transactionHash:'0x00',status:'0x1'}));
 await assert.rejects(wrong.sender.send('tick',[8n]),/not confirmed/);await assert.rejects(wrong.sender.send('tick',[8n]),/Reconcile/);
 const reverted=await fixture(raw=>({transactionHash:keccak256(raw),status:'0x0',output:toFunctionSelector('StaleInput()')}));
 await assert.rejects(reverted.sender.send('tick',[8n]),(e:any)=>e.name==='AppRevertError'&&e.errorName==='StaleInput');
 await assert.rejects(reverted.sender.send('tick',[8n]));assert.equal(parseTransaction(reverted.sent[1]).nonce,6);
});
test('journal requires a verified direct binding and refuses a different key, match, epoch or financial call',async()=>{
 const f=await fixture();
 for(const variant of ['unbound','key','match','epoch','funds','method','chain','app','expired']){
  const journal=new RoomsCommandJournal({getItem:()=>null,setItem:()=>{}},app,abi);
  journal.received('interlude_session',{app,chainId:4242,epoch:2});
  if(variant!=='unbound')journal.bindDirect(f.account.address,2n,8n,variant==='expired'?1n:9000000000n);
  if(variant==='epoch')journal.received('interlude_session',{app,chainId:4242,epoch:3});
  const signer=variant==='key'?privateKeyToAccount(generatePrivateKey()):f.account;
  const raw=await signer.signTransaction({type:'eip1559',chainId:variant==='chain'?10143:4242,to:variant==='app'?f.account.address:app,nonce:5,value:variant==='funds'?1n:0n,data:encodeFunctionData({abi,functionName:variant==='method'?'withdraw':'tick',args:[variant==='match'?9n:8n]}),gas:15000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
  await assert.rejects(journal.beforeSend(raw),variant);
 }
 const expired=compactArenaSession({node:f.node,abi,app,key:f.key,match:8n,expires:1n});
 await assert.rejects(expired.send('tick',[8n]),/expired/);assert.equal(f.sent.length,0);
});
test('serialized direct input removes the repeated SDK grant without changing inner calldata',async()=>{
 const f=await fixture();await f.sender.send('input',[8n,1,1n,200n]);const raw=f.sent[0],tx=parseTransaction(raw);
 const grant={granter:f.account.address,sessionKey:f.account.address,expiry:9000000000n,epoch:2n,anyFunction:false,selectors:['input(uint256,int8,uint256,uint256)','tick(uint256)','concede(uint256)'].map(toFunctionSelector)};
 const wrapped=await f.account.signTransaction({type:'eip1559',chainId:4242,to:app,nonce:5,gas:15000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n,data:encodeFunctionData({abi:delegatableAbi,functionName:'withSession',args:[grant,`0x${'11'.repeat(65)}`,tx.data!]})});
 const directBytes=(raw.length-2)/2,wrappedBytes=(wrapped.length-2)/2;
 assert(directBytes<wrappedBytes/2);assert.equal(decodeFunctionData({abi:delegatableAbi,data:parseTransaction(wrapped).data!}).args[2],tx.data);
 console.log(JSON.stringify({fixture:'serialized signed input, not relay HTTP body',directBytes,wrappedBytes,reductionPercent:Math.round(100*(1-directBytes/wrappedBytes))}));
});
