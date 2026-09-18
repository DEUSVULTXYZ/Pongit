import test, {after, afterEach, before, beforeEach, mock} from "node:test";
import assert from "node:assert/strict";
import {createServer, type Server} from "node:http";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {encodeFunctionResult, keccak256, parseTransaction, toFunctionSelector, zeroAddress, zeroHash, type Hex} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {roomsLifecycleHubAbi} from "../shared/abi-rooms-lifecycle";
import {ROOMS_DEFAULT_MAX_BATCHES, roomsLifecycle, roomsLifecycleMaxBatches, roomsRenewalPressure} from "../relayer/src/rooms-lifecycle";

const app="0x0000000000000000000000000000000000000011",hub="0x0000000000000000000000000000000000000022",adapter="0x0000000000000000000000000000000000000033";
const operatorKey=generatePrivateKey(),operator=privateKeyToAccount(operatorKey),estimate=130690n,epoch=6n;
const seconds=()=>BigInt(Math.floor(Date.now()/1000));

test("batch pressure trips at the threshold, before expiry, and expiry is unchanged below it",()=>{
  const far=10n**9n,now=far-86400n;
  assert.equal(roomsRenewalPressure({batchIndex:599n,expiresAt:far},now,600n),"");
  assert.equal(roomsRenewalPressure({batchIndex:600n,expiresAt:far},now,600n),"batches");
  assert.equal(roomsRenewalPressure({batchIndex:8564n,expiresAt:far},now,600n),"batches");
  // The previous rule, expiresAt > now + 3600, is kept exactly.
  assert.equal(roomsRenewalPressure({batchIndex:0n,expiresAt:now+3601n},now,600n),"");
  assert.equal(roomsRenewalPressure({batchIndex:0n,expiresAt:now+3600n},now,600n),"expiry");
  assert.equal(roomsRenewalPressure({batchIndex:600n,expiresAt:now},now,600n),"batches");
});

test("the threshold defaults below the release ceiling and refuses unsafe configuration",()=>{
  assert.equal(roomsLifecycleMaxBatches(undefined),ROOMS_DEFAULT_MAX_BATCHES);
  assert.equal(roomsLifecycleMaxBatches(""),600n);
  assert.equal(roomsLifecycleMaxBatches(" 250 "),250n);
  assert.equal(roomsLifecycleMaxBatches("1000"),1000n);
  for(const raw of ["0","-1","1e3","12.5","0x10","abc","010"])assert.throws(()=>roomsLifecycleMaxBatches(raw),/positive integer/);
  assert.throws(()=>roomsLifecycleMaxBatches("1001"),/release ceiling/);
  assert.throws(()=>roomsLifecycleMaxBatches("8564"),/release ceiling/);
});

// A signing node for the wallet only: fee and gas estimation, nothing is ever broadcast here.
let rpc:Server,dir:string;
const rpcCalls:string[]=[];
before(async()=>{
  rpc=createServer((req,res)=>{let body="";req.on("data",c=>body+=c);req.on("end",()=>{
    const {id,method}=JSON.parse(body);rpcCalls.push(method);
    const result:Record<string,unknown>={eth_chainId:"0x279f",eth_maxPriorityFeePerGas:"0x2",eth_estimateGas:"0x"+estimate.toString(16),
      eth_getBlockByNumber:{number:"0x1",hash:"0x"+"ab".repeat(32),parentHash:zeroHash,timestamp:"0x1",gasLimit:"0x8f0d180",gasUsed:"0x0",baseFeePerGas:"0x3",transactions:[]}};
    res.setHeader("content-type","application/json");
    res.end(JSON.stringify(method in result?{jsonrpc:"2.0",id,result:result[method]}:{jsonrpc:"2.0",id,error:{code:-32601,message:"Method not found"}}));
  });});
  await new Promise<void>(r=>rpc.listen(0,"127.0.0.1",r));
  process.env.RPC_URL=`http://127.0.0.1:${(rpc.address() as any).port}`;
  dir=await mkdtemp(join(tmpdir(),"rooms-lifecycle-"));
  process.env.ROOMS_LIFECYCLE_KEY_FILE=join(dir,"lifecycle.json");
  await writeFile(process.env.ROOMS_LIFECYCLE_KEY_FILE,JSON.stringify({privateKey:operatorKey}));
});
after(async()=>{rpc.close();await rm(dir,{recursive:true,force:true});});

