import {test} from 'node:test';import assert from 'node:assert/strict';
import {zeroAddress,zeroHash,type Address,type PublicClient} from 'viem';
import {createPoolObserver} from '../shared/agent-pool-observer';
import {AgentPoolReader} from '../relayer/src/agents/pool-read';
import type {AgentPoolManifest,PoolMatchView} from '../shared/agent-pool';
const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const m:AgentPoolManifest={version:2,chainId:10143,engineChainId:4242,rulesVersion:10,hub:addr(1),pool:addr(2),catalog:addr(3),tournaments:addr(4),ratings:addr(5),challenges:addr(6),qualifications:addr(7),family:addr(8),arenas:[9,10,11].map(n=>({app:addr(n),node:`https://arena-${n}.example`,runtimeHash:zeroHash})),enabled:false,tournamentsEnabled:false,verifiedCapacity:0,qualificationEvidence:null,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
const match:PoolMatchView={ref:{chainId:10143,app:addr(9),epoch:'1',id:'4'},a:addr(20),b:addr(21),mode:0,ranked:false,tournament:'0',lane:1,node:m.arenas[0].node,currentBinding:true,regulationSeconds:300,overtimeSeconds:0,result:null};

test('spectator checks app, epoch, chain and rules without a signing account or ticks',async()=>{
 let app=addr(9),epoch=1,chainId=4242,rules=10n,otherPlayer=false;const methods:string[]=[];
 const node:any={request:async(r:any)=>{methods.push(r.method);assert.equal(r.method,'interlude_session');return{app,epoch,chainId};},readContract:async()=>rules};
 const feed:any={read:async()=>({id:4n,a:otherPlayer?addr(30):match.a,b:match.b}),watch:()=>()=>{},invalidate(){}};
 const runtime={node,feed},socket=()=>{throw Error('No WebSocket expected in this test');};
 for(const wrong of ['app','epoch','chain','rules']){
  app=wrong==='app'?addr(10):addr(9);epoch=wrong==='epoch'?2:1;chainId=wrong==='chain'?10143:4242;rules=wrong==='rules'?7n:10n;
  await assert.rejects(createPoolObserver(m,match,socket,runtime));
 }
 app=addr(9);epoch=1;chainId=4242;rules=10n;const observer=await createPoolObserver(m,match,socket,runtime);
 assert.equal((await observer.read()).id,4n);otherPlayer=true;await assert.rejects(observer.read(),/another match/);
 observer.close();await assert.rejects(observer.read(),/stopped/);assert(methods.every(x=>x==='interlude_session'));
});

test('archived match returns its own result and no live node after the arena is reused',async()=>{
 const result={ref:{chainId:10143n,arena:addr(9),epoch:1n,id:4n},a:match.a,b:match.b,mode:0,status:3,hash:zeroHash,winner:match.a,scoreA:7,scoreB:2,elapsedUs:90_000_000n,finality:true};
 let captured=true;
 const client={getBlock:async()=>({number:50n,hash:zeroHash,timestamp:1000n}),readContract:async(r:any)=>{
  if(r.functionName==='record')return{ref:result.ref,a:match.a,b:match.b,tournament:0n,lane:1,ranked:false,captured};
  if(r.functionName==='boundMatch')return{id:8n,epoch:2n,mode:1};
  if(r.functionName==='result')return result;throw Error(r.functionName);
 }} as unknown as PublicClient;
 const reader=new AgentPoolReader(client,m),view=(await reader.match(match.ref)).value;
 assert.equal(view.node,null);assert.equal(view.result?.scoreA,7);assert.equal(view.currentBinding,false);assert.equal(view.mode,0);
 await assert.rejects(createPoolObserver(m,view,()=>{throw Error('must not connect');}),/published summary/);
 await assert.rejects(reader.match({...match.ref,id:'8'}),/not found/);
 await assert.rejects(reader.match({...match.ref,app:zeroAddress}),/not found/);
 captured=false;await assert.rejects(reader.match(match.ref),/no verified result/);
});
test('series spectator validates rules 11 and stays bound to its original game ID',async()=>{
 const manifest={...m,version:3 as const,rulesVersion:11 as const};let id=4n;
 const runtime:any={node:{request:async()=>({app:addr(9),epoch:1,chainId:4242}),readContract:async()=>11n},
  feed:{read:async()=>({id,a:match.a,b:match.b}),watch:()=>()=>{},invalidate(){}}};
 const socket=()=>{throw Error('No fixture WebSocket');};
 await assert.rejects(createPoolObserver(m,match,socket,runtime),/Unsupported agent arena rules/);
 const observer=await createPoolObserver(manifest,match,socket,runtime);assert.equal((await observer.read()).id,4n);
 id=5n;await assert.rejects(observer.read(),/another match/);observer.close();
});
