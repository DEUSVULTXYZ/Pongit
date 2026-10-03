import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeFunctionData,keccak256,type Address,type Hex} from 'viem';
import {publicIndependentManifest,type ChainOperation} from '../shared/independent';
import {abi as familyAbi} from '../shared/abi-independent-ArcadeFamily';
import {independentRules} from '../shared/independent-rules';
import {independentPlayerCall,independentPlayerRouter} from '../relayer/src/independent-player-sponsor';

const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const m=publicIndependentManifest({chainId:10143,hub:addr(1),family:addr(2),lobby:addr(3),ratings:addr(4),settlement:addr(5),vault:addr(6),market:addr(7),profiles:addr(8),privateData:addr(9),pressureSigner:addr(10),arenas:[11,12,13].map(i=>({app:addr(i)})),genesis:1700000000,createdAt:'2026-09-12T12:00:00Z'});
const lobby=independentRules(m).lobby,sig=`0x${'ab'.repeat(65)}` as Hex;
const relay=(data:Hex)=>encodeFunctionData({abi:lobby,functionName:'relay',args:[addr(20),data,0n,2000000000n,sig]});
const accept=relay(encodeFunctionData({abi:lobby,functionName:'acceptProposal',args:[1n]}));
const register=encodeFunctionData({abi:familyAbi,functionName:'register',args:[{player:addr(20),key:addr(21),issuedAt:1700000000n,expires:1700007200n,revision:0n},sig]});
const id=(to:Address,data:Hex)=>keccak256(encodeAbiParameters([{type:'address'},{type:'bytes'},{type:'uint256'},{type:'string'}],[to,data,0n,'']));
function queue(){
 const records=new Map<string,ChainOperation>(),calls:Array<{to:Address;data:Hex}>=[];
 return {records,calls,get:async(key:string)=>records.get(key)??null,status:()=>({available:true,error:undefined,code:undefined}),
  enqueue:async(to:Address,data:Hex)=>{calls.push({to,data});const op:ChainOperation={id:id(to,data),status:'queued'};records.set(op.id,op);return op;}};
}
test('only canonical signed player intents are accepted by the independent gas role',()=>{
 independentPlayerCall(m,m.lobby,accept);independentPlayerCall(m,m.family,register);
 for(const [to,data,value] of [[m.lobby,accept,1n],[m.vault,accept,0n],[m.market,accept,0n],[m.lobby,accept+'00',0n],[m.family,register+'00',0n],
  [m.lobby,encodeFunctionData({abi:lobby,functionName:'matchmake',args:[0,1n]}),0n],
  [m.lobby,relay(encodeFunctionData({abi:lobby,functionName:'matchmake',args:[0,1n]})),0n],
  [m.lobby,relay((encodeFunctionData({abi:lobby,functionName:'acceptProposal',args:[1n]})+'00') as Hex),0n]] as const)
  assert.throws(()=>independentPlayerCall(m,to,data as Hex,value));
});
test('player intents are independent of the operator queue while finance retains its owner',async()=>{
 const legacy=queue(),player=queue(),router=independentPlayerRouter(m,legacy,player);
 await Promise.all([router.enqueue(m.family,register),router.enqueue(m.lobby,accept)]);
 assert.equal(player.calls.length,2);assert.equal(legacy.calls.length,0);
 await router.enqueue(m.vault,'0x12345678');assert.equal(legacy.calls.length,1);
 assert.equal((await router.get(id(m.lobby,accept)))?.status,'queued');
});
test('historical queued, uncertain, confirmed and failed intents retain their original signer',async()=>{
 for(const status of ['queued','pending','confirmed','failed'] as const){
  const legacy=queue(),player=queue(),router=independentPlayerRouter(m,legacy,player);
  const old:ChainOperation={id:id(m.lobby,accept),status,...(status==='pending'||status==='confirmed'?{hash:`0x${'cd'.repeat(32)}` as Hex}:{})};
  legacy.records.set(old.id,old);
  assert.deepEqual(await router.enqueue(m.lobby,accept),old);assert.deepEqual(await router.get(old.id),old);
  assert.equal(player.calls.length,0);assert.equal(legacy.calls.length,0);
 }
});
test('a legacy database outage cannot silently migrate an uncertain operation',async()=>{
 const legacy=queue(),player=queue();legacy.get=async()=>{throw Error('database unavailable');};
 const router=independentPlayerRouter(m,legacy,player);
 await assert.rejects(router.enqueue(m.lobby,accept),/database unavailable/);assert.equal(player.calls.length,0);
});
test('legacy configuration and historical maintenance routes keep their old writer',async()=>{
 const legacy=queue(),router=independentPlayerRouter(m,legacy);
 await router.enqueue(m.lobby,accept);assert.equal(legacy.calls.length,1);
 const player=queue(),split=independentPlayerRouter(m,legacy,player);
 await split.enqueue(m.lobby,encodeFunctionData({abi:lobby,functionName:'matchmake',args:[0,1n]}));
 assert.equal(legacy.calls.length,2);assert.equal(player.calls.length,0);
});
