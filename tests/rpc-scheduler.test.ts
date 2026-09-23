import test from "node:test";
import assert from "node:assert/strict";
import {historicalRpcRequest, rpcScheduler, pinnedRpcRequest } from "../relayer/src/rpc-scheduler";

test('canonical UI headers near an observed head are interactive without promoting old or invented future blocks',()=>{
 assert.equal(historicalRpcRequest('eth_getBlockByNumber',['0x3e8',false],1000n),false);
 assert.equal(historicalRpcRequest('eth_getBlockByNumber',['0x3a8',false],1000n),false);
 assert.equal(historicalRpcRequest('eth_getBlockByNumber',['0x3a7',false],1000n),true);
 assert.equal(historicalRpcRequest('eth_getBlockByNumber',['0x3e9',false],1000n),true);
 assert.equal(historicalRpcRequest('eth_getBlockByNumber',['0x3e8',false]),true);
 assert.equal(historicalRpcRequest('eth_getLogs',[{fromBlock:'0x3e8'}],1000n),true);
});

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

test("acceptance and uncertain-command recovery pass queued archive reads within the same upstream budget",async(t)=>{
 t.mock.timers.enable({apis:["Date","setTimeout"],now:1000});
 const s=rpcScheduler(60),seen:Array<{name:string;at:number}>=[];
 const take=(name:string,method:string,params:unknown[])=>s.acquire(historicalRpcRequest(method,params)).then(()=>seen.push({name,at:Date.now()}));
 const jobs=[take("archive-start","eth_getLogs",[{}]),
  ...Array.from({length:20},(_,i)=>take(`archive-${i}`,"eth_getBlockByNumber",[`0x${(1000+i).toString(16)}`,false])),
  take("grant-deadline","eth_getBlockByNumber",["latest",false]),
  take("pending-fee","eth_getBlockByNumber",["pending",false]),
  take("lost-response","eth_getTransactionByHash",["0x1234"]),
  take("receipt","eth_getTransactionReceipt",["0x1234"]),
  take("safe-result","eth_getBlockByNumber",["safe",false])];
 for(let i=0;i<jobs.length;i++){await Promise.resolve();t.mock.timers.tick(60);}
 await Promise.all(jobs);
 assert.deepEqual(seen.slice(0,7).map(v=>v.name),["archive-start","grant-deadline","pending-fee","lost-response","receipt","archive-0","safe-result"]);
 assert(seen.every((v,i)=>i===0 || v.at-seen[i-1].at>=60),"interactive traffic must not bypass upstream pacing");
 assert.deepEqual(s.pending(),{interactive:0,history:0});
});

test("only reads naming a concrete block or closed range may be spread across providers",()=>{
 const hash="0xabababababababababababababababababababababababababababababababab";
 // One answer on every synchronized provider.
 for(const [method,params] of [["eth_call",[{to:"0x01"},"0x10"]],["eth_call",[{to:"0x01"},{blockHash:hash}]],["eth_getCode",["0x01","0x10"]],
  ["eth_getBalance",["0x01","0x10"]],["eth_getStorageAt",["0x01","0x0","0x10"]],["eth_getBlockByNumber",["0x10",false]],["eth_getBlockByHash",[hash,false]],
  ["eth_getLogs",[{fromBlock:"0x10",toBlock:"0x20"}]],["eth_getLogs",[{blockHash:hash}]]] as const)assert.equal(pinnedRpcRequest(method,params as any),true,method);
 // Head-relative, pending, receipt, nonce and write requests could move backwards between providers.
 for(const [method,params] of [["eth_call",[{to:"0x01"},"latest"]],["eth_call",[{to:"0x01"}]],["eth_getBlockByNumber",["latest",false]],
  ["eth_getLogs",[{fromBlock:"0x10",toBlock:"latest"}]],["eth_blockNumber",[]],["eth_getTransactionCount",["0x01","0x10"]],
  ["eth_getTransactionReceipt",[hash]],["eth_sendRawTransaction",["0x02"]],["eth_estimateGas",[{to:"0x01"},"0x10"]]] as const)assert.equal(pinnedRpcRequest(method,params as any),false,method);
});
