import test from 'node:test';
import assert from 'node:assert/strict';
import {zeroAddress,zeroHash,encodeFunctionData,type Abi} from 'viem';
import {abi as reusableAbi} from '../shared/abi-independent-ReusableEventsArena';
import {initial} from '../shared/physics-v2';
import type {EngineState} from '../shared/engine-stream';
import {ChaosBeaconPump} from '../shared/chaos-beacon-pump';
import {independentEventsLoop} from '../relayer/src/independent-events-loop';

const turn=()=>new Promise<void>(r=>setImmediate(r));
function fixture(){
 let ref={id:20n,epoch:3n},clock=100n,launch=0n,busy=false,age=2000;
 let state:EngineState={id:20n,revision:1n,phase:1,a:zeroAddress,b:zeroAddress,target:zeroAddress,winner:zeroAddress,head:1n,clock:0n,nonceA:0n,nonceB:0n,deadline:0n,state:initial(zeroHash),observedAt:0};
 const sent:any[]=[];
 const actor={reference:()=>ref,busy:()=>busy,read:async()=>state,node:{getBlock:async()=>({timestamp:clock})},launchAt:async()=>launch,progressAge:()=>age,
  send:async(action:string,args:readonly unknown[])=>{sent.push({action,args});if(action==='start'){if(!launch)launch=clock+3n;else state={...state,phase:2};}return state;}};
 return {actor,sent,state:()=>state,setState:(v:Partial<EngineState>)=>state={...state,...v},clock:(v:bigint)=>clock=v,bind:()=>ref={id:21n,epoch:4n},busy:(v:boolean)=>busy=v,age:(v:number)=>age=v};
}
test('countdown arms once and can start only after the contract engine deadline',async()=>{
 const f=fixture(),loop=independentEventsLoop(f.actor);await loop.progress();assert.equal(f.sent.length,1);
 f.clock(102n);await loop.progress();await loop.progress();assert.equal(f.sent.length,1);
 f.clock(103n);await loop.progress();assert.equal(f.state().phase,2);assert.deepEqual(f.sent.map(x=>x.action),['start','start']);
 f.age(900);await loop.progress();assert.equal(f.sent.length,2);
 f.age(1500);await loop.progress();assert.equal(f.sent[2].action,'tick');loop.stop();
});
test('proof transport allows ticks; a ready proof uses the same writer only after its current command',async()=>{
 const f=fixture();f.setState({phase:2,chaos:{request:1n,pending:0n} as any});
 let resolve!:(v:any)=>void;const errors:unknown[]=[];
 const beacon=new ChaosBeaconPump({read:()=>new Promise(r=>resolve=r)},()=>1727521080000);
 const loop=independentEventsLoop(f.actor,beacon);
 await loop.supply(e=>errors.push(e));await loop.progress();assert.equal(f.sent[0].action,'tick');
 f.busy(true);resolve({signature:'0x12'});await turn();assert.equal(loop.blocksWrite(),true);
 await loop.progress();assert.equal(f.sent.length,1);f.busy(false);
 await new Promise(r=>setTimeout(r,40));assert.equal(f.sent[1].action,'submitRandomness');assert.deepEqual(f.sent[1].args,[20n,1n,'0x12']);assert.deepEqual(errors,[]);loop.stop();
});
test('a delayed proof cannot follow a renewed binding, stopped loop or completed game',async()=>{
 for(const change of ['binding','stop','completed']){
  const f=fixture();f.setState({phase:2,chaos:{request:1n,pending:0n} as any});let resolve!:(v:any)=>void;
  const loop=independentEventsLoop(f.actor,new ChaosBeaconPump({read:()=>new Promise(r=>resolve=r)},()=>1727521080000));
  await loop.supply(()=>assert.fail('discarding a stale proof is not a retry'));
  if(change==='binding')f.bind();else if(change==='stop')loop.stop();else f.setState({phase:3});
  resolve({signature:'0x12'});await turn();assert.equal(f.sent.length,0);loop.stop();
 }
});
test('slow admission reads cannot start a replaced match or a busy writer',async()=>{
 const f=fixture();f.actor.launchAt=async()=>{f.bind();return 0n;};const loop=independentEventsLoop(f.actor);
 await loop.progress();assert.equal(f.sent.length,0);loop.stop();
 const g=fixture();g.busy(true);await independentEventsLoop(g.actor).progress();assert.equal(g.sent.length,0);
});
test('readiness waits for both players, preserves its timeout and cancels an absent player',async()=>{
 const f=fixture();let mask=0,deadline=0n;
 const actor={...f.actor,readiness:async()=>[mask,deadline] as const,send:async(action:string,args:readonly unknown[])=>{
  if(action==='start'&&mask!==3){f.sent.push({action,args});deadline=130n;return;}
  return f.actor.send(action,args);
 }};
 const loop=independentEventsLoop(actor);
 await loop.progress();assert.equal(deadline,130n);assert.equal(f.sent.length,1);
 mask=1;f.clock(130n);await loop.progress();assert.equal(f.sent.length,1);
 f.clock(131n);await loop.progress();assert.equal(f.sent[1].action,'cancelUnready');assert.deepEqual(f.sent[1].args,[20n]);loop.stop();
});
test('ready participants retain the three-second authoritative countdown',async()=>{
 const f=fixture(),loop=independentEventsLoop({...f.actor,readiness:async()=>[3,130n] as const});
 await loop.progress();f.clock(102n);await loop.progress();assert.equal(f.sent.length,1);
 f.clock(103n);await loop.progress();assert.equal(f.state().phase,2);assert.deepEqual(f.sent.map(x=>x.action),['start','start']);loop.stop();
});
test('a delayed readiness response cannot cancel or start a replacement match',async()=>{
 for(const mask of [1,3]){
  const f=fixture(),loop=independentEventsLoop({...f.actor,readiness:async()=>{f.bind();return [mask,1n] as const;}});
  await loop.progress();assert.equal(f.sent.length,0);loop.stop();
 }
});

