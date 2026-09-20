import test from 'node:test';
import assert from 'node:assert/strict';
import {zeroAddress,zeroHash,type Abi} from 'viem';
import {pooledAgentArenaAbi} from '../shared/abi-PooledAgentArena';
import {reusableAgentArenaAbi} from '../shared/abi-ReusableAgentArena';
import {abi as reusableHumanAbi} from '../shared/abi-independent-ReusableEventsArena';
import {initial} from '../shared/physics-v2';
import {decodeChaosRead,type ChaosDecoded} from '../shared/chaos-codec';
import {chaosBrowserPayload} from '../scripts/chaos-browser-fixture';

for(const [name,abi] of [['historical',pooledAgentArenaAbi],['human rules 14',reusableHumanAbi],['agents rules 15',reusableAgentArenaAbi]] as const){
 test(`UI fixture decodes actual ${name} header, multiball and terminal score`,()=>{
  const state={...initial(zeroHash,1),t:3000000n,scoreA:7,scoreB:6,finished:true};
  const header=[4n,9n,3n,zeroAddress,zeroAddress,zeroAddress,zeroAddress,100n,state.t,2n,3n,0n,state];
  const decoded=decodeChaosRead(abi as Abi,chaosBrowserPayload(abi as Abi,header,21,13));
  assert.deepEqual(decoded.slice(0,12),header.slice(0,12));
  assert.deepEqual(decoded[12],state);
  const physics=(decoded[13] as ChaosDecoded).physics;
  assert.equal(physics.score.a,7);assert.equal(physics.score.b,6);assert.equal(physics.score.finished,true);
  assert.deepEqual(physics.effects.map(e=>e.id),[21,13]);
  assert(physics.balls.every(b=>b.alive));assert.equal(physics.balls[1].vy,-physics.balls[0].vy);
 });
}
