import assert from 'node:assert/strict';
import {test} from 'node:test';
import {zeroAddress,zeroHash} from 'viem';
import {AgentController} from '../shared/agent-controller';
import {readFile} from 'node:fs/promises';
import {agentMetadata,agentMatchKey,validateAgentManifest,houseBots,houseSteerMetadata,steeredOnChain,type AgentManifest} from '../shared/agents';
import {TICK_AFTER_MS,TICK_CYCLE_MS,TICK_BURST_MAX,CAUGHT_UP_US} from '../relayer/src/agents/coordinator';
import {ENGINE_GAS,engineGas} from '../relayer/src/agents/writer';
import {initial} from '../shared/physics-interlude';
import type {EngineState} from '../shared/engine-stream';
const app='0x1111111111111111111111111111111111111111';
const manifest:AgentManifest={version:1,chainId:10143,engineChainId:4242,rulesVersion:7,app,hub:app,coordinator:app,node:'https://agents.invalid',epoch:'1',enabled:false,qualified:false,maxMatches:2,durationSeconds:300};
const snapshot=():EngineState=>({id:1n,revision:1n,phase:2,a:app,b:zeroAddress,target:zeroAddress,winner:zeroAddress,head:100n,clock:0n,nonceA:0n,nonceB:0n,deadline:0n,observedAt:0,
 state:{...initial(zeroHash),x:200000000n,y:80000000n,vx:-192000000n,vy:0n}});
test('bot difficulty controls reaction time and stops immediately when a match ends',()=>{
 for(const level of [0,1,2] as const){const c=new AgentController(level,()=>.5),s=snapshot();assert.equal(c.decide(s,0,0),-1);
  s.state.y=500000000n;assert.equal(c.decide(s,0,houseBots[level].reactionMs-1),-1);assert.equal(c.decide(s,0,houseBots[level].reactionMs),1);
  s.phase=3;assert.equal(c.decide(s,0,houseBots[level].reactionMs+1),0);
 }
});
test('controllers use bounded public state and keep their own randomness out of match identity',()=>{
 const s=snapshot(),before=structuredClone(s),c=new AgentController(2,()=>0);
 for(let n=0;n<1000;n++){s.state.vx=n%2?-10000000000n:10000000000n;s.state.vy=BigInt(n*1900000);assert([-1,0,1].includes(c.decide(s,n%2 as 0|1,n*100)));}
 assert.equal(s.state.left,before.state.left);assert.equal(s.nonceA,0n);assert.equal(s.winner,zeroAddress);
 c.reset();s.phase=4;assert.equal(c.decide(s,0,0),0);
});
test('agent manifests cannot substitute chains, financial arenas, duration or an insecure endpoint',()=>{
 assert.equal(validateAgentManifest(manifest),manifest);
 for(const changed of [{chainId:1},{engineChainId:10143},{rulesVersion:6},{durationSeconds:301},{maxMatches:3},{epoch:'0'},{node:'http://agents.invalid'}])assert.throws(()=>validateAgentManifest({...manifest,...changed} as AgentManifest));
 assert.notEqual(agentMatchKey({chainId:10143,app,epoch:'1',id:'1'}),agentMatchKey({chainId:10143,app,epoch:'2',id:'1'}));
});
test('registration metadata commits exact validated names and an existing avatar',()=>{
 assert.notEqual(agentMetadata('Agent One',0),agentMetadata('Agent One',1));assert.notEqual(agentMetadata('Agent One',0),agentMetadata('Agent Two',0));
 for(const [name,avatar] of [['',0],['<script>',0],['Agent',12],['Agent',-.5]] as const)assert.throws(()=>agentMetadata(name,avatar));
});
test('the client recognises exactly the seats the contract steers, and reads the tiers from its source',async()=>{
 // If these drift apart the failure is silent and expensive: the worker keeps
 // sending inputs the contract overwrites, and every one of them costs a batch.
 const source=await readFile('contracts/src/agents/AgentSteer.sol','utf8');
 const constants=['NOVA','PULSE','ONYX'].map(name=>{
  const found=new RegExp(`constant ${name} = (0x[0-9a-f]{64});`).exec(source);
  assert(found,`AgentSteer must declare ${name}`);return found[1];
 });
 assert.deepEqual(houseSteerMetadata.map(x=>x.toLowerCase()),constants);
 for(const bot of houseBots)assert.equal(steeredOnChain(agentMetadata(bot.name,bot.avatar)),true);
 assert.equal(steeredOnChain(agentMetadata('NOVA',1)),false);
 assert.equal(steeredOnChain(agentMetadata('Community Agent',0)),false);
});
test('a catch-up is always sliced and bounded on gas, never advanced whole and unsteered',async()=>{
 // The contract once advanced any gap over 1.6 s in one unsteered call. One such call
 // during Chaos effect 17 costs more than a game command carries, so the tick reverted,
 // the gap grew, and the match froze for good. The escape must not come back, and the
 // arcade loop must stop on its gas reserve so the next tick resumes.
 const steer=await readFile('contracts/src/agents/AgentSteer.sol','utf8');
 assert.doesNotMatch(steer,/MAX_CATCHUP/);
 assert.match(steer,/if \(nowUs >= target\) return target;/);
 const arcade=await readFile('contracts/src/agents/PongAgentArcade.sol','utf8');
 assert.match(arcade,/while\(complete&&sub<target&&_phase\(id\)==2&&gasleft\(\)>[0-9_]+\);/);
 assert(TICK_AFTER_MS>=200&&TICK_AFTER_MS<=60000&&TICK_CYCLE_MS===500);
 // A burst must be able to outlast the heaviest Chaos stretch between two cycles.
 assert(TICK_BURST_MAX>=4&&CAUGHT_UP_US>0n);
});
test('only commands that catch a match up get the large gas budget',()=>{
 // One tick per burst instead of a dozen: on a node that seals every half second each
 // transaction is a batch. Player-facing and registry commands keep a command's 15 M.
 for(const name of ['tick','submitRandomness'])assert.equal(engineGas(name),ENGINE_GAS.catchUp);
 for(const name of ['registerAgent','qualifyAgent','cancelMatch','acceptMatch','input','concede'])assert.equal(engineGas(name),ENGINE_GAS.other);
 // The hosted node refuses a transaction above 30 M before executing it.
 assert(ENGINE_GAS.catchUp===30_000_000n&&ENGINE_GAS.other===15_000_000n);
});
