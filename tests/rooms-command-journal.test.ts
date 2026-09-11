import test from 'node:test';import assert from 'node:assert/strict';
import {encodeFunctionData,parseAbi,keccak256,toFunctionSelector} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {delegatableAbi} from '@interludelayer-sdk/sdk';
import {RoomsCommandJournal} from '../web/lib/rooms-command-journal';
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