type Job={id:string;app:string;owner:string;nonce:number;raw:Hex;hash:Hex;status:string};
let world:ReturnType<typeof makeWorld>;
function makeWorld(){
  const w={
    stage:"playing",epoch:"0",changedAt:new Date(Date.now()-86400000),lockFree:true,engineJobPending:false,
    jobs:new Map<string,Job>(),lockSql:[] as string[],sent:[] as Hex[],receipts:new Map<string,"success"|"reverted">(),
    delegation:{status:1,batchIndex:0n,expiresAt:seconds()+86400n,stakeUnlockAt:0n},
    live:0n,published:0n,pendingDiffs:0,nodeEpoch:epoch,nonce:1258,
    closes:[] as bigint[],onClose:undefined as undefined|(()=>void),events:[] as any[],
  };
  const query=async(sql:string,args:any[]=[])=>{
    if(sql.includes("CREATE TABLE")||sql.startsWith("INSERT INTO il_lifecycle("))return {rows:[],rowCount:0};
    if(sql.startsWith("SELECT stage FROM il_lifecycle"))return {rows:[{stage:w.stage}]};
    if(sql.startsWith("UPDATE il_lifecycle SET stage"))return w.stage=args[1],w.changedAt=new Date(),{rowCount:1};
    if(sql.startsWith("UPDATE il_lifecycle SET epoch"))return w.epoch=args[1],{rowCount:1};
    if(sql.startsWith("SELECT epoch FROM il_lifecycle"))return {rows:[{epoch:w.epoch}]};
    if(sql.startsWith("SELECT changed_at FROM il_lifecycle"))return {rows:[{changed_at:w.changedAt}]};
    if(sql.startsWith("SELECT 1 FROM il_engine_jobs"))return {rows:[],rowCount:w.engineJobPending?1:0};
    if(sql.startsWith("SELECT * FROM il_lifecycle_jobs WHERE id=$1"))return {rows:w.jobs.has(args[0])?[{...w.jobs.get(args[0])}]:[]};
    if(sql.startsWith("SELECT * FROM il_lifecycle_jobs WHERE owner=$1 AND status='pending'"))
      return {rows:[...w.jobs.values()].filter(j=>j.owner===args[0]&&j.status==="pending").sort((a,b)=>a.nonce-b.nonce).map(j=>({...j}))};
    if(sql.startsWith("INSERT INTO il_lifecycle_jobs VALUES")){
      const [id,jobApp,owner,nonce,raw,hash]=args;assert(!w.jobs.has(id),"a journaled operation is never signed twice");
      w.jobs.set(id,{id,app:jobApp,owner,nonce,raw,hash,status:"pending"});return {rowCount:1};
    }
    if(sql.startsWith("UPDATE il_lifecycle_jobs SET status"))return w.jobs.get(args[0])!.status=args[1],{rowCount:1};
    throw new Error("Unexpected lifecycle SQL: "+sql.slice(0,60));
  };
  const db={query,connect:async()=>({
    query:async(sql:string)=>{w.lockSql.push(sql);return {rows:[{ok:w.lockFree}]};},
    release(){},
  })};
  const delegationOf=()=>encodeFunctionResult({abi:roomsLifecycleHubAbi,functionName:"delegationOf",result:{
    app,partition:zeroHash,validator:zeroAddress,beneficiary:zeroAddress,resolver:zeroAddress,status:w.delegation.status,statusBeforeChallenge:0,
    maxBatchInterval:3600n,challengeWindow:3600n,resolutionWindow:3600n,lastCommitAt:0n,stakeUnlockAt:w.delegation.stakeUnlockAt,expiresAt:w.delegation.expiresAt,
    maxDiffsPerCommit:64,timeoutPenaltyBps:0,resolveThreshold:0,baseBlock:1n,spec:1,lastExecTimestamp:0n,stake:0n,challengeBond:0n,
    batchIndex:w.delegation.batchIndex,epoch,challenger:zeroAddress,challengerBond:0n,challengeDeadline:0n,challengedBatch:0n,claimedRoot:zeroHash,challengeKind:0,
  } as any});
  const base={
    readContract:async({functionName}:any)=>functionName==="operator"?operator.address:functionName==="activeCount"?w.published:assert.fail(functionName),
    request:async({method,params}:any)=>{assert.equal(method,"eth_call");assert.equal(params[0].to,hub);return delegationOf();},
    getTransactionCount:async()=>w.nonce,
    call:async()=>({}),
    getTransactionReceipt:async({hash}:any)=>{const s=w.receipts.get(hash);if(!s)throw new Error("receipt not found");return {status:s};},
    sendRawTransaction:async({serializedTransaction}:any)=>{w.sent.push(serializedTransaction);return keccak256(serializedTransaction);},
  };
  const start=()=>roomsLifecycle({
    db:db as any,base:base as any,app,hub,adapter,nodeUrl:"https://node.test",
    engineStatus:async()=>({app,chainId:4242,epoch:w.nodeEpoch,committedBatches:w.delegation.batchIndex,pendingDiffs:Array(w.pendingDiffs).fill("0x")}),
    engineActive:async()=>w.live,
    beforeClose:async e=>{w.closes.push(e);w.onClose?.();},
  });
  return {state:w,start};
}
async function started(){
  const lifecycle=(await world.start())!;
  await lifecycle.cycle();
  return lifecycle;
}
beforeEach(()=>{
  world=makeWorld();rpcCalls.length=0;delete process.env.ROOMS_LIFECYCLE_MAX_BATCHES;
  mock.method(console,"info",(line:string)=>world.state.events.push(JSON.parse(line)));
  mock.method(console,"warn",()=>{});
});
afterEach(()=>mock.restoreAll());