test('reusable readiness, countdown, ticks and proofs bind the real logical id and epoch',async()=>{
 const f=fixture(),errors:unknown[]=[];let mask=0,deadline=0n;
 const actor={...f.actor,epochCommands:true,readiness:async()=>[mask,deadline] as const,
  send:async(action:string,args:readonly unknown[])=>{
   encodeFunctionData({abi:reusableAbi as Abi,functionName:action,args});f.sent.push({action,args});
   if(action==='start'&&!deadline)deadline=130n;
  }};
 const loop=independentEventsLoop(actor,new ChaosBeaconPump({read:async()=>({signature:'0x12'} as any)},()=>1727521080000));
 await loop.progress();assert.deepEqual(f.sent[0],{action:'start',args:[3n,20n]});
 f.clock(131n);await loop.progress();assert.deepEqual(f.sent[1],{action:'cancelUnready',args:[3n,20n]});
 mask=3;await loop.progress();assert.deepEqual(f.sent[2].args,[3n,20n]);
 f.setState({phase:2,chaos:{request:1n,pending:0n} as any});await loop.progress();assert.deepEqual(f.sent[3],{action:'tick',args:[3n,20n]});
 await loop.supply(e=>errors.push(e));await turn();await turn();
 assert.deepEqual(f.sent[4],{action:'submitRandomness',args:[3n,20n,1n,'0x12']});assert.deepEqual(errors,[]);loop.stop();
});

test('publication timestamp jumps cannot bypass the monotonic engine countdown',async()=>{
 const f=fixture();let ticks=1000n;
 const actor={...f.actor,launchClock:async()=>[4000n,ticks] as const};
 const loop=independentEventsLoop(actor);
 await loop.progress();f.clock(110n);await loop.progress();assert.equal(f.sent.length,1);
 ticks=3990n;await loop.progress();assert.equal(f.sent.length,1);
 ticks=4000n;await loop.progress();assert.equal(f.state().phase,2);loop.stop();
});
