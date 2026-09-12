import {test} from "node:test";
import assert from "node:assert/strict";
import {encodeAbiParameters,encodeEventTopics,zeroHash} from "viem";
import {roomsChaosAbi as abi} from "../shared/abi-PongRoomsTestnet";
import {confirmsRoomAcceptance,expireUnstartedRoomOffer,prepareRoomLaunch,assertRoomLaunchReady} from "../shared/rooms-acceptance";
import {nextPair,type LobbyOffer,type LobbyRoom} from "../shared/rooms";
const app="0x3333333333333333333333333333333333333333", a="0x1111111111111111111111111111111111111111",b="0x2222222222222222222222222222222222222222";
const offer:LobbyOffer={id:"1",room:zeroHash,a,b,mode:1,ranked:false,expires:"20",rules:"4",entropy:zeroHash,signature:"0x",accepted:[a,b],status:"offered"};
function receipt(){return {status:"success",transactionHash:zeroHash,logs:[{address:app,topics:encodeEventTopics({abi,eventName:"MatchAccepted",args:{id:1n,room:zeroHash,player:a}}) as `0x${string}`[],data:encodeAbiParameters([{type:"address"},{type:"address"},{type:"uint8"},{type:"bool"}],[a,b,1,false])}]};}
function room():LobbyRoom{return {id:zeroHash,host:a,kind:"ranked",mode:1,created:0,activity:0,status:"offer",offer:structuredClone(offer),members:[a,b].map((player,position)=>({player,position,joined:0,seen:24000,away:false}))};}

test('two UI readiness signals start one shared intro without inventing engine consent',()=>{
 const o={...structuredClone(offer),accepted:[]};
 assert.deepEqual(prepareRoomLaunch(o,a,1000),{ready:[a]});assert.deepEqual(o.accepted,[]);
 assert.throws(()=>assertRoomLaunchReady(o,4000));
 assert.deepEqual(prepareRoomLaunch(o,b,2000),{ready:[a,b],at:5000});
 assert.deepEqual(prepareRoomLaunch(o,b,2500),{ready:[a,b],at:5000},'double clicks do not restart the timer');
 assert.throws(()=>assertRoomLaunchReady(o,4999));assertRoomLaunchReady(o,5000);
 const restored=JSON.parse(JSON.stringify(o));assertRoomLaunchReady(restored,6000);assert.deepEqual(restored.accepted,[]);
});
test('countdown rejects outsiders, too-late starts and offers without a completed intro',()=>{
 const o={...structuredClone(offer),accepted:[]};
 assert.throws(()=>prepareRoomLaunch(o,app,1000));prepareRoomLaunch(o,a,17000);
 assert.throws(()=>prepareRoomLaunch(o,b,17000));
 assert.throws(()=>prepareRoomLaunch({...o,status:'cancelled'},b,1000));
 assert.throws(()=>assertRoomLaunchReady({...o,launch:undefined},19000));
 for(const launch of [{ready:[a,a],at:1000},{ready:[a,app],at:1000},{ready:[a,b],at:NaN}])
  assert.throws(()=>assertRoomLaunchReady({...o,launch},19000));
});

test("only a successful engine event for this player, duel and deployment confirms acceptance",()=>{
 const r=receipt();assert(confirmsRoomAcceptance(r,abi,app,offer,a,zeroHash));
 assert(!confirmsRoomAcceptance({...r,status:"reverted"},abi,app,offer,a,zeroHash));
 assert(!confirmsRoomAcceptance(r,abi,app,offer,b,zeroHash));
 assert(!confirmsRoomAcceptance(r,abi,a,offer,a,zeroHash));
 assert(!confirmsRoomAcceptance(r,abi,app,{...offer,id:"2"},a,zeroHash));
 assert(!confirmsRoomAcceptance(r,abi,app,{...offer,mode:0},a,zeroHash));
 assert(!confirmsRoomAcceptance(r,abi,app,{...offer,ranked:true},a,zeroHash));
 assert(!confirmsRoomAcceptance({...r,logs:[{...r.logs[0],removed:true}]},abi,app,offer,a,zeroHash));
 assert(!confirmsRoomAcceptance({...r,transactionHash:"0x1"},abi,app,offer,a,zeroHash));
});
test("two stale HTTP acceptances expire once and cannot generate another offer",()=>{
 const r=room();assert(expireUnstartedRoomOffer(r,0n,24000));
 assert.equal(r.offer!.status,"cancelled");assert.deepEqual(r.offer!.accepted,[]);
 assert.deepEqual(nextPair(r.members,undefined,24000),[]);
 for(let n=0;n<5;n++){assert(!expireUnstartedRoomOffer(r,0n,24000+n*2000));assert.deepEqual(nextPair(r.members,undefined,24000+n*2000),[]);}
 // An explicit rejoin by both users restores eligibility.
 r.members.forEach(m=>m.away=false);assert.equal(nextPair(r.members,undefined,24000).length,2);
});
test("missing, pending or active engine state cannot be expired as an unsubmitted offer",()=>{
 for(const phase of [undefined,1n,2n,3n]){const r=room();assert(!expireUnstartedRoomOffer(r,phase,24000));assert(r.members.every(m=>!m.away));}
 assert(!expireUnstartedRoomOffer(room(),0n,23000));
});
