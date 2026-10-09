import test from "node:test";
import assert from "node:assert/strict";
import {historicalRpcRequest, transactionRpcRequest, submissionRpcRequest, controlRpcRequest, fenceRpcRequest, foregroundRpcRequest, rpcScheduler, pinnedRpcRequest, rpcBlockObservations } from "../relayer/src/rpc-scheduler";
import {encodeFunctionData,multicall3Abi,zeroHash} from 'viem';
import {roomsLifecycleHubAbi} from '../shared/abi-rooms-lifecycle';
import {reusableAgentPoolAbi} from '../shared/abi-ReusableAgentPool';

test('four gameplay authorizations do not expire behind concurrent admission headers and transactions',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 for(const spacing of [75,85]){
  const queue=rpcScheduler(spacing),seen:Array<{kind:string;at:number}>=[];
  await queue.acquire(false);
  const start=Date.now(),take=(kind:string)=>queue.acquire(kind==='history',kind==='control',kind==='foreground',kind==='transaction',kind==='fence')
   .then(()=>seen.push({kind,at:Date.now()}));
  const jobs=[...Array.from({length:24},()=>take('control')),...Array.from({length:12},()=>take('transaction')),
   ...Array.from({length:8},()=>take('foreground')),...Array.from({length:8},()=>take('live')),...Array.from({length:8},()=>take('history'))];
  const estimate=queue.waitMs(false,false,false,false,true);
  jobs.push(...Array.from({length:4},()=>take('fence')));
  for(let i=0;i<jobs.length;i++){t.mock.timers.tick(spacing);await Promise.resolve();}
  await Promise.all(jobs);
  const fences=seen.filter(x=>x.kind==='fence');
  assert.equal(fences[0].at-start,estimate);
  assert(fences.at(-1)!.at-start<=8*spacing,'Four current gameplay fences must finish within the existing prefetch margin');
  assert(seen.every((x,i)=>!i||x.at-seen[i-1].at===spacing),'Priority must not increase upstream throughput');
  for(const kind of ['control','transaction','foreground','live','history'])assert(seen.some(x=>x.kind===kind));
  assert.deepEqual(queue.pending(),{interactive:0,history:0});
 }
});

test('gameplay priority recognizes only exact current hub fences and bounded canonical batches',()=>{
 const hub='0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e',app=`0x${'12'.repeat(20)}` as const,hash=`0x${'34'.repeat(32)}`;
 const data=encodeFunctionData({abi:roomsLifecycleHubAbi,functionName:'delegationOf',args:[app,zeroHash]});
 const qualifies=(method:string,params:unknown[])=>fenceRpcRequest(method,params,1000n,h=>h===hash?1000n:undefined);
 for(const tag of ['latest','pending','0x3e8',{blockHash:hash,requireCanonical:true}])assert(qualifies('eth_call',[{to:hub,data},tag]));
 for(const params of [[{to:app,data},'latest'],[{to:hub,data},'0x3a7'],[{to:hub,data},'0x3e9'],[{to:hub,data},'latest',{}],
  [{to:hub,data:data+'00'},'latest'],[{to:hub,data:'0xdeadbeef'},'latest'],[{to:hub,data},{blockHash:`0x${'56'.repeat(32)}`}],
 ])assert(!qualifies('eth_call',params));
 for(const method of ['eth_getTransactionReceipt','eth_getBlockByNumber','eth_blockNumber','eth_estimateGas'])assert(!qualifies(method,['latest']));
 const calls:Array<{target:`0x${string}`;allowFailure:boolean;callData:`0x${string}`}>= [{target:hub,allowFailure:true,callData:data},{target:app,allowFailure:true,callData:encodeFunctionData({abi:reusableAgentPoolAbi,functionName:'laneRecord',args:[0]})}];
 const aggregate=(items:typeof calls)=>({to:'0xcA11bde05977b3631167028862bE2a173976CA11',data:encodeFunctionData({abi:multicall3Abi,functionName:'aggregate3',args:[items]})});
 assert(qualifies('eth_call',[aggregate(calls),{blockHash:hash,requireCanonical:true}]));
 assert(!qualifies('eth_call',[aggregate(calls.slice(1)),'latest']));
 assert(!qualifies('eth_call',[aggregate([...calls,{...calls[0],target:app}]),'latest']));
});

