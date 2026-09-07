import {test} from "node:test";
import assert from "node:assert/strict";
import {LabLane,type LabSession,type LabSnapshot} from "../web/lib/interlude-lab";
import {initial} from "../shared/physics-v2";
import {zeroAddress,zeroHash} from "viem";
const a="0x1111111111111111111111111111111111111111",b="0x2222222222222222222222222222222222222222";
function fixture(){
 let s:LabSnapshot={id:1n,revision:1n,phase:2,a,b,target:zeroAddress,winner:zeroAddress,head:100n,clock:0n,nonceA:0n,nonceB:0n,deadline:10000n,state:initial(zeroHash),observedAt:0};
 const sent:{name:string;args:readonly unknown[]}[]=[];let reject=false,wait:Promise<void>=Promise.resolve(),errorCount=0;
 const session={send:async(name:string,args:readonly unknown[])=>{sent.push({name,args});await wait;if(reject)throw new Error("Transport lost after submission");if(name==="input"){assert.equal(args[2],s.nonceA+1n);s={...s,nonceA:s.nonceA+1n,state:{...s.state,leftDir:Number(args[1])}};}return {latencyMs:30};}} as unknown as LabSession;
 const lane=new LabLane(async()=>s,session,a,()=>{},()=>errorCount++);
 return {lane,sent,state:()=>s,set:(v:Partial<LabSnapshot>)=>s={...s,...v},hold:(p:Promise<void>)=>wait=p,fail:()=>reject=true,errors:()=>errorCount};
}
test("Interlude sends the latest release after an in-flight direction, with sequential nonces",async()=>{
 const f=fixture();let release!:()=>void;f.hold(new Promise(r=>release=r));f.lane.intent(-1);const first=f.lane.pump(false);await new Promise(r=>setTimeout(r,0));
 f.lane.intent(1);f.lane.intent(0);await f.lane.pump(false);assert.equal(f.sent.length,1);release();await first;
 assert.equal(f.sent.length,2,"release drains without waiting for another timer pump");await f.lane.pump(false);
 assert.deepEqual(f.sent.map(x=>x.args[1]),[-1,0]);assert.deepEqual(f.sent.map(x=>x.args[2]),[1n,2n]);
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
