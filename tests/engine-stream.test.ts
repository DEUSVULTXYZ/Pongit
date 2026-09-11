import {test} from "node:test";
import assert from "node:assert/strict";
import {encodeAbiParameters,encodeEventTopics,encodeFunctionResult,zeroAddress,zeroHash,type Address,type Hex} from "viem";
import {roomsChaosAbi as abi} from "../shared/abi-PongRoomsTestnet";
import {initial} from "../shared/physics-v2";
import {engineState,engineTuple,mergeEngineFrame,appliedFrame,EngineStream,type EngineFrame,type StreamSocket} from "../shared/engine-stream";
import {EngineFeed,TickPilot} from "../shared/engine-feed";
const app="0x1111111111111111111111111111111111111111",a="0x2222222222222222222222222222222222222222",b="0x3333333333333333333333333333333333333333";
const getter=abi.find(x=>x.type==="function"&&x.name==="getSnapshot")! as any;
const baseline=()=>engineState([1n,5n,2n,a,b,b,zeroAddress,100n,100000n,0n,0n,100000n,{...initial(zeroHash),t:100000n}],1000);
function frame(version=6n,head=110n,phase=2,state={...baseline().state,t:200000n,leftDir:1}):EngineFrame{
 const event={address:app as Address,topics:encodeEventTopics({abi,eventName:"Snapshot",args:{id:1n}}) as Hex[],data:encodeAbiParameters([{type:"uint256"},{type:"uint256"},{type:"bytes"}],[version,BigInt(phase),encodeAbiParameters([getter.outputs.at(-1)],[state])])};
 return {app,hash:`0x${"a".repeat(64)}`,head,logs:[event]};
}
test("applied envelopes reject other apps, failed calls, malformed heads and logs",()=>{
 const v={app,to:app,succeeded:true,hash:zeroHash,blockNumber:100,logs:[]};
 assert(appliedFrame(v,app));assert.equal(appliedFrame({...v,app:a},app),null);assert.equal(appliedFrame({...v,succeeded:undefined},app),null);assert.equal(appliedFrame({...v,blockNumber:NaN},app),null);
});
test("Snapshot advances known clock and physics without guessing nonces",()=>{
 const prior=baseline(),merged=mergeEngineFrame(abi,app,prior,frame(),1020);
 assert.equal(merged.resync,false);assert.equal(merged.state.clock,200000n);assert.equal(merged.state.state.leftDir,1);assert.equal(merged.state.nonceA,0n);
 assert.equal(mergeEngineFrame(abi,app,merged.state,frame()).changed,false);
 assert.equal(mergeEngineFrame(abi,app,prior,frame(7n)).resync,true);
 assert.equal(mergeEngineFrame(abi,app,prior,frame(6n,99n)).resync,true);
 assert.equal(mergeEngineFrame(abi,app,prior,frame(6n,110n,3)).resync,true,"terminal state requires its actual winner event");
});
class Socket implements StreamSocket {
 readyState=1;sent:any[]=[];listeners=new Map<string,((v:any)=>void)[]>();
 addEventListener(type:string,fn:(v:any)=>void){this.listeners.set(type,[...(this.listeners.get(type)||[]),fn]);}
 send(text:string){this.sent.push(JSON.parse(text));}close(){this.readyState=3;this.emit("close",{});}
 emit(type:string,v:any){for(const fn of this.listeners.get(type)||[])fn(v);}
}
test("one subscription serves multiple observers and filters subscription ids",()=>{
 let sockets=0;const socket=new Socket(),stream=new EngineStream("https://node.invalid",app,()=>{sockets++;return socket;});let events=0;
 const off=stream.subscribe(()=>events++),off2=stream.subscribe(()=>events++);socket.emit("open",{});
 socket.emit("message",{data:JSON.stringify({id:1,result:99})});assert(stream.connected);assert.equal(sockets,1);
 const call={app,to:app,hash:zeroHash,succeeded:true,blockNumber:100,logs:[]};
 socket.emit("message",{data:JSON.stringify({params:{subscription:98,result:call}})});assert.equal(events,0);
 socket.emit("message",{data:JSON.stringify({params:{subscription:99,result:call}})});assert.equal(events,2);
 off();assert.equal(socket.readyState,1);off2();assert.equal(socket.readyState,3);
});
test("push plus receipt confirms an input once, without a post-write RPC read",async()=>{
 let reads=0,now=1000;const socket=new Socket(),stream=new EngineStream("https://node.invalid",app,()=>socket);
 const client={app:app as Address,abi,node:{request:async()=>{reads++;return encodeFunctionResult({abi,functionName:"getSnapshot",result:engineTuple(baseline()) as any});}}};
 const feed=new EngineFeed(client,stream,()=>now),off=feed.watch(1n,()=>{});
 socket.emit("open",{});socket.emit("message",{data:JSON.stringify({id:1,result:99})});
 await feed.read(1n);now+=20;const event=frame();feed.apply(event);
 const receipt={status:"0x1",transactionHash:event.hash,blockNumber:"0x6e",logs:event.logs};
 const next=await feed.receipt(1n,{receipt},"input",[1n,1,1n,250n],a);
 assert.equal(next.nonceA,1n);assert.equal(next.nonceB,0n);assert.equal(reads,1);
 await feed.read(1n);assert.equal(reads,1);off();
});
test("backup pilot waits for primary, then ticks at 300 ms; successful inputs suppress ticks",()=>{
 const pilot=new TickPilot(),s=baseline();pilot.observe(s,1000);
 assert(!pilot.due(0,s,1299));assert(pilot.due(0,s,1300));assert(!pilot.due(1,s,1899));assert(pilot.due(1,s,1900));
 const next={...s,state:{...s.state,t:200000n}};pilot.observe(next,1950,true);assert(!pilot.due(1,next,2249));assert(pilot.due(1,next,2250));
 pilot.observe({...s,state:{...s.state,t:300000n}},2300,false);assert(!pilot.due(1,s,2600));
});