test('sustained gameplay fences retain all queue shares, dispatch estimates and provider cooldowns',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const kinds=['fence','transaction','control','foreground','live','history'] as const;
 for(const target of kinds){
  const q=rpcScheduler(75),seen:{kind:string;at:number}[]=[];
  await q.acquire(false);q.throttle(1000);const start=Date.now();
  const flags=(kind:typeof kinds[number])=>[kind==='history',kind==='control',kind==='foreground',kind==='transaction',kind==='fence'] as const;
  const take=(kind:typeof kinds[number])=>q.acquire(...flags(kind)).then(()=>seen.push({kind,at:Date.now()}));
  const jobs=kinds.flatMap(kind=>Array.from({length:24},()=>take(kind)));
  const expected=start+q.waitMs(...flags(target));jobs.push(take(target));
  t.mock.timers.tick(999);await Promise.resolve();assert.equal(seen.length,0);
  t.mock.timers.tick(1);await Promise.resolve();
  for(let i=1;i<jobs.length;i++){t.mock.timers.tick(85);await Promise.resolve();}
  await Promise.all(jobs);
  assert.equal(seen.filter(x=>x.kind===target).at(-1)!.at,expected);
  for(const kind of kinds)assert(seen.slice(0,24).some(x=>x.kind===kind),`${kind} must not starve`);
  assert(seen.every((x,i)=>!i||x.at-seen[i-1].at===85));
  assert.equal(seen[0].at-start,1000);
 }
});

test('the current atomic arena planning fence overtakes catalogue reads without promoting arbitrary multicalls',()=>{
 const hub='0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e',pool='0x1111111111111111111111111111111111111111';
 const root={target:hub,allowFailure:true,callData:encodeFunctionData({abi:roomsLifecycleHubAbi,functionName:'delegationOf',args:[pool,zeroHash]})};
 const lane={target:pool,allowFailure:true,callData:encodeFunctionData({abi:reusableAgentPoolAbi,functionName:'laneRecord',args:[0]})};
 const call=(calls:any[])=>({to:'0xcA11bde05977b3631167028862bE2a173976CA11',data:encodeFunctionData({abi:multicall3Abi,functionName:'aggregate3',args:[calls]})});
 const canonical=`0x${'ab'.repeat(32)}`,tag={blockHash:canonical,requireCanonical:true};
 const priority=(c:any,t:any=tag)=>controlRpcRequest('eth_call',[c,t],1000n,h=>h===canonical?1000n:undefined);
 assert(priority(call([lane,root])),'The engine batch is the same mutable lifecycle fence as the direct player getter');
 assert(!priority(call([lane])),'A catalogue/assignment-only batch stays ordinary');
 assert(!priority(call([root,{...lane,callData:'0xdeadbeef'}])));
 assert(!priority(call([{...root,target:pool},lane])),'Only the actual no-lease hub is recognized');
 assert(!priority(call(Array.from({length:22},()=>root))),'Bound the privileged read work');
 assert(!priority(call([lane,root]),'0x3a7'),'Historical audits retain their original queue');
 assert(!priority({...call([lane,root]),to:pool}),'No arbitrary multicall contract');
});

test('current control checks pass a catalogue backlog without changing either upstream rate',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 for(const spacing of [75,85]){
  const queue=rpcScheduler(spacing),seen:Array<{name:string;at:number}>=[];
  const take=(name:string,history:boolean,control=false)=>queue.acquire(history,control)
   .then(()=>seen.push({name,at:Date.now()}));
  await take('in-flight',false);
  const start=Date.now(),jobs=[...Array.from({length:8},(_,i)=>take(`catalogue${i}`,false)),
   ...Array.from({length:5},(_,i)=>take(`history${i}`,true)),take('control',false,true)];
  for(let i=0;i<jobs.length;i++){t.mock.timers.tick(spacing);await Promise.resolve();}
  await Promise.all(jobs);
  assert(seen.find(x=>x.name==='control')!.at-start<=2*spacing,'A fresh authorization must not wait behind eight catalogue reads');
  assert(seen.every((x,i)=>!i||x.at-seen[i-1].at>=spacing),'No additional upstream budget');
  assert.equal(queue.spacing(),spacing);assert.equal(seen.length,15);
 }
});

