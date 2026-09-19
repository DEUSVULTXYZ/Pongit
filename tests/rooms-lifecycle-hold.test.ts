import test, {after, afterEach, before, beforeEach, mock} from "node:test";
import assert from "node:assert/strict";
import {createServer, type Server} from "node:http";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {encodeFunctionResult, keccak256, parseTransaction, toFunctionSelector, zeroAddress, zeroHash, type Hex} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {roomsLifecycleHubAbi} from "../shared/abi-rooms-lifecycle";
import {roomsLifecycle} from "../relayer/src/rooms-lifecycle";

const app="0x0000000000000000000000000000000000000011",hub="0x0000000000000000000000000000000000000022",adapter="0x0000000000000000000000000000000000000033";
const operatorKey=generatePrivateKey(),operator=privateKeyToAccount(operatorKey),estimate=130690n,epoch=6n;
const seconds=()=>BigInt(Math.floor(Date.now()/1000));

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
    if(sql.startsWith("UPDATE il_engine_jobs SET status='obsolete'"))return {rows:[],rowCount:0};
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
    publishedResult:{finalStatus:async()=>0,published:async()=>{throw Error('Unexpected result read in lifecycle fixture');}},
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
  world=makeWorld();rpcCalls.length=0;delete process.env.ROOMS_LIFECYCLE_MAX_BATCHES;delete process.env.ROOMS_LIFECYCLE_HOLD_WRITES;
  mock.method(console,"info",(line:string)=>world.state.events.push(JSON.parse(line)));
  mock.method(console,"warn",()=>{});
});
afterEach(()=>mock.restoreAll());

test('supervised recovery holds closure, release, finalization and renewal while still observing the hub',async()=>{
 process.env.ROOMS_LIFECYCLE_HOLD_WRITES='true';
 const w=world.state;w.stage='draining';w.delegation.batchIndex=700n;
 const lifecycle=await started();
 try{
  for(const status of [1,2,0,3]){
   w.delegation.status=status;await lifecycle.cycle();
   assert.equal(lifecycle.available(),false);assert.equal(lifecycle.status().operatorHold,true);
   assert.equal(lifecycle.status().epoch,'6');assert.match(lifecycle.status().error,/Operator approval required/);
   assert.equal(w.closes.length,0);assert.equal(w.sent.length,0);assert.equal(w.jobs.size,0);
  }
 }finally{lifecycle.stop();}
});

test('supervised recovery preserves an uncertain operator transaction without rebroadcast or nonce replacement',async()=>{
 process.env.ROOMS_LIFECYCLE_HOLD_WRITES='true';
 const w=world.state;
 w.jobs.set('already-signed',{id:'already-signed',app,owner:operator.address.toLowerCase(),nonce:1258,raw:'0x02',hash:zeroHash,status:'pending'});
 const lifecycle=await started();
 try{
  assert.equal(w.sent.length,0);assert.equal(w.jobs.size,1);assert.equal(w.jobs.get('already-signed')!.status,'pending');
  assert.match(lifecycle.status().error,/without rebroadcast/);
  assert.equal(lifecycle.status().epoch,'6','the uncertain receipt does not hide hub observations');
  w.receipts.set(zeroHash,'success');await lifecycle.cycle();
  assert.equal(w.jobs.get('already-signed')!.status,'confirmed');assert.equal(w.sent.length,0);
 }finally{lifecycle.stop();}
});
