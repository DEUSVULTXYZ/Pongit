import test from "node:test";
import assert from "node:assert/strict";
import {rpcScheduler} from "../relayer/src/rpc-scheduler";

test("gameplay jumps ahead of backfill without starving history or bypassing the shared rate",async(t)=>{
 // The queue must be populated before time advances. A throttled CI worker can
 // otherwise spend more than 10 ms merely scheduling the fixture's promises.
 t.mock.timers.enable({apis:["Date","setTimeout"],now:1000});
 const s=rpcScheduler(10),order:string[]=[],times:number[]=[];
 const take=(name:string,low:boolean)=>s.acquire(low).then(()=>{order.push(name);times.push(Date.now());});
 const jobs=[take("history0",true),...Array.from({length:5},(_,i)=>take(`history${i+1}`,true)),...Array.from({length:8},(_,i)=>take(`live${i}`,false))];
 for(let i=0;i<jobs.length;i++){await Promise.resolve();t.mock.timers.tick(10);}
 await Promise.all(jobs);
 assert.equal(order[1],"live0");assert.equal(order[5],"history1");
 assert(times.every((t,i)=>i===0 || t-times[i-1]>=8));
 assert.deepEqual(s.pending(),{interactive:0,history:0});
});