test('control priority recognizes actual current delegation fences but never historical or arbitrary calls',()=>{
 const hash=`0x${'ab'.repeat(32)}`,unknown=`0x${'cd'.repeat(32)}`,hub='0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e';
 const data=encodeFunctionData({abi:roomsLifecycleHubAbi,functionName:'delegationOf',args:[hub,zeroHash]});
 const priority=(method:string,params:unknown[])=>controlRpcRequest(method,params,1000n,h=>h===hash?1000n:undefined);
 for(const tag of ['latest','pending','0x3e8',{blockHash:hash,requireCanonical:true}])assert(priority('eth_call',[{to:hub,data},tag]));
 for(const tag of ['0x3a7','0x3e9',{blockHash:unknown,requireCanonical:true}])
  assert.equal(priority('eth_call',[{to:hub,data},tag]),false,'A concrete block must still be observed and recent');
 assert.equal(priority('eth_call',[{to:hub,data:'0xdeadbeef'},'latest']),false,'Only a root delegation getter receives live priority');
 assert.equal(priority('eth_call',[{to:hub,data:data.slice(0,-1)+'1'},'0x3e8']),false,'Non-root delegation');
 assert.equal(priority('eth_call',[{to:hub,data:data+'00'},'0x3e8']),false,'Trailing calldata');
 assert.equal(priority('eth_call',[{to:hub,data:'0xdeadbeef'},'0x3e8']),false);
 assert.equal(priority('eth_call',[{to:'0x01',data},'0x3e8']),false);
 assert.equal(controlRpcRequest('eth_call',[{to:hub,data},'0x3e8']),false,'No invented head');
 for(const tag of ['latest','pending','0x3e8'])assert(priority('eth_getBlockByNumber',[tag,false]));
 for(const tag of ['0x3a7','0x3e9','safe','finalized'])assert.equal(priority('eth_getBlockByNumber',[tag,false]),false);
 assert(priority('eth_getBlockByHash',[hash,false]));assert(!priority('eth_getBlockByHash',[unknown,false]));
 for(const method of ['eth_getLogs','eth_sendRawTransaction','eth_getTransactionReceipt'])assert(!priority(method,[]));
});

test('a continuous control backlog preserves ordinary and historical fairness and exact dispatch estimates',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 for(const target of ['control','live','history'] as const){
  const queue=rpcScheduler(75),seen:Array<{kind:string;at:number}>=[];
  await queue.acquire(false,true);
  const take=(kind:'control'|'live'|'history')=>queue.acquire(kind==='history',kind==='control').then(()=>seen.push({kind,at:Date.now()}));
  const jobs=[...Array.from({length:20},()=>take('control')),...Array.from({length:4},()=>take('live')),...Array.from({length:5},()=>take('history'))];
  // A dispatch estimate assumes the observed backlog, not future arrivals.
  const expected=Date.now()+queue.waitMs(target==='history',target==='control');
  jobs.push(take(target));
  for(let i=0;i<jobs.length;i++){t.mock.timers.tick(75);await Promise.resolve();}
  await Promise.all(jobs);
  assert.deepEqual(seen.slice(0,5).map(x=>x.kind),['control','control','control','history','live']);
  assert.equal(seen.filter(x=>x.kind===target).at(-1)!.at,expected,target);
  assert.equal(queue.spacing(),75);assert.deepEqual(queue.pending(),{interactive:0,history:0});
 }
});

