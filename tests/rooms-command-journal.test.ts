import test from 'node:test';import assert from 'node:assert/strict';
import {encodeFunctionData,parseAbi,keccak256,toFunctionSelector} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {delegatableAbi} from '@interludelayer-sdk/sdk';
import {RoomsCommandJournal,resendJournaled} from '../web/lib/rooms-command-journal';
import {isEngineGasCapped,isEngineHalted} from '../shared/engine-halt';
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
// Ported from codex/contract-authority e892c30.
test('a command lost with its epoch can be sent again in the next, and only there',async()=>{
 const {journal,store,raw,player}=await fixture();await journal.beforeSend(raw);
 journal.received('eth_getTransactionReceipt',{transactionHash:keccak256(raw),status:'0x1'});assert.equal(journal.pending(player),undefined);
 // Same epoch: executed means resolved, and the bytes are never sent twice.
 await assert.rejects(journal.beforeSend(raw),/already resolved/);
 // The epoch closed before committing it; the engine gives the same nonce back and the client
 // signs the same bytes. They are journaled again, as this epoch's, and resolve by their receipt.
 const next=new RoomsCommandJournal(store,app,abi);next.received('interlude_session',{app,chainId:4242,epoch:2});
 await next.beforeSend(raw);
 assert.equal(next.pending(player)?.epoch,'2');
 next.received('eth_getTransactionReceipt',{transactionHash:keccak256(raw),status:'0x1'});
 assert.equal(next.pending(player),undefined);
 await assert.rejects(next.beforeSend(raw),/already resolved/);
 assert.equal(JSON.parse(store.getItem()!).filter((x:any)=>x.hash===keccak256(raw)).length,1);
});
test('the 2026-09-18 recovery: a registerControls lost with epoch 6 is signed byte-identical in epoch 7 and sent',async()=>{
 // A delegated call stands in for registerControls here: what matters is that
 // the key, the nonce the node hands back and the calldata are all the same.
 const {journal,store,raw,player}=await fixture();journal.received('interlude_session',{app,chainId:4242,epoch:6});
 await journal.beforeSend(raw);journal.received('interlude_sendTransaction',{transactionHash:keccak256(raw),status:'0x1'});
 // forceClose loses the batch; the renewed node's count for this key is 5 again.
 const renewed=new RoomsCommandJournal(store,app,abi);renewed.received('interlude_session',{app,chainId:4242,epoch:7});
 renewed.retirePrevious(player,7n);
 await renewed.beforeSend(raw);
 assert.equal(renewed.pending(player)?.hash,keccak256(raw),'journaled as epoch 7\'s, never blocked as resolved');
 assert.equal(renewed.pending(player)?.epoch,'7');
});

// Retired before execution: the agent arcade's rule on the browser side, for
// the gas cap and a halted node only.
const capRefusal={name:'RpcRequestError',message:'RPC Request failed.',details:'transaction rejected before execution: transaction gas limit is greater than the cap',code:-32000};
const haltRefusal=new EnginePublicationUnavailable({name:'RpcRequestError',message:'RPC Request failed.',details:'this session is over and the node is no longer accepting transactions: batch 191 could not be settled',code:-32000});
test('a refused command is retired only when the node confirms its nonce unused; the same control is then sent again at that nonce',async()=>{
 const {journal,raw,key,player,data}=await fixture();await journal.beforeSend(raw);
 const pending=journal.pending(player)!;
 assert.equal(journal.retireRefused(pending.hash,6,'refused'),false,'the count moved: it may have run');
 assert.equal(journal.retireRefused(pending.hash,4,'refused'),false);
 assert.equal(journal.pending(player)?.hash,pending.hash);
 assert.equal(journal.retireRefused(pending.hash,5,'transaction gas limit is greater than the cap'),true);
 assert.equal(journal.pending(player),undefined);
 assert.equal(journal.retireRefused(pending.hash,5,'again'),false,'only an uncertain entry');
 // viem signs deterministically: the same control, key, nonce and gas are these
 // very bytes. The earlier version of this test signed them with another gas
 // limit, which hid that such bytes were refused as "already resolved" forever.
 const same=await key.signTransaction({type:'eip1559',chainId:4242,to:app,nonce:5,data,gas:1000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
 assert.equal(same,raw);
 await journal.beforeSend(same);
 assert.equal(journal.pending(player)?.hash,keccak256(raw),'the refused bytes never ran: they may be sent again');
 journal.received('interlude_sendTransaction',{transactionHash:keccak256(raw),status:'0x1'});
 assert.equal(journal.pending(player),undefined,'and their receipt resolves the new entry');
 await assert.rejects(journal.beforeSend(raw),/already resolved/,'once executed, never again');
});
test('a refused command at a lower gas limit takes the freed nonce too',async()=>{
 const {journal,raw,key,player,data}=await fixture();await journal.beforeSend(raw);
 assert.equal(journal.retireRefused(keccak256(raw),5,'transaction gas limit is greater than the cap'),true);
 const lower=await key.signTransaction({type:'eip1559',chainId:4242,to:app,nonce:5,data,gas:500000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
 await journal.beforeSend(lower);assert.equal(journal.pending(player)?.hash,keccak256(lower));
});
test('recovery resend: a gas-cap or halt refusal with the nonce confirmed unused retires and stops the tab',async()=>{
 {
  const {journal,raw,player}=await fixture();await journal.beforeSend(raw);const sent:string[]=[];
  await assert.rejects(resendJournaled(journal,journal.pending(player)!,{send:async x=>{sent.push(x);throw capRefusal;},latestNonce:async()=>5}),isEngineGasCapped);
  assert.deepEqual(sent,[raw],'only the journaled bytes are sent');
  assert.equal(journal.pending(player),undefined,'no longer blocks the player; the tab waits for a limit the node accepts');
 }
 {
  const {journal,raw,player}=await fixture();await journal.beforeSend(raw);
  await assert.rejects(resendJournaled(journal,journal.pending(player)!,{send:async()=>{throw haltRefusal;},latestNonce:async()=>5}),isEngineHalted);
  assert.equal(journal.pending(player),undefined,'retired, and the tab shows the halt instead of signing again');
 }
 {
  // The bytes were signed at 1,000,000 before the relayer's config served a
  // lower limit: the next control is signed at that limit at once.
  const {journal,raw,player}=await fixture();await journal.beforeSend(raw);
  assert.deepEqual(await resendJournaled(journal,journal.pending(player)!,{send:async()=>{throw capRefusal;},latestNonce:async()=>5,commandGas:()=>500_000n}),{kind:'refused'});
  assert.equal(journal.pending(player),undefined);
  // At the same limit the tab waits instead of signing what the node refuses.
  const again=await fixture();await again.journal.beforeSend(again.raw);
  await assert.rejects(resendJournaled(again.journal,again.journal.pending(again.player)!,{send:async()=>{throw capRefusal;},latestNonce:async()=>5,commandGas:()=>1_000_000n}),isEngineGasCapped);
 }
});
test('recovery resend: a generic refusal, a lost response, a moved or unreadable nonce, or a local gate keep the command uncertain',async()=>{
 const cases:[string,unknown,()=>Promise<number>][]=[
  ['generic "rejected before execution": the original may still be in flight',{name:'RpcRequestError',message:'RPC Request failed.',details:'transaction rejected before execution',code:-32000},async()=>5],
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
