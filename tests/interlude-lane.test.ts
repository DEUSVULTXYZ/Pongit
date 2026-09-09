import {test} from "node:test";
import assert from "node:assert/strict";
import {LabLane,type LabSession,type LabSnapshot} from "../web/lib/interlude-lab";
import {initial} from "../shared/physics-v2";
import {zeroAddress,zeroHash} from "viem";
import {AppRevertError} from "@interludelayer-sdk/sdk";
const a="0x1111111111111111111111111111111111111111",b="0x2222222222222222222222222222222222222222";
function fixture(){
 let s:LabSnapshot={id:1n,revision:1n,phase:2,a,b,target:zeroAddress,winner:zeroAddress,head:100n,clock:0n,nonceA:0n,nonceB:0n,deadline:10000n,state:initial(zeroHash),observedAt:0};
 const sent:{name:string;args:readonly unknown[]}[]=[];let reject=false,wait:Promise<void>=Promise.resolve(),errorCount=0;
 const session={send:async(name:string,args:readonly unknown[])=>{sent.push({name,args});await wait;if(reject)throw new Error("Transport lost after submission");if(name==="input"){assert.equal(args[2],s.nonceA+1n);s={...s,nonceA:s.nonceA+1n,state:{...s.state,leftDir:Number(args[1])}};}if(name==="concede")s={...s,phase:3};return {latencyMs:30};}} as unknown as LabSession;
 let override:((s:LabSnapshot)=>LabSnapshot)|undefined;
 const lane=new LabLane(async()=>override?override(s):s,session,a,()=>{},()=>errorCount++);
 return {lane,sent,state:()=>s,set:(v:Partial<LabSnapshot>)=>s={...s,...v},hold:(p:Promise<void>)=>wait=p,fail:()=>reject=true,errors:()=>errorCount,readWith:(fn?:typeof override)=>override=fn};
}
test("Interlude sends the latest release after an in-flight direction, with sequential nonces",async()=>{
 const f=fixture();let release!:()=>void;f.hold(new Promise(r=>release=r));f.lane.intent(-1);const first=f.lane.pump(false);await new Promise(r=>setTimeout(r,0));
 f.lane.intent(1);f.lane.intent(0);await f.lane.pump(false);assert.equal(f.sent.length,1);release();await first;
 assert.equal(f.sent.length,2,"release drains without waiting for another timer pump");await f.lane.pump(false);
 assert.deepEqual(f.sent.map(x=>x.args[1]),[-1,0]);assert.deepEqual(f.sent.map(x=>x.args[2]),[1n,2n]);
});

test("a failed read after an accepted input preserves the grant and never resubmits that input",async()=>{
 const f=fixture();let reads=0;
 f.readWith(s=>{if(++reads===2)throw new Error("RPC read timeout");return s;});
 f.lane.intent(1);await f.lane.pump(false);
 assert.equal(f.sent.length,1);assert.equal(f.state().nonceA,1n);assert.equal(f.lane.stopped,false);assert.equal(f.errors(),0);
 await f.lane.pump(true);assert.equal(f.sent.length,1,"failed reads back off instead of hammering the node");
 await new Promise(r=>setTimeout(r,260));await f.lane.pump(false);
 assert.deepEqual(f.sent.map(x=>[x.args[1],x.args[2]]),[[1,1n],[0,2n]],"resume with a release, not the stale direction");
});

test("a stale read after an accepted input waits for its nonce before sending another command",async()=>{
 const f=fixture();let reads=0;
 f.readWith(s=>++reads===2?{...s,nonceA:0n,state:{...s.state,leftDir:0}}:s);
 f.lane.intent(1);await f.lane.pump(false);
 assert.equal(f.sent.length,1);assert.equal(f.lane.stopped,false);
 await new Promise(r=>setTimeout(r,260));await f.lane.pump(false);
 assert.deepEqual(f.sent.map(x=>x.args[2]),[1n,2n]);assert.equal(f.errors(),0);
});

test("an accepted action with a failed observation cannot be double clicked or revoke the grant",async()=>{
 const f=fixture();f.readWith(()=>{throw new Error("read unavailable");});
 await assert.rejects(f.lane.action("concede",[1n]),/Waiting for the game state/);
 await assert.rejects(f.lane.action("concede",[1n]),/Waiting for the game state/);
 assert.equal(f.sent.length,1);assert.equal(f.lane.stopped,false);assert.equal(f.errors(),0);
 f.set({phase:3});f.readWith();await new Promise(r=>setTimeout(r,260));await f.lane.pump(false);
 assert.equal(f.sent.length,1);assert.equal(f.lane.stopped,false);
});

