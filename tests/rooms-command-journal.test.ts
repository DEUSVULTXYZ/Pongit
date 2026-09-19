import test from 'node:test';import assert from 'node:assert/strict';
import {encodeFunctionData,parseAbi,keccak256,toFunctionSelector} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {delegatableAbi} from '@interludelayer-sdk/sdk';
import {RoomsCommandJournal,resendJournaled} from '../web/lib/rooms-command-journal';
import {isEngineHalted} from '../shared/engine-halt';
import {EnginePublicationUnavailable} from '../shared/service-error';
const app='0x0000000000000000000000000000000000000011';
const abi=parseAbi(['function input(uint256,int8,uint256,uint256)','function withdraw(uint256)']);
async function fixture(){
 const key=privateKeyToAccount(generatePrivateKey()),player=privateKeyToAccount(generatePrivateKey()).address;
 const grant={granter:player,sessionKey:key.address,expiry:BigInt(Math.floor(Date.now()/1000)+7200),epoch:0n,anyFunction:false,selectors:[toFunctionSelector('input(uint256,int8,uint256,uint256)')]};
 const data=encodeFunctionData({abi:delegatableAbi,functionName:'withSession',args:[grant,'0x00',encodeFunctionData({abi,functionName:'input',args:[8n,1,1n,200n]})]});
 const raw=await key.signTransaction({type:'eip1559',chainId:4242,to:app,nonce:5,data,gas:1000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
 let stored:string|null=null;const store={getItem:()=>stored,setItem:(_:string,v:string)=>{stored=v;}};
 const journal=new RoomsCommandJournal(store,app,abi);journal.received('interlude_session',{app,chainId:4242,epoch:1});
 return {journal,store,raw,key,player,data};
}
test('persist before wire, survive reload and allow only the identical uncertain bytes',async()=>{
 const {journal,store,raw,key,player,data}=await fixture();await journal.beforeSend(raw);
 assert.equal(journal.pending(player)?.hash,keccak256(raw));
 const restored=new RoomsCommandJournal(store,app,abi);restored.received('interlude_session',{app,chainId:4242,epoch:1});
 await restored.beforeSend(raw);
 const other=await key.signTransaction({type:'eip1559',chainId:4242,to:app,nonce:6,data,gas:1000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
 await assert.rejects(restored.beforeSend(other),/uncertain/);
 assert.equal(restored.pending(player)?.nonce,5);
});
test('only a matching receipt resolves execution; a newer verified hub epoch retires old bytes',async()=>{
 const {journal,raw,player}=await fixture();await journal.beforeSend(raw);
 journal.received('eth_getTransactionReceipt',null);assert(journal.pending(player));
 journal.received('eth_getTransactionReceipt',{transactionHash:keccak256(raw),status:'0x0'});assert.equal(journal.pending(player),undefined);
 await assert.rejects(journal.beforeSend(raw),/already resolved/);
 const fresh=await fixture();await fresh.journal.beforeSend(fresh.raw);
 fresh.journal.retirePrevious(fresh.player,1n);assert(fresh.journal.pending(fresh.player));
 fresh.journal.retirePrevious(fresh.player,2n);assert.equal(fresh.journal.pending(fresh.player),undefined);
});
test('journal refuses financial calls and wrong deployment or chain',async()=>{
 const {journal,key,player}=await fixture();
 for(const target of ['chain','app','funds','method']){
 const grant={granter:player,sessionKey:key.address,expiry:9000000000n,epoch:0n,anyFunction:false,selectors:[toFunctionSelector('input(uint256,int8,uint256,uint256)')]};
 const inner=target==='method'?encodeFunctionData({abi,functionName:'withdraw',args:[1n]}):encodeFunctionData({abi,functionName:'input',args:[8n,1,1n,200n]});
 const raw=await key.signTransaction({type:'eip1559',chainId:target==='chain'?10143:4242,to:target==='app'?key.address:app,nonce:5,value:target==='funds'?1n:0n,data:encodeFunctionData({abi:delegatableAbi,functionName:'withSession',args:[grant,'0x00',inner]}),gas:1000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
 await assert.rejects(journal.beforeSend(raw));assert.equal(journal.pending(player),undefined);
 }
});

// Refused before execution: the agent arcade's rule on the browser side.
const capRefusal={name:'RpcRequestError',message:'RPC Request failed.',details:'transaction rejected before execution: transaction gas limit is greater than the cap',code:-32000};
const haltRefusal=new EnginePublicationUnavailable({name:'RpcRequestError',message:'RPC Request failed.',details:'this session is over and the node is no longer accepting transactions: batch 191 could not be settled',code:-32000});
test('a refused command is retired only when the node confirms its nonce unused; the next command may then take that nonce',async()=>{
 const {journal,raw,key,player,data}=await fixture();await journal.beforeSend(raw);
 const pending=journal.pending(player)!;
 assert.equal(journal.retireRefused(pending.hash,6,'refused'),false,'the count moved: it may have run');
 assert.equal(journal.retireRefused(pending.hash,4,'refused'),false);
 assert.equal(journal.pending(player)?.hash,pending.hash);
 assert.equal(journal.retireRefused(pending.hash,5,'transaction gas limit is greater than the cap'),true);
 assert.equal(journal.pending(player),undefined);
 await assert.rejects(journal.beforeSend(raw),/already resolved/,'the refused bytes are never sent again');
 assert.equal(journal.retireRefused(pending.hash,5,'again'),false,'only an uncertain entry');
 const next=await key.signTransaction({type:'eip1559',chainId:4242,to:app,nonce:5,data,gas:2000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
 await journal.beforeSend(next);assert.equal(journal.pending(player)?.nonce,5,'new bytes at the freed nonce');
});
test('recovery resend: a refusal with the nonce confirmed unused retires, and a halted node surfaces as EngineHalted',async()=>{
 {
  const {journal,raw,player}=await fixture();await journal.beforeSend(raw);const sent:string[]=[];
  const r=await resendJournaled(journal,journal.pending(player)!,{send:async x=>{sent.push(x);throw capRefusal;},latestNonce:async()=>5});
  assert.deepEqual(r,{kind:'refused'});assert.deepEqual(sent,[raw],'only the journaled bytes are sent');
  assert.equal(journal.pending(player),undefined,'no longer blocks the player');
 }
 {
  const {journal,raw,player}=await fixture();await journal.beforeSend(raw);
  await assert.rejects(resendJournaled(journal,journal.pending(player)!,{send:async()=>{throw haltRefusal;},latestNonce:async()=>5}),isEngineHalted);
  assert.equal(journal.pending(player),undefined,'retired, and the tab shows the halt instead of signing again');
 }
});
test('recovery resend: a lost response, a moved or unreadable nonce, or a local gate keep the command uncertain',async()=>{
 const cases:[string,unknown,()=>Promise<number>][]=[
  ['lost response',new TypeError('fetch failed'),async()=>5],
  ['timeout',{name:'TimeoutError',message:'The operation was aborted due to timeout'},async()=>5],
  ['count moved',capRefusal,async()=>6],
  ['count unreadable',haltRefusal,async()=>{throw new TypeError('fetch failed');}],
  ['local publication gate: never sent',new EnginePublicationUnavailable(),async()=>5],
 ];
 for(const [name,error,latestNonce] of cases){
  const {journal,raw,player}=await fixture();await journal.beforeSend(raw);
  await assert.rejects(resendJournaled(journal,journal.pending(player)!,{send:async()=>{throw error;},latestNonce}),(e:unknown)=>e===error,name);
  assert.equal(journal.pending(player)?.hash,keccak256(raw),name);
 }
 const {journal,raw,player}=await fixture();await journal.beforeSend(raw);
 const receipt={transactionHash:keccak256(raw),status:'0x1'};
 assert.deepEqual(await resendJournaled(journal,journal.pending(player)!,{send:async()=>receipt,latestNonce:async()=>{throw new Error('not read');}}),{kind:'sent',receipt});
});