test('admission nonce, receipt, fees and submission share the current-state budget without promoting arbitrary calls',async(t)=>{
 const account=`0x${'12'.repeat(20)}`,hash=`0x${'34'.repeat(32)}`;
 for(const [method,params] of [
  ['eth_getTransactionReceipt',[hash]],['eth_getTransactionCount',[account,'pending']],['eth_getTransactionCount',[account,'latest']],
  ['eth_gasPrice',[]],['eth_maxPriorityFeePerGas',[]],['eth_estimateGas',[{to:account,from:account,data:'0x1234'}]],['eth_sendRawTransaction',['0x1234']],
 ] as Array<[string,unknown[]]>)assert(controlRpcRequest(method,params),method);
 for(const [method,params] of [
  ['eth_getTransactionReceipt',['0x01']],['eth_getTransactionCount',[account,'0x1']],['eth_getTransactionCount',['bad','latest']],
  ['eth_estimateGas',[{to:account,from:account},'0x1']],['eth_estimateGas',[{to:account}]],['eth_sendRawTransaction',['0x1']],['eth_sendRawTransaction',['0x12',{}]],
 ] as Array<[string,unknown[]]>)assert(!controlRpcRequest(method,params),method);
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const queue=rpcScheduler(75),seen:string[]=[];
 await queue.acquire(false);
 const ordinary=Array.from({length:8},(_,i)=>queue.acquire(false).then(()=>seen.push(`catalogue${i}`)));
 const receipt=queue.acquire(false,controlRpcRequest('eth_getTransactionReceipt',[hash])).then(()=>seen.push('receipt'));
 t.mock.timers.tick(75);await Promise.resolve();assert.deepEqual(seen,['receipt']);
 for(let i=0;i<8;i++){t.mock.timers.tick(75);await Promise.resolve();}
 await Promise.all([...ordinary,receipt]);assert.equal(queue.spacing(),75);
});

test('control priority cannot bypass an upstream cooldown or promote historical work',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const queue=rpcScheduler(75),seen:string[]=[];
 await queue.acquire(false);queue.throttle(2000);
 const low=queue.acquire(true,true).then(()=>seen.push('historical'));
 const live=queue.acquire(false).then(()=>seen.push('ordinary'));
 const urgent=queue.acquire(false,true).then(()=>seen.push('control'));
 assert.equal(queue.waitMs(false,true),2085);
 t.mock.timers.tick(1999);await Promise.resolve();assert.deepEqual(seen,[]);
 t.mock.timers.tick(1);await Promise.resolve();assert.deepEqual(seen,['control']);
 t.mock.timers.tick(85);await Promise.resolve();t.mock.timers.tick(85);
 await Promise.all([low,live,urgent]);assert.deepEqual(seen,['control','ordinary','historical']);
});

test('fresh runtime validation overtakes metadata while historical code stays in its lane',()=>{
 const address=`0x${'12'.repeat(20)}`,hash=`0x${'34'.repeat(32)}`;
 const priority=(params:unknown[])=>controlRpcRequest('eth_getCode',params,1000n,h=>h===hash?1000n:undefined);
 for(const tag of ['latest','pending','0x3e8',{blockHash:hash,requireCanonical:true}])assert(priority([address,tag]));
 for(const tag of ['0x3a7','0x3e9','safe',{blockHash:`0x${'56'.repeat(32)}`,requireCanonical:true}])assert(!priority([address,tag]));
 assert(!priority(['0x01','latest']));assert(!priority([address,'latest',{}]));
 assert(!controlRpcRequest('eth_getCode',[address,'0x3e8']),'No invented canonical head');
});

test('foreground hints cannot promote history, logs, writes or unknown RPCs',()=>{
 const hash=`0x${'12'.repeat(32)}`,height=(h:string)=>h===hash?10n:undefined;
 for(const method of ['eth_call','eth_getCode','eth_getBalance','eth_getStorageAt']){
  const args=(tag:unknown)=>method==='eth_getStorageAt'?['0x01','0x0',tag]:['0x01',tag];
  assert(foregroundRpcRequest(method,args('latest'),true,1000n,height));
  assert(!foregroundRpcRequest(method,args('latest'),false,1000n,height));
  for(const tag of ['0x1',{blockHash:hash,requireCanonical:true}])assert(!foregroundRpcRequest(method,args(tag),true,1000n,height));
 }
 for(const method of ['eth_getLogs','debug_traceCall','eth_sendRawTransaction','interlude_sendTransaction'])
  assert(!foregroundRpcRequest(method,[],true,1000n,height));
});

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


