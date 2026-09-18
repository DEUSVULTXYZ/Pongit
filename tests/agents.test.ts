import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {ContractFunctionRevertedError,HttpRequestError,createPublicClient,custom,encodeAbiParameters,encodeErrorResult,encodeFunctionData,http,keccak256,toFunctionSelector,toHex,zeroAddress,zeroHash,type Address,type Hex} from 'viem';
import {AgentController} from '../shared/agent-controller';
import {readFile} from 'node:fs/promises';
import {agentMetadata,agentMatchKey,validateAgentManifest,houseBots,houseSteerMetadata,steeredOnChain,pongStrategyAbi,CREATOR_GAS,REGISTRATION_WINDOW,STRATEGY_GAS,strategySamples,type AgentManifest} from '../shared/agents';
import {agentArcadeAbi} from '../shared/abi-PongAgentArcade';
import {callGas,checkRegistration,engineSeesStrategy,leaguePair,strategyCallGas,strategyEvidence,strategyRequeue,strategyVerdict,vetStrategy,
 STRATEGY_COOLDOWN,STRATEGY_MOVED_FRAMES,STRATEGY_RETRIES} from '../relayer/src/agents/strategies';
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
const strategy:Address='0x2222222222222222222222222222222222222222',creatorAddress:Address='0x3333333333333333333333333333333333333333';
type Answer=Hex|'revert'|'oog'|'revm'|'down'|'limited'|'internal';
// How a node answers each case: Monad's own revert and out-of-gas replies (its public endpoint,
// 2026-09-18), anvil's out of gas, a provider's rate limit and internal error, and an HTTP failure.
function reply(answer:Answer){
 if(answer==='down')throw new HttpRequestError({url:'https://monad.invalid',status:502});
 if(answer==='revert')throw Object.assign(Error('execution reverted'),{code:3,data:'0x'});
 if(answer==='oog')throw Object.assign(Error('out of gas'),{code:-32603});
 if(answer==='revm')throw Object.assign(Error('EVM error OutOfGas'),{code:-32603});
 if(answer==='limited')throw Object.assign(Error('request limited to 25 rps'),{code:-32005});
 if(answer==='internal')throw Object.assign(Error('internal error'),{code:-32603});
 return answer;
}
// A Monad endpoint standing in for one strategy contract. `decide` answers what the test says, and
// `gas` records the gas each eth_call carried.
function monad(options:{code?:Hex;creator?:Answer;decide?:(call:number)=>Answer},gas:bigint[]=[]){
 let calls=0;
 return createPublicClient({transport:custom({request:async({method,params}:any)=>{
  if(method==='eth_getCode')return options.code??'0x6080';
  if(method!=='eth_call')throw Error(`unexpected ${method}`);
  gas.push(BigInt(params[0].gas));
  if(params[0].data===toFunctionSelector('creator()'))return reply(options.creator??encodeAbiParameters([{type:'address'}],[creatorAddress]));
  return reply(options.decide?.(calls++)??encodeAbiParameters([{type:'int8'}],[1]));
 }},{retryCount:0})});
}
const refusal=(code:string,pattern?:RegExp)=>(e:any)=>{assert.equal(e.code,code);assert.equal(e.status,code==='AGENT_SERVICE_UNAVAILABLE'?503:409);if(pattern)assert.match(e.message,pattern);return true;};
const calldataCost=(data:Hex)=>{let zero=0n,nonzero=0n;for(let i=2;i<data.length;i+=2)data.slice(i,i+2)==='00'?zero++:nonzero++;return {standard:4n*zero+16n*nonzero,tokens:zero+4n*nonzero};};
test('the strategy interface the service speaks is the one the contracts compile',async()=>{
 const compiled=JSON.parse(await readFile('contracts/out/IPongStrategy.sol/IPongStrategy.json','utf8')).methodIdentifiers as Record<string,string>;
 for(const item of pongStrategyAbi.filter(x=>x.type==='function'))assert(Object.values(compiled).includes(toFunctionSelector(item as any).slice(2)),`${item.name} must match IPongStrategy`);
 const source=await readFile('contracts/src/agents/AgentSteer.sol','utf8');
 assert.equal(BigInt(/STRATEGY_GAS = ([\d_]+);/.exec(source)![1].replace(/_/g,'')),STRATEGY_GAS);
 const identity=await readFile('contracts/src/agents/AgentIdentity.sol','utf8');
 assert.equal(BigInt(/staticcall\((\d+),strategy,/.exec(identity)![1]),CREATOR_GAS);
 assert.match(identity,/r\.expires>block\.timestamp\+10 minutes\)revert InvalidRegistration\(\);/);assert.equal(REGISTRATION_WINDOW,10n*60n);
 // The vetting call gives decide() exactly the arcade's budget once its own intrinsic and calldata
 // cost are paid, no more, and stays above the EIP-7623 floor Monad enforces as a minimum.
 for(const sample of strategySamples){const data=encodeFunctionData({abi:pongStrategyAbi,functionName:'decide',args:[sample as any]}),cost=calldataCost(data);
  assert.equal(strategyCallGas(data),21_000n+cost.standard+STRATEGY_GAS);assert(strategyCallGas(data)>=21_000n+10n*cost.tokens);}
 assert.equal(callGas(toFunctionSelector('creator()'),CREATOR_GAS),21_000n+4n*16n+CREATOR_GAS);
 assert.deepEqual(new Set(strategySamples.map(s=>`${s.mode}:${s.side}`)),new Set(['0:0','0:1','1:0','1:1']));
 assert(strategySamples.some(s=>s.balls.length===0)&&strategySamples.some(s=>s.balls.length===2));
});
test('a strategy is vetted on Monad before anything is written, and only its own answers condemn it',async()=>{
 const gas:bigint[]=[];await vetStrategy(monad({},gas),strategy,creatorAddress);
 // creator() gets the registration's 30,000 and decide() the arcade's 50,000, exactly.
 assert.equal(gas[0],callGas(toFunctionSelector('creator()'),CREATOR_GAS));
 assert.deepEqual(gas.slice(1),strategySamples.map(sample=>strategyCallGas(encodeFunctionData({abi:pongStrategyAbi,functionName:'decide',args:[sample as any]}))));
 await vetStrategy(monad({decide:call=>encodeAbiParameters([{type:'int8'}],[call%3-1])}),strategy,creatorAddress);
 await assert.rejects(vetStrategy(monad({code:'0x'}),strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/No contract/));
 // An account delegating to code (EIP-7702) keeps its key and could also play as a key seat.
 await assert.rejects(vetStrategy(monad({code:`0xef0100${strategy.slice(2)}`}),strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/EIP-7702/));
 await assert.rejects(vetStrategy(monad({creator:encodeAbiParameters([{type:'address'}],[strategy])}),strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/creator\(\)/));
 // Read as AgentIdentity.creatorOf reads it: a word above an address, a short answer, a revert and
 // running out of its 30,000 gas all leave the engine with no creator, so each is refused here.
 for(const creator of [toHex((1n<<160n)+BigInt(creatorAddress),{size:32}),'0x01','revert','oog'] as const)
  await assert.rejects(vetStrategy(monad({creator}),strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/creator\(\), within 30000 gas/));
 await assert.rejects(vetStrategy(monad({decide:()=>'revert'}),strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/reverted or used more than 50000 gas on sample position 1/));
 await assert.rejects(vetStrategy(monad({decide:call=>call===1?'oog':encodeAbiParameters([{type:'int8'}],[0])}),strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/used more than 50000 gas on sample position 2/));
 await assert.rejects(vetStrategy(monad({decide:()=>'revm'}),strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/used more than 50000 gas on sample position 1/));
 await assert.rejects(vetStrategy(monad({decide:call=>call===2?encodeAbiParameters([{type:'int256'}],[5n]):encodeAbiParameters([{type:'int8'}],[0])}),strategy,creatorAddress),
  refusal('AGENT_STRATEGY_INVALID',/answered 5 on sample position 3/));
 await assert.rejects(vetStrategy(monad({decide:()=>encodeAbiParameters([{type:'int256'}],[-2n])}),strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/answered -2/));
 await assert.rejects(vetStrategy(monad({decide:()=>'0x01'}),strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/returned nothing/));
 // A provider that did not answer says nothing about the contract, on either call.
 for(const failure of ['down','limited','internal'] as const){
  await assert.rejects(vetStrategy(monad({decide:()=>failure}),strategy,creatorAddress),refusal('AGENT_SERVICE_UNAVAILABLE'));
  await assert.rejects(vetStrategy(monad({creator:failure}),strategy,creatorAddress),refusal('AGENT_SERVICE_UNAVAILABLE'));
 }
});
test('JSON-RPC errors from a throttled provider over HTTP are an outage, not a broken strategy',async()=>{
 // The review's reproduction: an HTTP endpoint that answers eth_call with a JSON-RPC error body,
 // under HTTP 200 and under HTTP 429, read through the same transport the service uses.
 let answer:(data:Hex)=>{status:number;body:any}=()=>({status:200,body:{}});
 const server=createServer(async(req,res)=>{let text='';for await(const part of req)text+=part;const call=JSON.parse(text);
  const out=call.method==='eth_getCode'?{status:200,body:{result:'0x6080'}}:answer(call.params[0].data);
  res.writeHead(out.status,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:call.id,...out.body}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base=createPublicClient({transport:http(`http://127.0.0.1:${(server.address() as any).port}`,{retryCount:0})});
  const limited={error:{code:-32005,message:'request limited to 25 rps'}},creatorWord=encodeAbiParameters([{type:'address'}],[creatorAddress]);
  const onCreator=(status:number,body:any)=>(data:Hex)=>data===toFunctionSelector('creator()')?{status,body}:{status:200,body:{result:creatorWord}};
  const onDecide=(status:number,body:any)=>(data:Hex)=>data===toFunctionSelector('creator()')?{status:200,body:{result:creatorWord}}:{status,body};
  for(const [label,handler] of [['creator() under 200',onCreator(200,limited)],['decide() under 429',onDecide(429,limited)],['decide() under 200',onDecide(200,limited)],
   ['an internal error',onDecide(200,{error:{code:-32603,message:'Internal error'}})]] as const){
   answer=handler;await assert.rejects(vetStrategy(base,strategy,creatorAddress),refusal('AGENT_SERVICE_UNAVAILABLE'),label);
  }
  // Monad's own replies for a revert and for running out of gas still condemn the contract.
  answer=onDecide(200,{error:{code:3,message:'execution reverted',data:'0x'}});await assert.rejects(vetStrategy(base,strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/reverted/));
  answer=onDecide(200,{error:{code:-32603,message:'out of gas'}});await assert.rejects(vetStrategy(base,strategy,creatorAddress),refusal('AGENT_STRATEGY_INVALID',/50000 gas/));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('every refusal of AgentIdentity.register the request shows is a 400 with its reason',async()=>{
 // The causes the contract names InvalidRegistration. A new one must be checked in
 // checkRegistration or explained in engineSeesStrategy, or the pinned epoch takes the blame.
 const source=await readFile('contracts/src/agents/AgentIdentity.sol','utf8'),register=source.slice(source.indexOf('function register('),source.indexOf('function creatorOf('));
 assert.equal(register.match(/revert InvalidRegistration\(\)/g)?.length,3);
 assert.equal(/if\(([^;]*)\)revert InvalidRegistration\(\);/.exec(register)![1].replace(/\s+/g,''),
  'r.creator==address(0)||r.agent==address(0)||r.creator==r.agent||r.modes==0||r.modes>3||r.metadata==bytes32(0)||r.expires<=block.timestamp||r.expires>block.timestamp+10minutes');
 const now=1_900_000_000n,proof=`0x${'11'.repeat(32)}${'22'.repeat(32)}1b` as Hex;
 const good={creator:creatorAddress,agent:strategy,name:'Tracker',avatar:4,modes:3,expires:now+300n,creatorProof:proof} as const;
 assert.equal(checkRegistration(good,now,false),agentMetadata('Tracker',4));
 assert.equal(checkRegistration({...good,expires:now+REGISTRATION_WINDOW,agentProof:proof},now,false),agentMetadata('Tracker',4));
 const invalid=(code:string)=>(e:any)=>{assert.equal(e.status,400);assert.equal(e.code,code);return true;};
 for(const [name,avatar] of [['X',0],['My Bot!',0],['Tracker',12],['Tracker',-1]] as const)assert.throws(()=>checkRegistration({...good,name,avatar},now,false),invalid('AGENT_NAME_INVALID'));
 for(const changed of [{creator:zeroAddress},{agent:zeroAddress},{agent:creatorAddress.toUpperCase().replace('0X','0x')},{modes:0},{modes:4}])
  assert.throws(()=>checkRegistration({...good,...changed} as any,now,false),invalid('AGENT_REGISTRATION_INVALID'));
 assert.throws(()=>checkRegistration({...good,expires:now},now,false),invalid('AGENT_REGISTRATION_EXPIRED'));
 // Over-long: refused here for what it is, never left to the rehearsal to blame on the epoch.
 for(const expires of [now+REGISTRATION_WINDOW+1n,now+3600n,1n<<64n])assert.throws(()=>checkRegistration({...good,expires},now,false),invalid('AGENT_REGISTRATION_WINDOW'));
 // Session.recover takes only v 27 or 28 and a low s, from either owner.
 for(const bad of [`${proof.slice(0,130)}00`,`${proof.slice(0,130)}01`,`0x${'11'.repeat(32)}${'ff'.repeat(32)}1c`] as Hex[]){
  assert.throws(()=>checkRegistration({...good,creatorProof:bad},now,false),invalid('AGENT_REGISTRATION_SIGNATURE'));
  assert.throws(()=>checkRegistration({...good,agentProof:bad},now,false),invalid('AGENT_REGISTRATION_SIGNATURE'));
 }
});
test('a house bot name and avatar are refused to anyone but the house, strategy or key',()=>{
 // Such a seat is steered by the house policy on chain (AgentSteer._tier), never by its own logic.
 const now=1_900_000_000n,proof=`0x${'11'.repeat(32)}${'22'.repeat(32)}1b` as Hex,good={creator:creatorAddress,agent:strategy,modes:3,expires:now+300n,creatorProof:proof};
 for(const bot of houseBots){
  assert.throws(()=>checkRegistration({...good,name:bot.name,avatar:bot.avatar},now,false),(e:any)=>e.status===400&&e.code==='AGENT_NAME_RESERVED');
  assert.throws(()=>checkRegistration({...good,name:bot.name,avatar:bot.avatar,agentProof:proof},now,false),(e:any)=>e.code==='AGENT_NAME_RESERVED');
  assert.equal(checkRegistration({...good,name:bot.name,avatar:bot.avatar,agentProof:proof},now,true),agentMetadata(bot.name,bot.avatar));
 }
 // Only the exact digests are steered; the same name with another avatar is an ordinary agent.
 assert.equal(checkRegistration({...good,name:'ONYX',avatar:3},now,false),agentMetadata('ONYX',3));
});
test('a named InvalidRegistration is blamed on the pinned epoch only when the engine clock does not explain it',async()=>{
 const revert=(errorName?:string)=>async()=>{throw new ContractFunctionRevertedError({abi:agentArcadeAbi as any,functionName:'registerAgent',
  data:errorName?encodeErrorResult({abi:agentArcadeAbi as any,errorName}):undefined});};
 const engine=(now:bigint,expires=now+300n)=>({baseBlock:63602747n,expires,clock:async()=>now});
 await engineSeesStrategy(async()=>undefined,engine(1000n));
 await assert.rejects(engineSeesStrategy(revert('InvalidRegistration'),engine(1000n)),refusal('AGENT_STRATEGY_NEXT_EPOCH',/block 63602747/));
 // The engine's clock, not this service's, sets the window the contract checks.
 await assert.rejects(engineSeesStrategy(revert('InvalidRegistration'),engine(1000n,1000n+REGISTRATION_WINDOW+1n)),refusal('AGENT_REGISTRATION_WINDOW',/clock reads 1000/));
 await assert.rejects(engineSeesStrategy(revert('InvalidRegistration'),engine(1000n,1000n)),refusal('AGENT_REGISTRATION_WINDOW'));
 await assert.rejects(engineSeesStrategy(revert('InvalidRegistration'),{...engine(1000n),clock:async()=>{throw new HttpRequestError({url:'https://node.invalid'});}}),refusal('AGENT_SERVICE_UNAVAILABLE'));
 await assert.rejects(engineSeesStrategy(revert('AlreadyRegistered'),engine(1000n)),refusal('AGENT_STRATEGY_INVALID',/AlreadyRegistered/));
 await assert.rejects(engineSeesStrategy(revert(),engine(1000n)),(e:any)=>e.code==='AGENT_STRATEGY_INVALID'&&!/epoch/.test(e.message));
 await assert.rejects(engineSeesStrategy(async()=>{throw new HttpRequestError({url:'https://node.invalid'});},engine(1000n)),refusal('AGENT_SERVICE_UNAVAILABLE'));
});
// Each agent's last match id, from a list of matches newest first.
const lastOf=(recent:readonly {a:string;b:string}[])=>{const last=new Map<string,bigint>();
 recent.forEach((match,index)=>{for(const player of [match.a,match.b])if(!last.has(player))last.set(player,BigInt(recent.length-index));});return last;};
test('the league gives every qualified agent its turn and pairs across creators',()=>{
 const house=['nova','pulse','onyx'].map(agent=>({agent,creator:'house'}));
 const s1={agent:'s1',creator:'alice'},s2={agent:'s2',creator:'bob'};
 assert.equal(leaguePair([house[0]],new Map()),undefined);
 // House alone: a rotation among the three, never the pair that just played.
 assert.deepEqual(leaguePair(house,lastOf([{a:'nova',b:'pulse'}]))!.map(x=>x.agent),['onyx','nova']);
 // Newcomers first, and never against their own creator while anyone else is there.
 assert.deepEqual(leaguePair([...house,s1,s2],lastOf([{a:'nova',b:'pulse'},{a:'onyx',b:'nova'}]))!.map(x=>x.agent),['s1','s2']);
 assert.deepEqual(leaguePair([...house,s1],lastOf([{a:'nova',b:'pulse'},{a:'onyx',b:'nova'}]))!.map(x=>x.agent),['s1','onyx']);
 assert.deepEqual(leaguePair([...house,s1,s2],lastOf([{a:'s1',b:'onyx'},{a:'s2',b:'pulse'},{a:'nova',b:'onyx'}]))!.map(x=>x.agent),['nova','s2']);
 // Over many rounds nobody waits forever: every agent plays within one full rotation.
 const everyone=[...house,s1,s2],last=new Map<string,bigint>(),seen=new Set<string>();
 for(let id=1n;id<=5n;id++){const [a,b]=leaguePair(everyone,last)!;assert.notEqual(a.creator,b.creator);last.set(a.agent,id).set(b.agent,id);seen.add(a.agent).add(b.agent);}
 assert.equal(seen.size,everyone.length);
});
test('the league starves nobody once the qualified pool outgrows any window of recent matches',()=>{
 // With the last 200 matches as its memory, 48 of 450 agents never played in 5,000 matches: an
 // agent that left the window tied with those who never played, and won by registering first.
 // Every other match here is also a human challenge against one of seven agents, which keeps
 // those seven busy and ranks them last for the league, as a match just played should.
 const agents=Array.from({length:450},(_,i)=>({agent:`s${i}`,creator:`c${i}`})),last=new Map<string,bigint>(),league=new Map<string,number>(),played=new Set<string>();
 for(let id=1n;id<=5000n;id++){
  if(id%2n===0n){const agent=`s${id%7n}`;last.set(agent,id);played.add(agent);continue;}
  const [a,b]=leaguePair(agents,last)!;
  for(const x of [a,b]){last.set(x.agent,id);played.add(x.agent);league.set(x.agent,(league.get(x.agent)??0)+1);}
 }
 assert.equal(played.size,450);
 // Among the others, turns go round: each had several, and no two differ by more than one.
 const counts=agents.filter(x=>!/^s[0-6]$/.test(x.agent)).map(x=>league.get(x.agent)??0);
 assert(Math.min(...counts)>=5&&Math.max(...counts)-Math.min(...counts)<=1);
});
test('a failing strategy gets a bounded number of qualification matches, then waits out the cool-down',()=>{
 const at=1_900_000_000,attempts=(n:number)=>Array.from({length:n},(_,i)=>at+i*600);
 for(const state of ['registered','retry','failed'])assert.deepEqual(strategyRequeue(state,attempts(STRATEGY_RETRIES)),{queue:true});
 // The first match and three retries, then no more until the oldest has aged out.
 assert.deepEqual(strategyRequeue('retry',attempts(STRATEGY_RETRIES+1)),{queue:false,retryAt:at+STRATEGY_COOLDOWN});
 assert.deepEqual(strategyRequeue('failed',attempts(STRATEGY_RETRIES+2).reverse()),{queue:false,retryAt:at+600+STRATEGY_COOLDOWN});
 assert.deepEqual(strategyRequeue('failed',[]),{queue:true});
 // Nothing a registration may requeue: already queued, playing, or qualified.
 for(const state of ['queued','testing','qualified',undefined])assert.deepEqual(strategyRequeue(state,[]),{queue:false});
 assert(STRATEGY_RETRIES===3&&STRATEGY_COOLDOWN>=60*60);
});
test('a strategy qualification sends the same command however often a pass is retried',async()=>{
 const sent:(readonly unknown[])[]=[],result=keccak256('0x01');let frames=40;
 const io=(journaled?:readonly unknown[],attempts=1)=>({journaled,moved:async()=>frames,evidence:async()=>strategyEvidence({app,id:'7',epoch:'3'},result),
  send:async(args:readonly unknown[])=>{sent.push(args);},attempts:async()=>attempts});
 // A restart captures the terminal frame again, so the count moves between passes; the command
 // journaled under qualify:<match>:<agent>:<mode> must not, or every later cycle aborts on it.
 assert.equal(await strategyVerdict(strategy,1,io()),'qualified');frames=41;
 assert.equal(await strategyVerdict(strategy,1,io()),'qualified');
 const data=sent.map(args=>encodeFunctionData({abi:agentArcadeAbi,functionName:'qualifyAgent',args:args as any}));
 assert.equal(data[0],data[1]);assert.deepEqual(sent[0],[strategy,1,true,strategyEvidence({app,id:'7',epoch:'3'},result)]);
 assert.notEqual(strategyEvidence({app,id:'7',epoch:'3'},result),strategyEvidence({app,id:'8',epoch:'3'},result));
 // A pass already journaled stands, even one an earlier release built with its frame count, and
 // goes out exactly as journaled whatever the frames say now.
 const journaled=[strategy,1,true,keccak256('0x02')] as const;frames=0;
 assert.equal(await strategyVerdict(strategy,1,io(journaled)),'qualified');assert.deepEqual(sent.at(-1),journaled);
 // A failure sends nothing: a retry while retries remain, then failed.
 const before=sent.length;frames=STRATEGY_MOVED_FRAMES-1;
 assert.equal(await strategyVerdict(strategy,1,io(undefined,STRATEGY_RETRIES)),'retry');
 assert.equal(await strategyVerdict(strategy,1,io(undefined,STRATEGY_RETRIES+1)),'failed');
 assert.equal(sent.length,before);
});