test("a completed snapshot needs a matching winner, and another match cannot end this one",()=>{
 const f=frame(6n,110n,3,{...baseline().state,t:200000n,scoreA:7,finished:true});
 const event=abi.find(x=>x.type==="event"&&x.name==="Completed")! as any;
 const args:any={id:1n,room:zeroHash,a,b,winner:a,status:3n,mode:0,ranked:false,scoreA:7,scoreB:0,resultHash:zeroHash};
 const completed={address:app as Address,topics:encodeEventTopics({abi,eventName:"Completed",args}) as Hex[],data:encodeAbiParameters(event.inputs.filter((x:any)=>!x.indexed),event.inputs.filter((x:any)=>!x.indexed).map((x:any)=>args[x.name]))};
 const final=mergeEngineFrame(abi,app,baseline(),{...f,logs:[completed,...f.logs]});
 assert.equal(final.resync,false);assert.equal(final.state.winner,a);assert.equal(final.state.state.scoreA,7);
 assert.equal(mergeEngineFrame(abi,app,{...baseline(),id:2n},f).changed,false);
});

test("a receipt with no matching Snapshot forces recovery instead of confirming guessed metadata",async()=>{
 let reads=0;const stream=new EngineStream("https://node.invalid",app,()=>new Socket());
 const client={app:app as Address,abi,node:{request:async()=>{reads++;return encodeFunctionResult({abi,functionName:"getSnapshot",result:engineTuple(baseline()) as any});}}};
 const feed=new EngineFeed(client,stream);await feed.read(1n);
 const recovered=await feed.receipt(1n,{receipt:{status:"0x1",transactionHash:zeroHash,blockNumber:"0x6e",logs:[]}},"input",[1n,1,1n,250n],a);
 assert.equal(reads,2);assert.equal(recovered.nonceA,0n);
});

test("backup ownership survives its own websocket event arriving before its receipt",()=>{
 const pilot=new TickPilot(),s=baseline();pilot.observe(s,1000);assert(pilot.due(1,s,1900));
 pilot.sending(true);const next={...s,state:{...s.state,t:200000n}};
 pilot.observe(next,1950);pilot.observe(next,1970,true);pilot.sending(false);
 assert(pilot.due(1,next,2250));assert(!pilot.due(1,next,2249));
});

test("a restart is reconciled only after a discontinuity and two consistent full reads",async()=>{
 let now=1000,reads=0,value=baseline();const stream=new EngineStream("https://node.invalid",app,()=>new Socket());
 const client={app:app as Address,abi,node:{request:async()=>{reads++;return encodeFunctionResult({abi,functionName:"getSnapshot",result:engineTuple(value) as any});}}};
 const feed=new EngineFeed(client,stream,()=>now);await feed.read(1n);now+=10001;value={...value,revision:4n,head:90n};
 await assert.rejects(feed.read(1n),/behind/);assert.equal(feed.peek(1n)?.revision,5n);
 feed.invalidate();const reset=await feed.read(1n);assert.equal(reset.revision,4n);assert.equal(reset.reset,true);assert.equal(reads,4);
});

test("replacing a recovered lane retains its arena stream and snapshot",async()=>{
 let opened=0;const socket=new Socket(),stream=new EngineStream('https://node.invalid',app,()=>{opened++;return socket;});
 const client={app:app as Address,abi,node:{request:async()=>encodeFunctionResult({abi,functionName:'getSnapshot',result:engineTuple(baseline()) as any})}};
 const feed=new EngineFeed(client,stream),first=feed.watch(1n,()=>{});
 await feed.read(1n);first();first();const second=feed.watch(1n,()=>{});
 await Promise.resolve();assert.equal(opened,1);assert.equal(socket.readyState,1);assert.equal(feed.peek(1n)?.revision,5n);
 second();await Promise.resolve();assert.equal(socket.readyState,3);assert.equal(feed.peek(1n),undefined);
});

test("a subscribed Chaos pause waits for its event with a ten-second consistency read",async()=>{
 let reads=0,now=1000,value={...baseline(),state:{...baseline().state,mode:1,awaitingServe:true,resumeAt:3000000n}};
 const socket=new Socket(),stream=new EngineStream('https://node.invalid',app,()=>socket);
 const client={app:app as Address,abi,node:{request:async()=>{reads++;return encodeFunctionResult({abi,functionName:'getSnapshot',result:engineTuple(value) as any});}}};
 const feed=new EngineFeed(client,stream,()=>now),off=feed.watch(1n,()=>{});
 socket.emit('open',{});socket.emit('message',{data:JSON.stringify({id:1,result:99})});
 await feed.read(1n);
 for(let i=0;i<19;i++){now+=500;await feed.read(1n);}
 assert.equal(reads,1,'No repeated reads during the betting window');
 now+=500;await feed.read(1n);assert.equal(reads,2);
 feed.apply(frame(6n,400n,2,{...value.state,t:3100000n,awaitingServe:false}));
 assert.equal(feed.peek(1n)?.state.awaitingServe,false,'A rally resume is delivered immediately');
 now+=650;value={...value,revision:6n,head:400n,state:{...value.state,t:3100000n,awaitingServe:false}};
 await feed.read(1n);assert.equal(reads,3,'An active rally still uses the short stale-state limit');
 socket.close();await feed.read(1n);assert.equal(reads,4,'A lost stream forces reconciliation');
 off();await Promise.resolve();
});
