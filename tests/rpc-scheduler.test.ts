import test from "node:test";
import assert from "node:assert/strict";
import {rpcScheduler} from "../relayer/src/rpc-scheduler";

test("gameplay jumps ahead of backfill without starving history or bypassing the shared rate",async()=>{
 const s=rpcScheduler(10),order:string[]=[],times:number[]=[];
 const take=(name:string,low:boolean)=>s.acquire(low).then(()=>{order.push(name);times.push(Date.now());});
 const jobs=[take("history0",true),...Array.from({length:5},(_,i)=>take(`history${i+1}`,true)),...Array.from({length:8},(_,i)=>take(`live${i}`,false))];
 await Promise.all(jobs);
 assert.equal(order[1],"live0");assert.equal(order[5],"history1");
 assert(times.every((t,i)=>i===0 || t-times[i-1]>=8));
 assert.deepEqual(s.pending(),{interactive:0,history:0});
});