test('seven simultaneous entries cannot put hydration ahead of transaction preparation and receipts',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const s=rpcScheduler(60),seen:{name:string;at:number}[]=[];
 const take=(name:string,history=false,control=false,foreground=false)=>s.acquire(history,control,foreground).then(()=>seen.push({name,at:Date.now()}));
 await take('initial');
 const jobs=[...Array.from({length:20},(_,i)=>take('hydration'+i,false,false,true)),
  ...Array.from({length:10},(_,i)=>take('archive'+i,true)),...Array.from({length:10},(_,i)=>take('ordinary'+i)),
  ...Array.from({length:16},(_,i)=>take('transaction'+i,false,true))];
 assert(s.waitMs(false,true)<s.waitMs(false,false,true),'Nonce preparation overtakes the foreground backlog');
 for(let i=0;i<jobs.length;i++){t.mock.timers.tick(60);await Promise.resolve();}
 await Promise.all(jobs);
 assert.deepEqual(seen.slice(1,4).map(v=>v.name),['transaction0','hydration0','transaction1']);
 assert(seen.findIndex(v=>v.name==='archive0')<=17,'History retains its bounded admission-pressure share');
 assert(seen.findIndex(v=>v.name==='ordinary0')<=6,'Ordinary reads still progress');
 assert(seen.findIndex(v=>v.name==='hydration0')<=7,'Foreground reads cannot starve');
 assert(seen.every((v,i)=>!i||v.at-seen[i-1].at>=60),'No extra upstream throughput');
 assert.deepEqual(s.pending(),{interactive:0,history:0});
});

test('foreground admission reads share the provider throttle and exact wait estimate',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const s=rpcScheduler(60);await s.acquire(false);s.throttle(1000);
 const times:number[]=[];
 const f=s.acquire(false,false,true).then(()=>times.push(Date.now()));
 assert.equal(s.waitMs(false,true),1000,'Control can overtake foreground but not the cooldown');
 const c=s.acquire(false,true).then(()=>times.push(Date.now()));
 t.mock.timers.tick(999);await Promise.resolve();assert.deepEqual(times,[]);
 t.mock.timers.tick(1);await Promise.resolve();assert.deepEqual(times,[2000]);
 t.mock.timers.tick(70);await Promise.all([f,c]);assert.deepEqual(times,[2000,2070]);
});

test('transaction work overtakes routine canonical headers and preserves every queue budget',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const s=rpcScheduler(75),seen:{name:string;at:number}[]=[];
 const take=(name:string,h=false,c=false,f=false,tx=false)=>s.acquire(h,c,f,tx).then(()=>seen.push({name,at:Date.now()}));
 await take('initial');
 const jobs=[...Array.from({length:12},(_,i)=>take('header'+i,false,true)),
  ...Array.from({length:8},(_,i)=>take('foreground'+i,false,false,true)),
  ...Array.from({length:8},(_,i)=>take('ordinary'+i)),...Array.from({length:8},(_,i)=>take('archive'+i,true)),
  ...Array.from({length:16},(_,i)=>take('transaction'+i,false,false,false,true))];
 const expected=s.waitMs(false,false,false,true);
 const tail=take('transaction-tail',false,false,false,true);jobs.push(tail);
 for(let i=0;i<jobs.length;i++){t.mock.timers.tick(75);await Promise.resolve();}
 await Promise.all(jobs);
 assert.equal(seen[1].name,'transaction0');
 assert(seen.findIndex(v=>v.name==='header0')<=8);
 assert(seen.findIndex(v=>v.name==='foreground0')<40);
 assert(seen.findIndex(v=>v.name==='ordinary0')<=6);
 assert(seen.findIndex(v=>v.name==='archive0')<=17);
 assert.equal(seen.find(v=>v.name==='transaction-tail')!.at-1000,expected);
 assert(seen.every((v,i)=>!i||v.at-seen[i-1].at===75));
 assert.deepEqual(s.pending(),{interactive:0,history:0});
});


