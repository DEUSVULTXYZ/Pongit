import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,getAbiItem,zeroAddress,zeroHash} from 'viem';
import {decodeChaosRead} from '../shared/chaos-codec';
import {reusableAgentArenaAbi} from '../shared/abi-ReusableAgentArena';
import {abi as humanAbi} from '../shared/abi-independent-ReusableEventsArena';
import {abi as legacyAbi} from '../shared/abi-independent-ReadyIndependentEventsArena';
test('named reusable headers decode identically to historical flat headers',()=>{
 const state={x:512000000n,y:288000000n,vx:450000000n,vy:100000000n,left:288000000n,right:288000000n,leftDir:0,rightDir:0,t:0n,scoreA:0,scoreB:0,
  seed:zeroHash,finished:false,mode:0,halfA:48000000n,halfB:48000000n,awaitingServe:false,resumeAt:0n};
 const header={id:11n,revision:3n,phase:2n,a:zeroAddress,b:zeroAddress,target:zeroAddress,winner:zeroAddress,head:200n,clock:0n,nonceA:0n,nonceB:0n,deadline:300n,state};
 const encoded=encodeAbiParameters([getAbiItem({abi:reusableAgentArenaAbi,name:'getSnapshot'}).outputs[0],{type:'uint256[8]'},{type:'uint256'},{type:'uint256'}],
  [header,[0n,0n,0n,0n,0n,0n,0n,0n],0n,0n]);
 const expected=decodeChaosRead(legacyAbi,encoded);
 assert.deepEqual(expected,Object.values(header));
 assert.deepEqual(decodeChaosRead(reusableAgentArenaAbi,encoded),expected);
 assert.deepEqual(decodeChaosRead(humanAbi,encoded),expected);
});