test("below the threshold a far-from-expiry epoch keeps serving",async()=>{
  const w=world.state;w.delegation.batchIndex=599n;
  const lifecycle=await started();
  try{
    assert.equal(w.stage,"playing");assert.equal(lifecycle.available(),true);
    assert.deepEqual({batch:lifecycle.status().batch,batchLimit:lifecycle.status().batchLimit,closing:lifecycle.status().closing},{batch:"599",batchLimit:"600",closing:""});
    assert.equal(w.events.length,0);assert.equal(w.jobs.size,0);
  }finally{lifecycle.stop();}
});

test("batch pressure stops admissions at once and closes through the shared journal only after the drain",async()=>{
  const w=world.state;w.delegation.batchIndex=600n;w.live=1n;
  const lifecycle=await started();
  try{
    // Admissions close in the same step, long before expiry.
    assert.equal(w.stage,"draining");assert.equal(lifecycle.available(),false);
    assert.equal(lifecycle.status().closing,"batches");
    assert.deepEqual(w.events.map(e=>[e.previous,e.stage,e.closing,e.batches,e.batchLimit]),[["playing","draining","batches","600","600"]]);
    // Even with nothing live, nothing is fenced or signed while admissions have been shut for under 60 s.
    w.live=0n;
    await lifecycle.cycle();assert.equal(w.closes.length,0);assert.equal(w.jobs.size,0);
    w.changedAt=new Date(Date.now()-61000);w.live=1n;
    // Live matches, then unpublished diffs, hold the close exactly as they do near expiry.
    await lifecycle.cycle();assert.match(lifecycle.status().error,/active matches/);
    w.live=0n;w.pendingDiffs=3;w.delegation.batchIndex=640n;
    await lifecycle.cycle();assert.match(lifecycle.status().error,/engine publication/);
    assert.equal(w.closes.length,0);assert.equal(w.jobs.size,0);assert.equal(w.stage,"draining");
    w.pendingDiffs=0;
    await lifecycle.cycle();
    assert.deepEqual(w.closes,[epoch]);
    const close=w.jobs.get(`${app}:${epoch}:close`)!;
    assert.deepEqual([...w.jobs.keys()],[`${app}:${epoch}:close`]);
    assert.equal(close.owner,operator.address.toLowerCase());assert.equal(close.nonce,1258);assert.equal(close.status,"pending");
    const tx=parseTransaction(close.raw);
    assert.equal(tx.to,app);assert.equal(tx.data,toFunctionSelector("function closeEngine()"));
    assert.equal(tx.chainId,10143);assert.equal(tx.nonce,1258);assert.equal(tx.gas,estimate*12n/10n);
    assert.deepEqual(w.sent,[close.raw]);assert.equal(w.stage,"draining");
    assert(rpcCalls.includes("eth_estimateGas"));assert(!rpcCalls.includes("eth_sendRawTransaction"));
    // The next step reconciles the journal first; the hub then reports the closed epoch.
    w.receipts.set(close.hash,"success");w.delegation={...w.delegation,status:2,stakeUnlockAt:seconds()+3600n};
    await lifecycle.cycle();
    assert.equal(close.hash,w.jobs.get(`${app}:${epoch}:close`)!.hash);
    assert.equal(w.jobs.get(`${app}:${epoch}:close`)!.status,"confirmed");
    assert.equal(w.stage,"challenge");assert.equal(w.jobs.size,1);
    assert(w.lockSql.every(sql=>sql.includes("(701340)")));
    assert(w.lockSql.filter(sql=>sql.includes("pg_try_advisory_lock")).length===w.lockSql.filter(sql=>sql.includes("pg_advisory_unlock")).length);
  }finally{lifecycle.stop();}
});