test('transaction lane validates exact requests and does not inherit routine header priority',()=>{
 const account=`0x${'12'.repeat(20)}`,hash=`0x${'34'.repeat(32)}`;
 for(const [method,params] of [
  ['eth_getTransactionReceipt',[hash]],['eth_getTransactionCount',[account,'pending']],
  ['eth_getTransactionCount',[account,'latest']],['eth_gasPrice',[]],['eth_maxPriorityFeePerGas',[]],
  ['eth_estimateGas',[{to:account,from:account,data:'0x1234'},'latest']],['eth_sendRawTransaction',['0x010203']],
 ] as const)assert(transactionRpcRequest(method,params),method);
 for(const [method,params] of [
  ['eth_getBlockByNumber',['latest',false]],['eth_blockNumber',[]],['eth_getCode',[account,'latest']],
  ['eth_call',[{to:account,data:'0x1234'},'latest']],['eth_getTransactionReceipt',['0x12']],
  ['eth_getTransactionCount',[account,'0x1000']],['eth_estimateGas',[{to:account},'latest']],
  ['eth_sendRawTransaction',['0x123']],['eth_gasPrice',[1]],
 ] as const)assert.equal(transactionRpcRequest(method,params),false,method);
});

test('a journaled send and its receipt overtake unsigned preparation without starving any lane',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 for(const spacing of [75,85]){
  const q=rpcScheduler(spacing),seen:Array<{kind:string;at:number}>=[];
  const take=(kind:string)=>q.acquire(kind==='history',kind==='control',kind==='foreground',kind==='transaction'||kind==='submission',kind==='fence',kind==='submission')
   .then(()=>seen.push({kind,at:Date.now()}));
  await take('live');const start=Date.now();
  const jobs=['transaction','control','foreground','live','history','fence'].flatMap(kind=>Array.from({length:30},()=>take(kind)));
  const expected=q.waitMs(false,false,false,false,false,true);jobs.push(take('submission'));
  for(let i=0;i<jobs.length;i++){t.mock.timers.tick(spacing);await Promise.resolve();}
  await Promise.all(jobs);
  const delay=seen.find(r=>r.kind==='submission')!.at-start;
  assert(delay<=3*spacing,`Journaled send waited ${delay}ms behind unrelated preparation`);
  assert.equal(delay,expected);
  assert(seen.every((r,i)=>!i||r.at-seen[i-1].at===spacing));
  // Repeated receipt polls cannot starve the unsigned job which must follow.
  const began=seen.length;
  const flood=Array.from({length:40},()=>take('submission'));
  const pending=['transaction','control','foreground','live','history','fence'].map(take);
  for(let i=0;i<47;i++){t.mock.timers.tick(spacing);await Promise.resolve();}
  await Promise.all([...flood,...pending]);
  for(const kind of ['transaction','control','foreground','live','history','fence'])assert(seen.slice(began,began+20).some(r=>r.kind===kind),kind+' starved');
 }
});

test('submission priority is limited to exact broadcasts and receipt lookup, with shared cooldown',async(t)=>{
 assert(submissionRpcRequest('eth_sendRawTransaction',['0x010203']));
 assert(submissionRpcRequest('eth_getTransactionReceipt',[`0x${'12'.repeat(32)}`]));
 for(const [method,params] of [
  ['eth_sendRawTransaction',['0x123']],['eth_getTransactionReceipt',['0x12']],
  ['eth_getTransactionReceipt',[`0x${'12'.repeat(32)}`,true]],
  ['eth_estimateGas',[{from:`0x${'12'.repeat(20)}`,to:`0x${'34'.repeat(20)}`},'latest']],
  ['eth_call',[{to:`0x${'34'.repeat(20)}`,data:'0x0102'},'latest']],['eth_gasPrice',[]],
 ] as const)assert(!submissionRpcRequest(method,params),method);
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const q=rpcScheduler(75);q.throttle(1000);let sent=false;
 const request=q.acquire(false,false,false,true,false,true).then(()=>sent=true);
 assert.equal(q.waitMs(false,false,false,true,false,true),1085);
 t.mock.timers.tick(999);await Promise.resolve();assert(!sent);
 t.mock.timers.tick(1);await request;assert(sent);
});

