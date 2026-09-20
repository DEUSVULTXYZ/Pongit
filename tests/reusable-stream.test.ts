import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics,encodeFunctionResult,zeroAddress,zeroHash,type Abi,type Address,type Hex} from 'viem';
import {reusableAgentArenaAbi} from '../shared/abi-ReusableAgentArena';
import {abi as humanAbi} from '../shared/abi-independent-ReusableEventsArena';
import {initial} from '../shared/physics-v2';
import {snapshotHeaderFields} from '../shared/chaos-codec';
import {engineState,mergeEngineFrame,EngineStream,type EngineFrame} from '../shared/engine-stream';
import {EngineFeed} from '../shared/engine-feed';
const app='0x1111111111111111111111111111111111111111',a='0x2222222222222222222222222222222222222222',b='0x3333333333333333333333333333333333333333';
const header=()=>({id:99n,revision:5n,phase:2n,a,b,target:b,winner:zeroAddress,head:100n,clock:100000n,nonceA:0n,nonceB:0n,deadline:100000n,state:{...initial(zeroHash),t:100000n}});
function log(abi:Abi,name:string,args:any){
 const e=abi.find(x=>x.type==='event'&&x.name===name) as any;assert(e,`Missing linked event ${name}`);
 return {address:app as Address,topics:encodeEventTopics({abi,eventName:name,args} as any) as Hex[],data:encodeAbiParameters(e.inputs.filter((x:any)=>!x.indexed),e.inputs.filter((x:any)=>!x.indexed).map((x:any)=>args[x.name]))};
}
const frame=(logs:EngineFrame['logs']):EngineFrame=>({app,hash:zeroHash,head:110n,logs});
for(const [name,abi] of [['human',humanAbi],['agent',reusableAgentArenaAbi]] as const){
 test(`${name} linked snapshots confirm the logical match nonce without another read`,async()=>{
  let reads=0;const h=header(),fields=snapshotHeaderFields(abi);
  const raw=encodeAbiParameters([{type:'tuple',components:fields},{type:'uint256[8]'},{type:'uint256'},{type:'uint256'}],[Object.values(h),[0n,0n,0n,0n,0n,0n,0n,0n],0n,0n]);
  const client={app:app as Address,abi,node:{request:async()=>{reads++;return encodeFunctionResult({abi,functionName:'chaosState',result:raw});}}};
  const feed=new EngineFeed(client,new EngineStream('https://invalid',app));await feed.read(99n);
  const event=frame([log(abi,'Snapshot',{id:99n,version:6n,status:2n,state:encodeAbiParameters([fields[12]],[{...h.state,leftDir:1,t:200000n}])})]);
  const next=await feed.receipt(99n,{receipt:{status:'0x1',transactionHash:event.hash,blockNumber:'0x6e',logs:event.logs}},'input',[7n,99n,1,3n,250n],a);
  assert.equal(next.nonceA,3n);assert.equal(next.nonceB,0n);assert.equal(next.state.leftDir,1);assert.equal(reads,1);
  const unrelated=await feed.receipt(99n,{receipt:{status:'0x1',transactionHash:event.hash,blockNumber:'0x6e',logs:event.logs}},'input',[7n,88n,1,8n,250n],a);
  assert.equal(unrelated.nonceA,3n);
 });
 test(`${name} nested completion carries the real winner and rejects another match`,()=>{
  const h=header(),state={...h.state,t:200000n,scoreA:7,finished:true};
  const match:any=name==='human'?{arena:app,epoch:7n,id:99n,a,b,winner:a,mode:0,ranked:false,status:3,scoreA:7,scoreB:0,hash:zeroHash}:
   {ref:{chainId:10143n,arena:app,epoch:7n,id:99n},a,b,winner:a,mode:0,status:3,scoreA:7,scoreB:0,hash:zeroHash,elapsedUs:200000n,finality:false};
  const complete=(r:any)=>log(abi,'Completed',{epoch:7n,id:99n,result:{match_:r,elapsedUs:200000n,finishedAt:100n,rules:name==='human'?14n:15n,brainA:0n,brainB:0n}});
  const snapshot=log(abi,'Snapshot',{id:99n,version:6n,status:3n,state:encodeAbiParameters([snapshotHeaderFields(abi)[12]],[state])});
  const previous=engineState(Object.values(h));
  const next=mergeEngineFrame(abi,app,previous,frame([complete(match),snapshot]));
  assert.equal(next.resync,false);assert.equal(next.state.winner,a);assert.equal(next.state.state.scoreA,7);
  for(const bad of [{...match,a:b},{...match,scoreA:6},{...match,winner:app},name==='human'?{...match,id:100n}:{...match,ref:{...match.ref,id:100n}}])
   assert.equal(mergeEngineFrame(abi,app,previous,frame([complete(bad),snapshot])).resync,true);
 });
}
