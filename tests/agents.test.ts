import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ContractFunctionRevertedError,HttpRequestError,createPublicClient,custom,encodeAbiParameters,encodeErrorResult,encodeFunctionData,toFunctionSelector,zeroAddress,zeroHash,type Hex} from 'viem';
import {AgentController} from '../shared/agent-controller';
import {readFile} from 'node:fs/promises';
import {agentMetadata,agentMatchKey,validateAgentManifest,houseBots,houseSteerMetadata,steeredOnChain,pongStrategyAbi,STRATEGY_GAS,strategySamples,type AgentManifest} from '../shared/agents';
import {agentArcadeAbi} from '../shared/abi-PongAgentArcade';
import {engineSeesStrategy,leaguePair,strategyCallGas,vetStrategy} from '../relayer/src/agents/strategies';
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

// --- on-chain strategies -------------------------------------------------------------------
const strategy='0x2222222222222222222222222222222222222222',creatorAddress='0x3333333333333333333333333333333333333333';
// A Monad endpoint standing in for one strategy contract. `decide` answers what the test says.
function monad(options:{code?:Hex;creator?:string;decide?:(call:number)=>Hex|'revert'|'down'}){
 let calls=0;
 return createPublicClient({transport:custom({request:async({method,params}:any)=>{
  if(method==='eth_getCode')return options.code??'0x6080';
  if(method!=='eth_call')throw Error(`unexpected ${method}`);
  const data:Hex=params[0].data;
  if(data.startsWith(toFunctionSelector('creator()')))return encodeAbiParameters([{type:'address'}],[(options.creator??creatorAddress) as Hex]);
  const answer=options.decide?.(calls++)??encodeAbiParameters([{type:'int8'}],[1]);
  if(answer==='down')throw new HttpRequestError({url:'https://monad.invalid',status:502});
  if(answer==='revert')throw Object.assign(Error('execution reverted'),{code:3,data:'0x'});
  return answer;
 }})});
}
const refusal=(code:string,pattern?:RegExp)=>(e:any)=>{assert.equal(e.code,code);assert.equal(e.status,code==='AGENT_SERVICE_UNAVAILABLE'?503:409);if(pattern)assert.match(e.message,pattern);return true;};
test('the strategy interface the service speaks is the one the contracts compile',async()=>{
 const compiled=JSON.parse(await readFile('contracts/out/IPongStrategy.sol/IPongStrategy.json','utf8')).methodIdentifiers as Record<string,string>;
 for(const item of pongStrategyAbi.filter(x=>x.type==='function'))assert(Object.values(compiled).includes(toFunctionSelector(item as any).slice(2)),`${item.name} must match IPongStrategy`);
 const source=await readFile('contracts/src/agents/AgentSteer.sol','utf8');
 assert.equal(BigInt(/STRATEGY_GAS = ([\d_]+);/.exec(source)![1].replace(/_/g,'')),STRATEGY_GAS);
 // The vetting call gives decide() at least what the arcade does, after paying for its own calldata.
 for(const sample of strategySamples){const data=encodeFunctionData({abi:pongStrategyAbi,functionName:'decide',args:[sample as any]});
  assert(strategyCallGas(data)>21_000n+STRATEGY_GAS+BigInt((data.length-2)/2)*4n);}
 assert.deepEqual(new Set(strategySamples.map(s=>`${s.mode}:${s.side}`)),new Set(['0:0','0:1','1:0','1:1']));
 assert(strategySamples.some(s=>s.balls.length===0)&&strategySamples.some(s=>s.balls.length===2));
});
test('a strategy is vetted on Monad before anything is written, and a network failure never condemns it',async()=>{
 await vetStrategy(monad({}),strategy,creatorAddress);
 await vetStrategy(monad({decide:call=>encodeAbiParameters([{type:'int8'}],[call%3-1])}),strategy,creatorAddress);
 await assert.rejects(vetStrategy(monad({code:'0x'}),strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/No contract/));
 await assert.rejects(vetStrategy(monad({creator:strategy}),strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/creator\(\)/));
 await assert.rejects(vetStrategy(monad({decide:()=>'revert'}),strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/reverted or used more than 50000 gas on sample position 1/));
 await assert.rejects(vetStrategy(monad({decide:call=>call===2?encodeAbiParameters([{type:'int256'}],[5n]):encodeAbiParameters([{type:'int8'}],[0])}),strategy,creatorAddress),
  refusal('AGENT_STRATEGY_INVALID',/answered 5 on sample position 3/));
 await assert.rejects(vetStrategy(monad({decide:()=>encodeAbiParameters([{type:'int256'}],[-2n])}),strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/answered -2/));
 await assert.rejects(vetStrategy(monad({decide:()=>'0x01'}),strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/returned nothing/));
 await assert.rejects(vetStrategy(monad({decide:()=>'down'}),strategy,creatorAddress),refusal('AGENT_SERVICE_UNAVAILABLE'));
});
test('only a named InvalidRegistration on the engine is blamed on its pinned epoch',async()=>{
 const revert=(errorName?:string)=>async()=>{throw new ContractFunctionRevertedError({abi:agentArcadeAbi as any,functionName:'registerAgent',
  data:errorName?encodeErrorResult({abi:agentArcadeAbi as any,errorName}):undefined});};
 await engineSeesStrategy(async()=>undefined,1n);
 await assert.rejects(engineSeesStrategy(revert('InvalidRegistration'),63602747n),refusal('AGENT_STRATEGY_NEXT_EPOCH',/block 63602747/));
 await assert.rejects(engineSeesStrategy(revert('AlreadyRegistered'),1n),refusal('AGENT_STRATEGY_INVALID',/AlreadyRegistered/));
 await assert.rejects(engineSeesStrategy(revert(),1n),(e:any)=>e.code==='AGENT_STRATEGY_INVALID'&&!/epoch/.test(e.message));
 await assert.rejects(engineSeesStrategy(async()=>{throw new HttpRequestError({url:'https://node.invalid'});},1n),refusal('AGENT_SERVICE_UNAVAILABLE'));
});
test('the league gives every qualified agent its turn and pairs across creators',()=>{
 const house=['nova','pulse','onyx'].map(agent=>({agent,creator:'house'}));
 const s1={agent:'s1',creator:'alice'},s2={agent:'s2',creator:'bob'};
 assert.equal(leaguePair([house[0]],[]),undefined);
 // House alone: a rotation among the three, never the pair that just played.
 assert.deepEqual(leaguePair(house,[{a:'nova',b:'pulse'}])!.map(x=>x.agent),['onyx','nova']);
 // Newcomers first, and never against their own creator while anyone else is there.
 assert.deepEqual(leaguePair([...house,s1,s2],[{a:'nova',b:'pulse'},{a:'onyx',b:'nova'}])!.map(x=>x.agent),['s1','s2']);
 assert.deepEqual(leaguePair([...house,s1],[{a:'nova',b:'pulse'},{a:'onyx',b:'nova'}])!.map(x=>x.agent),['s1','onyx']);
 assert.deepEqual(leaguePair([...house,s1,s2],[{a:'s1',b:'onyx'},{a:'s2',b:'pulse'},{a:'nova',b:'onyx'}])!.map(x=>x.agent),['nova','s2']);
 // Over many rounds nobody waits forever: every agent plays within one full rotation.
 const everyone=[...house,s1,s2],recent:{a:string;b:string}[]=[],seen=new Set<string>();
 for(let round=0;round<5;round++){const [a,b]=leaguePair(everyone,recent)!;assert.notEqual(a.creator,b.creator);recent.unshift({a:a.agent,b:b.agent});seen.add(a.agent).add(b.agent);}
 assert.equal(seen.size,everyone.length);
});