test('a newly mined challenge receipt keeps its canonical header check ahead of archive scans',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const tx=`0x${'12'.repeat(32)}`,hash=`0x${'34'.repeat(32)}`;
 for(const spacing of [75,85]){
  const blocks=rpcBlockObservations(),queue=rpcScheduler(spacing),seen:Array<{name:string;at:number}>=[];
  blocks.observe('eth_blockNumber',[],'0x3e8');
  // readChallengeAdmission verifies the block hash immediately after receiving
  // this receipt. The receipt can be newer than the gateway's last head poll.
  blocks.observe('eth_getTransactionReceipt',[tx],{transactionHash:tx,blockNumber:'0x3e9',blockHash:hash,status:'0x1'});
  const params=['0x3e9',false];
  assert.equal(historicalRpcRequest('eth_getBlockByNumber',params,blocks.head(),blocks.height),false);
  assert(controlRpcRequest('eth_getBlockByNumber',params,blocks.head(),blocks.height));
  const take=(name:string,history:boolean,control=false)=>queue.acquire(history,control).then(()=>seen.push({name,at:Date.now()}));
  await take('in-flight',true);const start=Date.now();
  const jobs=[...Array.from({length:12},(_,i)=>take(`archive${i}`,true)),take('receipt-header',false,true)];
  for(let i=0;i<jobs.length;i++){t.mock.timers.tick(spacing);await Promise.resolve();}
  await Promise.all(jobs);
  assert(seen.find(x=>x.name==='receipt-header')!.at-start<=2*spacing);
  assert(seen.every((x,i)=>!i||x.at-seen[i-1].at>=spacing),'No extra RPC budget');
 }
});

test('receipt scheduling hints validate identity, never certify canonicality and cannot move a head backwards',()=>{
 const blocks=rpcBlockObservations(),tx=`0x${'12'.repeat(32)}`,hash=`0x${'34'.repeat(32)}`;
 blocks.observe('eth_blockNumber',[],'0x3e8');
 const receipt={transactionHash:tx,blockNumber:'0x3e9',blockHash:hash,status:'0x1'};
 for(const bad of [null,{...receipt,transactionHash:hash},{...receipt,blockHash:null},{...receipt,blockNumber:null}])
  blocks.observe('eth_getTransactionReceipt',[tx],bad);
 assert.equal(blocks.head(),1000n);assert.equal(blocks.height(hash),undefined);
 blocks.observe('eth_getTransactionReceipt',[tx],receipt);
 assert.equal(blocks.head(),1001n);
 assert.equal(blocks.height(hash),undefined,'Receipt does not replace the explicit canonical header observation');
 blocks.observe('eth_getTransactionReceipt',[tx],{...receipt,blockNumber:'0x20'});
 assert.equal(blocks.head(),1001n,'Historical receipt cannot demote live checks');
 blocks.observe('eth_blockNumber',[],'0x3e7');
 assert.equal(blocks.head(),999n,'A subsequent real lower head is still respected');
 assert(historicalRpcRequest('eth_getBlockByNumber',['0xffff',false],blocks.head()),'Invented future headers remain ordinary archive work');
});

