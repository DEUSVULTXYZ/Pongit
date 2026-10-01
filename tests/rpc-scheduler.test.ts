import test from "node:test";
import assert from "node:assert/strict";
import {historicalRpcRequest, rpcScheduler, pinnedRpcRequest, rpcBlockObservations } from "../relayer/src/rpc-scheduler";

test('EIP-1898 archive calls retain historical priority after their header was observed',()=>{
 const blocks=rpcBlockObservations(),old=`0x${'ab'.repeat(32)}`,recent=`0x${'cd'.repeat(32)}`;
 blocks.observe('eth_getBlockByNumber',['latest',false],{number:'0x3e8',hash:recent});
 blocks.observe('eth_getBlockByNumber',['0x20',false],{number:'0x20',hash:old});
 assert.equal(blocks.head(),1000n,'An archive header must not move the observed head backwards');
 for(const method of ['eth_call','eth_getBalance','eth_getCode','eth_getStorageAt']){
  const args=(hash:string)=>method==='eth_getStorageAt'?['0x01','0x0',{blockHash:hash,requireCanonical:true}]:['0x01',{blockHash:hash,requireCanonical:true}];
  assert.equal(historicalRpcRequest(method,args(old),blocks.head(),blocks.height),true,method);
  assert.equal(historicalRpcRequest(method,args(recent),blocks.head(),blocks.height),false,method);
  assert.equal(historicalRpcRequest(method,args(`0x${'ef'.repeat(32)}`),blocks.head(),blocks.height),false,'Unknown hashes stay interactive');
 }
 assert.equal(historicalRpcRequest('eth_getBlockByHash',[recent,false],blocks.head(),blocks.height),false);
 assert.equal(historicalRpcRequest('eth_getBlockByHash',[old,false],blocks.head(),blocks.height),true);
});

