import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeFunctionResult,encodeEventTopics,zeroHash,zeroAddress,type Hex,type Address} from 'viem';
import {synchronizedAgentArenaAbi as abi} from '../shared/abi-SynchronizedAgentArena';
import {decodeEngineSnapshot} from '../shared/engine-snapshot';
import {snapshotHeaderFields} from '../shared/chaos-codec';
import {pauseFields,queuedDirections,type AgentSynchronization} from '../shared/agent-synchronization';
import {initial} from '../shared/physics-v2';
import {engineState,mergeEngineFrame,type EngineState} from '../shared/engine-stream';
import {EngineFeed} from '../shared/engine-feed';
import {EngineStream} from '../shared/engine-stream';
const app='0x1111111111111111111111111111111111111111' as Address;
function baseline():EngineState{return engineState([1n,5n,2n,app,zeroAddress,zeroAddress,zeroAddress,100n,500000n,0n,0n,1000n,{...initial(zeroHash),t:500000n}],1000);}
const sync:AgentSynchronization={pause:{status:2,human:1,limitUs:500000n,deadlineBlock:50n,cancelBlock:3050n,resumeBlock:0n},
 brainA:0n,brainB:123n,decision:6n,pendingControls:0n,controllers:256n};
function log(name:string,args:any){const event=abi.find(x=>x.type==='event'&&x.name===name) as any;
 return {address:app,topics:encodeEventTopics({abi,eventName:name,args} as any) as Hex[],data:encodeAbiParameters(event.inputs.filter((x:any)=>!x.indexed),event.inputs.filter((x:any)=>!x.indexed).map((x:any)=>args[x.name]))};}
function frame(s:AgentSynchronization,clock=500000n,version=6n){return {app,hash:zeroHash,head:500n,logs:[
 log('Snapshot',{id:1n,version,status:2n,state:encodeAbiParameters([snapshotHeaderFields(abi)[12]],[baseline().state])}),
 log('Synchronization',{id:1n,version,...s,clock}),
]};}
test('atomic rules16 reads bind physics and controls to the same paused clock without a second RPC',()=>{
 const b=baseline(),fields=snapshotHeaderFields(abi),header=Object.fromEntries(fields.map(f=>[f.name!,(b as any)[f.name!]]));
 const bytes=encodeAbiParameters([{type:'tuple',components:fields},{type:'uint256[8]'},{type:'uint256'},{type:'uint256'},
  {type:'tuple',components:pauseFields},...Array(5).fill({type:'uint256'})],
  [header,Array(8).fill(0n),0n,0n,sync.pause,sync.brainA,sync.brainB,sync.decision,sync.pendingControls,sync.controllers]);
 const data=encodeFunctionResult({abi,functionName:'synchronizedState',result:bytes});
 const decoded=engineState(decodeEngineSnapshot(abi,app,1n,data));
 assert.equal(decoded.clock,500000n);assert.equal(decoded.state.t,500000n);assert.equal(decoded.chaos,undefined);assert.deepEqual(decoded.sync,sync);
});
test('pause and resume events keep countdown wall time out of the physical clock',()=>{
 const prior={...baseline(),sync},countdown={...sync,pause:{...sync.pause,status:3,resumeBlock:800n}};
 const paused=mergeEngineFrame(abi,app,prior,frame(countdown));assert.equal(paused.resync,false);
 assert.equal(paused.state.clock,500000n);assert.equal(paused.state.sync?.pause.resumeBlock,800n);
 const resumed={...sync,pause:{status:1,human:1,limitUs:1000000n,deadlineBlock:850n,cancelBlock:0n,resumeBlock:0n}};
 const next={...frame(resumed,500000n,7n),head:800n};
 const result=mergeEngineFrame(abi,app,paused.state,next);assert.equal(result.resync,false);
 assert.equal(result.state.clock,500000n,'3-second countdown is never catch-up time');
});
test('missing or mismatched synchronization causes a full read, not guessed controls',()=>{
 const prior={...baseline(),sync},f=frame(sync);
 assert(mergeEngineFrame(abi,app,prior,{...f,logs:f.logs.slice(0,1)}).resync);
 assert(mergeEngineFrame(abi,app,prior,{...f,logs:[f.logs[0],frame(sync,500000n,7n).logs[1]]}).resync);
 assert(mergeEngineFrame(abi,app,prior,frame({...sync,controllers:9n})).resync);
});
test('queued controls preserve each seat and accepted physical time',()=>{
 const word=100000n|(1n<<32n)|(250000n<<35n)|(3n<<67n);
 assert.deepEqual(queuedDirections(word),[{side:0,direction:-1,at:100000n},{side:1,direction:1,at:250000n}]);
});

test('a complete friendly Classic receipt bridges intervening ticks, but not an incomplete checkpoint',()=>{
 const prior={...baseline(),sync},f=frame(sync,500000n,8n);
 assert.equal(mergeEngineFrame(abi,app,prior,f,1000,true).resync,false);
 assert.equal(mergeEngineFrame(abi,app,prior,f).resync,true,'ordinary stream gaps remain strict');
 for(const [before,event] of [
  [{...prior,phase:1},f], [{...prior,chaos:{}},f], [{...prior,sync:undefined},f],
  [prior,{...f,head:99n}], [prior,{...f,logs:f.logs.slice(0,1)}],
  [prior,frame(sync,500000n,14n)], [prior,frame({...sync,controllers:512n},500000n,8n)],
  [prior,frame({...sync,controllers:9n},500000n,8n)],
 ]as const)assert(mergeEngineFrame(abi,app,before as EngineState,event,1000,true).resync);
});

test('own Classic receipt avoids the redundant full read, while a disconnect still requires it',async()=>{
 const prior={...baseline(),sync},fields=snapshotHeaderFields(abi),header=Object.fromEntries(fields.map(f=>[f.name!,(prior as any)[f.name!]]));
 const bytes=encodeAbiParameters([{type:'tuple',components:fields},{type:'uint256[8]'},{type:'uint256'},{type:'uint256'},
  {type:'tuple',components:pauseFields},...Array(5).fill({type:'uint256'})],
  [header,Array(8).fill(0n),0n,0n,sync.pause,sync.brainA,sync.brainB,sync.decision,sync.pendingControls,sync.controllers]);
 const encoded=encodeFunctionResult({abi,functionName:'synchronizedState',result:bytes});
 for(const disconnected of [false,true]){
  let reads=0;const feed=new EngineFeed({app,abi,node:{request:async()=>{reads++;if(reads>1)throw Error('Full observation required');return encoded;}}},new EngineStream('https://unused.invalid',app));
  await feed.read(1n);if(disconnected)feed.invalidate();
  const f=frame(sync,500000n,8n),receipt={status:'0x1',transactionHash:zeroHash,blockNumber:'0x1f4',logs:f.logs};
  const next=feed.receipt(1n,{receipt},'input',[1n,1n,1,7n,1000n],app);
  if(disconnected){await assert.rejects(next,/Full observation required/);assert.equal(reads,2);}
  else{const s=await next;assert.equal(reads,1);assert.equal(s.revision,8n);assert.equal(s.nonceA,7n);assert.equal(s.nonceB,0n);assert.deepEqual(s.sync,sync);}
 }
});