test("the fence rechecks the live engine after beforeClose and signs nothing if a match appeared",async()=>{
  const w=world.state;w.stage="draining";w.changedAt=new Date(Date.now()-61000);w.delegation.batchIndex=700n;
  w.onClose=()=>{w.live=1n;};
  const lifecycle=await started();
  try{
    assert.equal(w.closes.length,1);assert.match(lifecycle.status().error,/active matches/);
    assert.equal(w.jobs.size,0);assert.equal(w.sent.length,0);assert.equal(w.stage,"draining");
  }finally{lifecycle.stop();}
});

test("an unconfirmed engine transaction or published match still blocks a pressure close",async()=>{
  const w=world.state;w.stage="draining";w.changedAt=new Date(Date.now()-61000);w.delegation.batchIndex=700n;
  w.engineJobPending=true;
  const lifecycle=(await world.start())!;
  try{
    await lifecycle.cycle();
    assert.match(lifecycle.status().error,/engine transaction remains unconfirmed/);assert.equal(w.jobs.size,0);
    w.engineJobPending=false;w.published=1n;
    await lifecycle.cycle();
    assert.match(lifecycle.status().error,/Published match changed/);assert.equal(w.jobs.size,0);assert.equal(w.sent.length,0);
  }finally{lifecycle.stop();}
});

test("a busy lock 701340 or operator nonce defers the close but never keeps admitting past the limit",async()=>{
  const w=world.state;w.delegation.batchIndex=590n;
  const lifecycle=await started();
  try{
    assert.equal(lifecycle.available(),true);
    // Another tool holds the shared lock while the epoch crosses the limit.
    w.lockFree=false;w.lockSql.length=0;w.delegation.batchIndex=600n;
    await lifecycle.cycle();
    assert.equal(lifecycle.available(),false);assert.match(lifecycle.status().error,/600 batches \(limit 600\); admissions paused/);
    assert.equal(w.stage,"playing");assert.equal(w.events.length,0);assert.equal(w.jobs.size,0);
    assert.deepEqual(w.lockSql,["SELECT pg_try_advisory_lock(701340) AS ok"]);
    // A pending transaction from any tool sharing the operator is resolved first; play still stops.
    w.lockFree=true;
    w.jobs.set("independent-rehearsal:other",{id:"independent-rehearsal:other",app:hub,owner:operator.address.toLowerCase(),nonce:1257,raw:"0x01",hash:("0x"+"cd".repeat(32)) as Hex,status:"pending"});
    await lifecycle.cycle();
    assert.deepEqual(w.sent,["0x01"]);assert.equal(lifecycle.available(),false);assert.equal(w.stage,"playing");assert.equal(w.jobs.size,1);
    // Once the journal is free the drain proceeds through the ordinary path.
    w.receipts.set("0x"+"cd".repeat(32),"success");
    await lifecycle.cycle();
    assert.equal(w.jobs.get("independent-rehearsal:other")!.status,"confirmed");
    assert.equal(w.stage,"draining");assert.equal(w.events[0].closing,"batches");
  }finally{lifecycle.stop();}
});

test("a busy journal below the limit leaves admissions as they were",async()=>{
  const w=world.state;w.delegation.batchIndex=599n;
  const lifecycle=await started();
  try{
    w.lockFree=false;
    await lifecycle.cycle();
    assert.equal(lifecycle.available(),true);assert.equal(lifecycle.status().error,"");
  }finally{lifecycle.stop();}
});

test("a drain is one-way: raising the threshold later never readmits into the epoch",async()=>{
  const w=world.state;w.stage="draining";w.changedAt=new Date();w.delegation.batchIndex=650n;
  process.env.ROOMS_LIFECYCLE_MAX_BATCHES="1000";
  const lifecycle=await started();
  try{
    assert.equal(w.stage,"draining");assert.equal(lifecycle.available(),false);
    assert.equal(lifecycle.status().closing,"");assert.equal(lifecycle.status().batchLimit,"1000");
  }finally{lifecycle.stop();}
});

test("expiry still drains an epoch far below the threshold",async()=>{
  const w=world.state;w.delegation.expiresAt=seconds()+1800n;
  const lifecycle=await started();
  try{
    assert.equal(w.stage,"draining");assert.equal(lifecycle.status().closing,"expiry");
    assert.equal(w.events[0].closing,"expiry");assert.equal(w.events[0].batches,"0");
  }finally{lifecycle.stop();}
});

test("a configured threshold is honoured, and an unsafe one refuses to start",async()=>{
  const w=world.state;w.delegation.batchIndex=250n;
  process.env.ROOMS_LIFECYCLE_MAX_BATCHES="250";
  const lifecycle=await started();
  try{assert.equal(w.stage,"draining");assert.equal(lifecycle.status().batchLimit,"250");}finally{lifecycle.stop();}
  process.env.ROOMS_LIFECYCLE_MAX_BATCHES="5000";
  await assert.rejects(world.start(),/release ceiling/);
});