test('scheduling header observations are bounded, validate identity and retain separate fork hashes',()=>{
 const blocks=rpcBlockObservations(2),hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}`;
 blocks.observe('eth_getBlockByNumber',['latest'],{number:'0x100',hash:hash(1)});
 blocks.observe('eth_getBlockByHash',[hash(2)],{number:'0x10',hash:hash(3)});
 blocks.observe('eth_getBlockByNumber',['0x11'],{number:'0x10',hash:hash(4)});
 blocks.observe('eth_call',[],{number:'0x10',hash:hash(5)});
 assert.equal(blocks.height(hash(3)),undefined);assert.equal(blocks.height(hash(4)),undefined);assert.equal(blocks.height(hash(5)),undefined);
 blocks.observe('eth_getBlockByHash',[hash(2)],{number:'0x10',hash:hash(2)});
 blocks.observe('eth_getBlockByNumber',['0x10'],{number:'0x10',hash:hash(3)});
 assert.equal(blocks.height(hash(1)),undefined,'Oldest observation evicted');
 assert.equal(blocks.height(hash(2)),16n);assert.equal(blocks.height(hash(3)),16n,'Fork replacement retains both identities');
 assert.equal(blocks.head(),256n);
 blocks.observe('eth_blockNumber',[],'0xff');assert.equal(blocks.head(),255n,'A real observed lower head is not concealed');
});

test('pending sponsor and receipt pass old hash-pinned reads without increasing upstream rate',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const blocks=rpcBlockObservations(),hash=`0x${'ab'.repeat(32)}`,queue=rpcScheduler(75),seen:string[]=[];
 blocks.observe('eth_blockNumber',[],'0x1000');blocks.observe('eth_getBlockByHash',[hash],{number:'0x20',hash});
 const take=(name:string,method:string,params:unknown[])=>queue.acquire(historicalRpcRequest(method,params,blocks.head(),blocks.height)).then(()=>seen.push(name));
 const jobs=[...Array.from({length:12},(_,i)=>take(`archive${i}`,'eth_call',[{to:'0x01'},{blockHash:hash,requireCanonical:true}])),
  take('estimate','eth_estimateGas',[{}]),take('receipt','eth_getTransactionReceipt',['0x01'])];
 for(let i=0;i<jobs.length;i++){await Promise.resolve();t.mock.timers.tick(75);}
 await Promise.all(jobs);
 assert.deepEqual(seen.slice(0,3),['archive0','estimate','receipt']);
 assert.equal(seen.filter(v=>v.startsWith('archive')).length,12);assert.equal(queue.spacing(),75);
});

test('upstream choice accounts for priority and cooldown instead of total archive backlog',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const s=rpcScheduler(85);
 await s.acquire(true);
 const history=Array.from({length:8},()=>s.acquire(true));
 assert.equal(s.waitMs(false),85,'interactive work overtakes eight archived reads');
 assert.equal(s.waitMs(true),765,'another archive request keeps its place');
 s.throttle(1000);
 assert.equal(s.waitMs(false),1000,'cooldown applies to every request');
 const live=Array.from({length:5},()=>s.acquire(false));
 assert.equal(s.waitMs(false),1000+6*95,'four live reads then one archive retain fairness');
 t.mock.timers.tick(1000);await Promise.resolve();
 for(let i=0;i<14;i++){t.mock.timers.tick(95);await Promise.resolve();}
 await Promise.all([...history,...live]);
});

test('canonical UI headers near an observed head are interactive without promoting old or invented future blocks',()=>{
 assert.equal(historicalRpcRequest('eth_getBlockByNumber',['0x3e8',false],1000n),false);
 assert.equal(historicalRpcRequest('eth_getBlockByNumber',['0x3a8',false],1000n),false);
 assert.equal(historicalRpcRequest('eth_getBlockByNumber',['0x3a7',false],1000n),true);
 assert.equal(historicalRpcRequest('eth_getBlockByNumber',['0x3e9',false],1000n),true);
 assert.equal(historicalRpcRequest('eth_getBlockByNumber',['0x3e8',false]),true);
 assert.equal(historicalRpcRequest('eth_getLogs',[{fromBlock:'0x3e8'}],1000n),true);
});

test('old contract-state scans share the archive budget while current authorization and nonce reconciliation remain live',()=>{
 for(const method of ['eth_call','eth_getBalance','eth_getCode','eth_getStorageAt']){
  const args=(tag:unknown)=>method==='eth_getStorageAt'?['0x01','0x0',tag]:['0x01',tag];
  assert.equal(historicalRpcRequest(method,args('0x3a7'),1000n),true,method);
  for(const tag of ['0x3a8','0x3e8','0x3e9','latest','pending',{blockHash:'0xabc',requireCanonical:true}])
   assert.equal(historicalRpcRequest(method,args(tag),1000n),false,method);
  assert.equal(historicalRpcRequest(method,args('0x1')),false,'unknown head must not misclassify a current call');
 }
 for(const method of ['eth_getTransactionCount','eth_getTransactionReceipt','eth_estimateGas','eth_sendRawTransaction'])
  assert.equal(historicalRpcRequest(method,['0x01','0x1'],1000n),false,method);
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

test('an upstream throttle holds every queued caller and adapts only that scheduler',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const a=rpcScheduler(50),b=rpcScheduler(85),times:number[]=[];
 await a.acquire(false);a.throttle(2000);
 const one=a.acquire(false).then(()=>times.push(Date.now()));const two=a.acquire(true).then(()=>times.push(Date.now()));
 t.mock.timers.tick(1999);await Promise.resolve();assert.deepEqual(times,[]);
 t.mock.timers.tick(1);await Promise.resolve();assert.deepEqual(times,[3000]);
 t.mock.timers.tick(60);await Promise.all([one,two]);assert.deepEqual(times,[3000,3060]);
 assert.equal(a.spacing(),60);assert.equal(b.spacing(),85);
 t.mock.timers.tick(60000);a.success();assert.equal(a.spacing(),55);a.success();assert.equal(a.spacing(),55);
 t.mock.timers.tick(60000);a.success();assert.equal(a.spacing(),50);
});
