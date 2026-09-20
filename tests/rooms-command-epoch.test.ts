import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,type Hex} from 'viem';
import {roomsEventsAbi} from '../shared/abi-PongChaosEvents';
import {abi as reusableAbi} from '../shared/abi-independent-ReusableEventsArena';
import {
 StaleEpochCommand,assertCommandEpoch,beaconRequestCurrent,beaconRequestEpoch,commandEpoch,isStaleEpochCommand,livePressureEpochUsable,
} from '../relayer/src/rooms-command-epoch';
import {matchCommandInFlight,publicCommandKey} from '../relayer/src/chaos-tick-guard';

const id=15508105729549036396166434651117196823296587055133484651289937508406096101523n;
/** ChaosEngine.request's packing: round | epoch<<64 | index<<96 | due<<128 | exclusionMask<<160. */
const request=(epoch:bigint,round=26_581_234n,index=9n,due=91_540n)=>round|(epoch<<64n)|(index<<96n)|(due<<128n);
const randomness=(epoch:bigint)=>encodeFunctionData({abi:roomsEventsAbi,functionName:'submitRandomness',args:[id,request(epoch),`0x${'ab'.repeat(64)}` as Hex]});
const pressure=(epoch:bigint)=>encodeFunctionData({abi:roomsEventsAbi,functionName:'submitLivePressure',args:[
 {matchId:id,epoch,seed:`0x${'5e'.repeat(32)}`,rally:10,paidA:3n,paidB:1n,sourceBlock:63_000_000n,checkpoint:`0x${'c0'.repeat(32)}`,expires:1_789_900_000n},`0x${'11'.repeat(65)}`]});
const tick=encodeFunctionData({abi:roomsEventsAbi,functionName:'tick',args:[id]});

test('the epoch a command is bound to: the beacon request word and LivePressure.epoch',()=>{
 assert.equal(beaconRequestEpoch(request(6n)),6n);
 assert.equal(beaconRequestEpoch(request(4_294_967_295n)),4_294_967_295n,'32 bits');
 assert.equal(commandEpoch(roomsEventsAbi,randomness(6n)),6n);
 assert.equal(commandEpoch(roomsEventsAbi,pressure(6n)),6n);
 assert.equal(commandEpoch(roomsEventsAbi,tick),undefined,'a tick is bound to no epoch');
 assert.equal(commandEpoch(roomsEventsAbi,'0x12345678'),undefined);
});

test('reusable commands verify the outer epoch and the embedded randomness epoch',()=>{
 const proof=(outer:bigint,inner:bigint)=>encodeFunctionData({abi:reusableAbi,functionName:'submitRandomness',args:[outer,id,request(inner),'0x12']});
 assert.equal(commandEpoch(reusableAbi,proof(7n,7n)),7n);
 assert.doesNotThrow(()=>assertCommandEpoch(reusableAbi,proof(7n,7n),7n));
 for(const [outer,inner] of [[6n,7n],[7n,6n],[6n,6n]])assert.throws(()=>assertCommandEpoch(reusableAbi,proof(outer,inner),7n),StaleEpochCommand);
 for(const action of ['tick','start','cancelUnready'] as const){
  assert.doesNotThrow(()=>assertCommandEpoch(reusableAbi,encodeFunctionData({abi:reusableAbi,functionName:action,args:[7n,id]}),7n));
  assert.throws(()=>assertCommandEpoch(reusableAbi,encodeFunctionData({abi:reusableAbi,functionName:action,args:[6n,id]}),7n),StaleEpochCommand);
 }
});

test('epoch 7 never sends the resumed match\'s epoch-6 beacon proof or live pressure',()=>{
 for(const data of [randomness(6n),pressure(6n)]){
  assert.throws(()=>assertCommandEpoch(roomsEventsAbi,data,7n),(e:unknown)=>{
   assert(e instanceof StaleEpochCommand);assert(isStaleEpochCommand(e));
   assert.equal(e.commandEpoch,6n);assert.equal(e.currentEpoch,7n);
   assert.match(e.message,/not the current epoch 7; it is not sent/);return true;
  });
 }
 for(const data of [randomness(7n),pressure(7n),tick])assert.doesNotThrow(()=>assertCommandEpoch(roomsEventsAbi,data,7n));
 assert.throws(()=>assertCommandEpoch(roomsEventsAbi,randomness(7n),-1n),StaleEpochCommand,'no session read yet: nothing epoch-bound is sent');
});

test('a refused stale command never occupies the writer or counts as in flight for the guard',()=>{
 // publicTick refuses before registering its key; only admitted commands have one.
 const writes=new Map<string,Promise<void>>();
 const publicTick=(data:Hex,epoch:bigint)=>{
  try{assertCommandEpoch(roomsEventsAbi,data,epoch);}catch(e){return Promise.reject(e);}
  const key=publicCommandKey(String(id),false,data.slice(0,18));writes.set(key,new Promise(()=>{}));return writes.get(key)!;
 };
 void publicTick(randomness(6n),7n).catch(()=>{});void publicTick(pressure(6n),7n).catch(()=>{});
 assert.equal(writes.size,0);
 assert.equal(matchCommandInFlight(writes.keys(),String(id)),false,'the guard may tick the match at once');
 void publicTick(pressure(7n),7n);
 assert.equal(matchCommandInFlight(writes.keys(),String(id)),true,'a current command still does');
});

test('the beacon pump and live pressure are skipped for another epoch, before any network read',()=>{
 assert.equal(beaconRequestCurrent(request(6n),7n),false);
 assert.equal(beaconRequestCurrent(request(7n),7n),true);
 assert.equal(beaconRequestCurrent(0n,7n),true,'no request yet: the pump ignores it anyway');
 assert.equal(livePressureEpochUsable(6n,7n),false,'the round of epoch 6: its matchEpoch never changes');
 assert.equal(livePressureEpochUsable(7n,7n),true);
 assert.equal(livePressureEpochUsable(0n,7n),true,'no round yet: the relayer opens one in this epoch');
});
