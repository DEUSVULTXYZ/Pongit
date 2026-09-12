import test from 'node:test';
import assert from 'node:assert/strict';
import {sameChaosPause,chaosWindowMoved} from '../shared/chaos-publication';
import {initial} from '../shared/physics-v2';
import {zeroHash} from 'viem';
test('Monad must publish the exact pause before it can open its betting window',()=>{
 const s={...initial(zeroHash,1),awaitingServe:true,resumeAt:3000000n,scoreA:1};
 const snapshot:any[]=[9n,1n,2n,,,,,,,,,,s];
 assert(sameChaosPause(9n,s,snapshot));
 for(const patch of [{mode:0},{awaitingServe:false},{resumeAt:3000001n},{scoreA:0,scoreB:1},{seed:'0x12'}]){
  assert(!sameChaosPause(9n,s,[...snapshot.slice(0,12),{...s,...patch}]));
 }
 assert(!sameChaosPause(8n,s,snapshot));
 assert(!sameChaosPause(9n,s,snapshot.map((x,i)=>i===2?3n:x)));
 assert(sameChaosPause(9n,s,[...snapshot.slice(0,12),{...s,leftDir:-1,rightDir:1,t:999n}]),'direction changes do not change the round');
});
test('only explicit window-state reverts are classified as a reobservation',()=>{
 assert(chaosWindowMoved({cause:{reason:'not a Chaos pause'}}));
 assert(chaosWindowMoved({details:'execution reverted: round already opened'}));
 assert(!chaosWindowMoved({status:429}));
 assert(!chaosWindowMoved(new Error('response lost after broadcast')));
 assert(!chaosWindowMoved({cause:{reason:'engine unavailable'}}));
});