test("an unavailable preflight read sends nothing and recovers without a new session",async()=>{
 const f=fixture();f.readWith(()=>{throw new Error("gateway unavailable");});
 f.lane.intent(1);await f.lane.pump(true);assert.equal(f.sent.length,0);assert.equal(f.lane.stopped,false);
 f.readWith();await new Promise(r=>setTimeout(r,260));await f.lane.pump(false);
 assert.equal(f.sent.length,0);assert.equal(f.errors(),0);
});
test("Interlude freezes on uncertain submission without retrying or advancing a second input",async()=>{
 const f=fixture();f.fail();f.lane.intent(1);await f.lane.pump(false);await f.lane.pump(true);
 assert.equal(f.sent.length,1);assert.equal(f.errors(),1);assert.equal(f.lane.stopped,true);await assert.rejects(f.lane.action("concede",[1n]));
});
test("Interlude actions wait for the single writer, suppress duplicate clicks and preempt ticks",async()=>{
 const f=fixture();let release!:()=>void;f.hold(new Promise(r=>release=r));f.lane.intent(-1);const first=f.lane.pump(false);await new Promise(r=>setTimeout(r,0));
 const action=f.lane.action("concede",[1n]);await assert.rejects(f.lane.action("concede",[1n]));await f.lane.pump(true);release();await first;await action;
 assert.deepEqual(f.sent.map(x=>x.name),["input","concede"]);
});
test("Interlude spectator and completed state never send an input or idle tick",async()=>{
 const f=fixture();f.set({phase:3});f.lane.intent(1);await f.lane.pump(true);f.set({phase:2,a:b});await f.lane.pump(true);assert.equal(f.sent.length,0);
});
test("a rival's seventh point does not invalidate the session when the last tick races it",async()=>{
 const f=fixture();let release!:()=>void;f.hold(new Promise(r=>release=r));f.fail();
 const pending=f.lane.pump(true);await new Promise(r=>setTimeout(r,0));
 f.set({phase:3,winner:b,state:{...f.state().state,scoreB:7,finished:true}});release();await pending;
 assert.equal(f.lane.stopped,false);assert.equal(f.errors(),0);assert.equal(f.sent.length,1);
 assert.equal(f.lane.inputPending,false);assert.equal(f.lane.desired,0);
});

test("a reverted final tick waits through a read outage and observes the seventh point without another write",async()=>{
 const f=fixture();let now=1000,reads=0,send=0,terminal:LabSnapshot|undefined,errors=0;
 const lane=new LabLane(async()=>{reads++;if(reads===2)throw new Error("late read");return f.state();},
  {send:async()=>{send++;throw new AppRevertError("InvalidMatch",[],"0x");}} as unknown as LabSession,
  a,s=>{if(s.phase===3)terminal=s;},()=>errors++,()=>{},{readMs:250,tickMs:300,now:()=>now});
 await lane.pump(true);assert.equal(lane.stopped,false);assert.equal(errors,0);
 now+=260;await lane.pump(true);assert.equal(send,1);assert.equal(lane.stopped,false);
 f.set({phase:3,winner:b,state:{...f.state().state,scoreB:7,finished:true}});
 now+=260;await lane.pump(true);
 assert.equal(terminal?.phase,3);assert.equal(send,1);assert.equal(errors,0);
});

test("idle RPC traffic is paced while release and reversal bypass the idle cadence",async()=>{
 const f=fixture();let now=1000,reads=0;
 const session={send:async(name:string,args:readonly unknown[])=>{
  f.sent.push({name,args});if(name==="input")f.set({nonceA:BigInt(args[2] as bigint),state:{...f.state().state,leftDir:Number(args[1])}});
  return {latencyMs:20};
 }} as unknown as LabSession;
 const lane=new LabLane(async()=>{reads++;return f.state();},session,a,()=>{},()=>{},()=>{},{readMs:250,tickMs:300,now:()=>now});
 for(let i=0;i<10;i++){await lane.pump(true);now+=100;}
 assert.equal(f.sent.length,4);assert.equal(reads,8,"one observation and one post-write read per idle tick");
 lane.intent(-1);await lane.pump(false);
 lane.intent(0);await lane.pump(false);
 assert.deepEqual(f.sent.slice(-2).map(x=>[x.args[1],x.args[2]]),[[-1,1n],[0,2n]]);
});