test('four admissions keep a bounded critical path through three dependent reads under mixed load',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 for(const spacing of [75,85]){
  const scheduler=rpcScheduler(spacing),seen:{kind:string;at:number}[]=[];
  await scheduler.acquire(false);
  const start=Date.now(),take=(kind:string)=>scheduler.acquire(kind==='history',kind==='control',kind==='foreground',kind==='transaction',kind==='fence')
   .then(()=>seen.push({kind,at:Date.now()}));
  const background=['transaction','control','live','history','fence'].flatMap(kind=>Array.from({length:40},()=>take(kind)));
  const entries=Array.from({length:4},async()=>{for(let round=0;round<3;round++)await take('foreground');return Date.now()-start;});
  for(let i=0;i<240;i++){t.mock.timers.tick(spacing);for(let j=0;j<5;j++)await Promise.resolve();}
  const elapsed=await Promise.all(entries);await Promise.all(background);
  // This deliberately saturated one-provider case reserves at least 1.5s of
  // the 8s admission target for work outside these three read rounds. The
  // actual browser gate remains 8s, including all network and signing work.
  assert(Math.max(...elapsed)<=6500,`Critical reads consumed ${Math.max(...elapsed)}ms before signing, inclusion and engine setup`);
  for(const kind of ['transaction','control','live','history','fence'])assert(seen.slice(0,24).some(r=>r.kind===kind),kind+' must still progress');
  assert(seen.every((r,i)=>!i||r.at-seen[i-1].at===spacing),'No additional provider throughput');
  assert.deepEqual(scheduler.pending(),{interactive:0,history:0});
 }
});

test('six login simulations cannot expire behind sustained transactions and canonical headers',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 for(const spacing of [75,85]){
  const scheduler=rpcScheduler(spacing),seen:{kind:string;at:number}[]=[];
  await scheduler.acquire(false);
  const start=Date.now(),take=(kind:string)=>scheduler.acquire(kind==='history',kind==='control',kind==='foreground',kind==='transaction')
   .then(()=>seen.push({kind,at:Date.now()}));
  const jobs=[...Array.from({length:60},()=>take('transaction')),...Array.from({length:60},()=>take('control')),
   ...Array.from({length:30},()=>take('live')),...Array.from({length:30},()=>take('history')),...Array.from({length:6},()=>take('foreground'))];
  const estimate=scheduler.waitMs(false,false,true);jobs.push(take('foreground'));
  for(let i=0;i<jobs.length;i++){t.mock.timers.tick(spacing);await Promise.resolve();}
  await Promise.all(jobs);
  const player=seen.filter(r=>r.kind==='foreground');
  assert(player[5].at-start<=5000,'The six first login simulations need a bounded share before the 8/10-second caller timeouts');
  assert.equal(player[6].at-start,estimate);
  for(const kind of ['transaction','control','live','history'])assert(seen.slice(0,17).some(r=>r.kind===kind),kind+' must still progress');
  assert(seen.every((r,i)=>!i||r.at-seen[i-1].at===spacing),'No additional provider throughput');
 }
});


test('archive backfill yields its burst during admissions without losing its bounded turn',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 for(const spacing of [60,75,85]){
  const q=rpcScheduler(spacing),seen:Array<{kind:string;at:number}>=[];
  await q.acquire(false);const start=Date.now();
  const take=(kind:string)=>q.acquire(kind==='history',false,kind==='foreground',kind==='transaction',kind==='fence',kind==='submission')
   .then(()=>seen.push({kind,at:Date.now()}));
  const jobs=['foreground','transaction','fence','submission','history'].flatMap(kind=>Array.from({length:24},()=>take(kind)));
  const expected=q.waitMs(true);jobs.push(take('history'));
  for(let i=0;i<jobs.length;i++){t.mock.timers.tick(spacing);await Promise.resolve();}
  await Promise.all(jobs);
  const first=seen.findIndex(r=>r.kind==='history');
  assert.equal(first,15,'Only one of seventeen dispatches goes to backfill while an admission waits');
  const tail=seen.filter(r=>r.kind==='history').at(-1)!;
  assert.equal(tail.at-start,expected,'The provider selector uses the actual dispatch policy');
  assert(seen.every((r,i)=>!i||r.at-seen[i-1].at===spacing),'No extra provider throughput');
  const gaps=seen.reduce<number[]>((a,r,i)=>{if(r.kind==='history')a.push(i);return a;},[]);
  assert(gaps.every((n,i)=>!i||n-gaps[i-1]<=17),'Even saturated admissions cannot starve archive progress');
  assert.deepEqual(q.pending(),{interactive:0,history:0});
 }
});
