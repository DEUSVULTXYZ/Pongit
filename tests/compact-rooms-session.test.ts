import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionData,keccak256,parseTransaction,toFunctionSelector,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {delegatableAbi,type StoredSession} from '@interludelayer-sdk/sdk';
import {compactRoomsSession} from '../shared/compact-rooms-session';
import {ENGINE_COMMAND_GAS,setEngineCommandGas} from '../shared/engine-gas';
import {roomsCompactAbi as abi} from '../shared/abi-PongRoomsCompact';
import {RoomsCommandJournal} from '../web/lib/rooms-command-journal';
const app='0x0000000000000000000000000000000000000011',epoch=2n;
const scope=['acceptMatch((uint256,bytes32,address,address,uint8,bool,uint64,uint256,bytes32),bytes)','input(uint256,int8,uint256,uint256)','tick(uint256)','cancelMatch(uint256)','concede(uint256)'].map(toFunctionSelector);
async function fixture(){
 const key=generatePrivateKey(),signer=privateKeyToAccount(key),owner=privateKeyToAccount(generatePrivateKey());
 const stored:StoredSession={app,baseChainId:10143,privateKey:key,signature:`0x${'11'.repeat(65)}`,grant:{granter:owner.address,sessionKey:signer.address,expiry:BigInt(Math.floor(Date.now()/1000)+3600),epoch:0n,anyFunction:false,selectors:scope}};
 let state:string|null=null,binding=0n,nonceReads=0,fail=false,revert=false,bindingReads=0;
 const store={getItem:()=>state,setItem:(_:string,v:string)=>state=v},sent:Hex[]=[];
 const makeJournal=()=>{const j=new RoomsCommandJournal(store,app,abi);j.received('interlude_session',{app,chainId:4242,epoch:Number(epoch)});j.bindRoomControls(owner.address,signer.address,epoch,stored.grant.expiry);return j;};
 let journal=makeJournal();
 const node:any={getTransactionCount:async()=>{nonceReads++;return sent.length+5;},readContract:async()=>{bindingReads++;return binding;},request:async({params}:any)=>{
  const raw=params[0];await journal.beforeSend(raw);sent.push(raw);
  if(fail)throw Error('lost response');
  const inner=decodeFunctionData({abi,data:parseTransaction(raw).data!});
  if(!revert&&inner.functionName==='registerControls')binding=BigInt(owner.address)|(stored.grant.expiry<<160n)|(epoch<<224n);
  if(!revert&&inner.functionName==='revokeControls')binding=BigInt(owner.address);
  const receipt={transactionHash:keccak256(raw),status:revert?'0x0':'0x1',output:toFunctionSelector('StaleInput()')};journal.received('interlude_sendTransaction',receipt);return receipt;
 }};
 const make=()=>compactRoomsSession({node,abi,app,stored,epoch});
 return {stored,owner,signer,node,sent,make,makeJournal,journal,counts:()=>({nonceReads,bindingReads}),binding:()=>binding,fail:()=>fail=true,revert:()=>revert=true,restore:()=>journal=makeJournal()};
}
test('one grant registration, then compact controls with a single sequential nonce owner',async()=>{
 const f=await fixture(),s=f.make();for(let i=0;i<100;i++)await s.send('input',[8n,i%2?1:-1,BigInt(i+1),200n]);
 assert.equal(f.sent.length,101);assert.deepEqual(f.counts(),{nonceReads:1,bindingReads:1});
 assert.equal(decodeFunctionData({abi,data:parseTransaction(f.sent[0]).data!}).functionName,'registerControls');
 for(const [i,raw]of f.sent.entries())assert.equal(parseTransaction(raw).nonce,5+i);
 assert.equal(f.journal.pending(f.owner.address),undefined);
 const input=parseTransaction(f.sent[1]);const wrapped=await f.signer.signTransaction({type:'eip1559',chainId:4242,to:app,nonce:6,gas:30000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n,data:encodeFunctionData({abi:delegatableAbi,functionName:'withSession',args:[f.stored.grant,f.stored.signature,input.data!]})});
 const directBytes=(f.sent[1].length-2)/2,wrappedBytes=(wrapped.length-2)/2;assert(directBytes<wrappedBytes*.3);
 console.log(JSON.stringify({fixture:'rules5 signed movement',directBytes,wrappedBytes,reductionPercent:Math.round(100*(1-directBytes/wrappedBytes))}));
});
test('every compact control is signed with the 30,000,000 gas ceiling at no fee',async()=>{
 const f=await fixture(),s=f.make();
 await s.send('tick',[8n]);await s.send('input',[8n,1,1n,200n]);await s.send('concede',[8n]);await s.send('cancelMatch',[8n]);await s.revoke();
 assert.deepEqual(f.sent.map(raw=>decodeFunctionData({abi,data:parseTransaction(raw).data!}).functionName),['registerControls','tick','input','concede','cancelMatch','revokeControls']);
 for(const raw of f.sent){const tx=parseTransaction(raw);assert.equal(tx.gas,30_000_000n);assert.equal(tx.maxFeePerGas??0n,0n);assert.equal(tx.maxPriorityFeePerGas??0n,0n);assert.equal(tx.chainId,4242);}
});
test('F5 reuses the binding; an uncertain registration cannot be replaced or followed by input',async()=>{
 const f=await fixture();await f.make().send('tick',[8n]);f.restore();await f.make().send('concede',[8n]);
 assert.equal(f.sent.length,3);assert.equal(decodeFunctionData({abi,data:parseTransaction(f.sent[2]).data!}).functionName,'concede');
 const lost=await fixture();lost.fail();const s=lost.make();await assert.rejects(s.send('tick',[8n]),/lost/);await assert.rejects(s.send('input',[8n,1,1n,200n]),/Reconcile/);
 assert.equal(lost.sent.length,1);assert.equal(lost.journal.pending(lost.owner.address)?.action,'registerControls');
 const restored=lost.restore();await restored.beforeSend(lost.sent[0]);restored.received('eth_getTransactionReceipt',{transactionHash:keccak256(lost.sent[0]),status:'0x1'});assert.equal(restored.pending(lost.owner.address),undefined);
});
test('confirmed reverts consume nonces; financial actions and expired grants never send',async()=>{
 const f=await fixture(),s=f.make();await s.send('tick',[8n]);f.revert();await assert.rejects(s.send('input',[8n,1,1n,200n]),(e:any)=>e.name==='AppRevertError');await assert.rejects(s.send('concede',[8n]));
 assert.equal(parseTransaction(f.sent[3]).nonce,8);const before=f.sent.length;
 await assert.rejects(s.send('withdraw',[8n]),/only permits/);f.stored.grant.expiry=1n;await assert.rejects(s.send('tick',[8n]),/expired/);assert.equal(f.sent.length,before);
});
test('disconnect revokes only its existing binding, and never registers an unused key',async()=>{
 const f=await fixture();await f.make().revoke();assert.equal(f.sent.length,0);
 const s=f.make();await s.send('tick',[8n]);await s.revoke();assert.equal(f.binding(),BigInt(f.owner.address));assert.equal(f.sent.length,3);
 const other=await f.signer.signTransaction({type:'eip1559',chainId:4242,to:app,nonce:8,gas:30000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n,data:encodeFunctionData({abi,functionName:'revokeControls',args:[f.owner.address]})});
 await assert.rejects(f.journal.beforeSend(other),/Only this arcade key/);
});
test('an open tab signs its next control with the limit the relayer serves, without a reload',async()=>{
 const f=await fixture(),s=f.make();
 await s.send('tick',[8n]);
 try{
  // /interlude/config now serves ROOMS_ENGINE_COMMAND_GAS=15000000.
  assert.equal(setEngineCommandGas('15000000'),true);
  await s.send('input',[8n,1,1n,200n]);
 }finally{setEngineCommandGas(ENGINE_COMMAND_GAS);}
 assert.deepEqual(f.sent.map(raw=>parseTransaction(raw).gas),[30_000_000n,30_000_000n,15_000_000n]);
 const fixed=await fixture();await compactRoomsSession({node:fixed.node,abi,app,stored:fixed.stored,epoch,gas:()=>12_000_000n}).send('tick',[8n]);
 assert.deepEqual(fixed.sent.map(raw=>parseTransaction(raw).gas),[12_000_000n,12_000_000n],'an explicit limit wins');
});
