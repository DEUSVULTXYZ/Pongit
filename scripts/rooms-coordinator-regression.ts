// Real PostgreSQL, private VPS network, simulated chain. Never connect this to production.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createHash,randomBytes} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {Pool} from "pg";
import WebSocket,{WebSocketServer} from "ws";
import {decodeFunctionData,encodeFunctionData,encodeFunctionResult,encodeAbiParameters,keccak256,zeroAddress,zeroHash,toFunctionSelector,type Hex} from "viem";
import {generatePrivateKey,privateKeyToAccount} from "viem/accounts";
import {roomsChaosAbi as abi} from "../shared/abi-PongRoomsTestnet";
import {interludeHubReadAbi} from "../shared/abi-interlude";
import {initial} from "../shared/physics-v2";
import {createRoomsCoordinator} from "../relayer/src/interlude-rooms";
assert.equal(process.env.ROOMS_COORDINATOR_TEST,"isolated-vps");
assert.equal(new URL(process.env.TEST_DATABASE_URL!).hostname,"pongit-stream-db");
const db=new Pool({connectionString:process.env.TEST_DATABASE_URL});
const app="0x1111111111111111111111111111111111111111",hub="0x2222222222222222222222222222222222222222";
let faultEpoch=false,slowSnapshot=false,receipts=new Map<string,any>();
let expiredDelegation=false,sessionReads=0,engineWrites=0;
const snapshots=new Map<string,readonly unknown[]>();
const empty=(id:bigint)=>[id,0n,0n,zeroAddress,zeroAddress,zeroAddress,zeroAddress,100n,0n,0n,0n,0n,initial(zeroHash)] as any;
const pause=(n:number)=>new Promise(r=>setTimeout(r,n));
const readBody=async(req:any)=>{let s="";for await(const chunk of req)s+=chunk;return s?JSON.parse(s):{};};
const rpc=createServer(async(req,res)=>{
 try{const body=await readBody(req),method=body.method;let result:unknown;
  if(method==="interlude_session"){sessionReads++;result={app,chainId:4242,validator:zeroAddress,resolver:zeroAddress,epoch:1,baseBlock:1,committedBatches:0,maxDiffsPerCommit:64,ephemeralBlock:100,execTimestamp:Math.floor(Date.now()/1000),pendingDiffs:[]};}
  else if(method==="interlude_sendTransaction"){engineWrites++;throw Error('No engine writes are expected in this observer regression');}
  else if(method==="eth_getTransactionReceipt")result=receipts.get(body.params[0])??null;
  else if(method==="eth_getTransactionCount")result="0x0";
  else if(method==="eth_chainId")result="0x1092";
  else if(method==="eth_call"){
   const data=body.params[0].data as Hex;
   if(data.startsWith(toFunctionSelector(interludeHubReadAbi[0])))result=encodeFunctionResult({abi:interludeHubReadAbi,functionName:"sessionOf",result:{validator:zeroAddress,resolver:zeroAddress,status:1,spec:0,epoch:1n,batchIndex:0n,baseBlock:1n,lastExecTimestamp:0n,lastCommitAt:0n,maxBatchInterval:10n,expiresAt:BigInt(Math.floor(Date.now()/1000)+(expiredDelegation?-1:86400)),maxDiffsPerCommit:64}});
   else {let decoded:any;try{decoded=decodeFunctionData({abi,data});}catch{}
    if(decoded?.functionName==="getSnapshot"){if(slowSnapshot)await pause(1800);result=encodeFunctionResult({abi,functionName:"getSnapshot",result:(snapshots.get(String(decoded.args[0]))||empty(decoded.args[0])) as any});}
    else if(decoded?.functionName==="ratingOf")result=encodeFunctionResult({abi,functionName:"ratingOf",result:{elo:1000,played:0,wins:0,season:1}});
    else if(decoded?.functionName==="resultHashes")result=snapshots.get(String(decoded.args[0]))?.[2]===3n?`0x${'12'.repeat(32)}`:zeroHash;
    else if(decoded?.functionName==="hub")result=encodeAbiParameters([{type:"address"}],[hub]);
    else {if(faultEpoch)throw Error("Simulated permission provider outage");result=encodeAbiParameters([{type:"uint256"}],[0n]);}
   }
  }else throw Error("Unexpected mocked RPC "+method);
  res.setHeader("content-type","application/json");res.end(JSON.stringify({jsonrpc:"2.0",id:body.id,result}));
 }catch{res.statusCode=503;res.end("Simulated RPC unavailable");}
});
await new Promise<void>(r=>rpc.listen(8556,"127.0.0.1",r));
// Keep this disposable key in memory; it is never written to a report.
const key=generatePrivateKey(),admission=privateKeyToAccount(key);process.env.INTERLUDE_COORDINATOR_KEY=key;
await writeFile("/tmp/pongit-coordinator-test.json",JSON.stringify({app,hub,node:"http://127.0.0.1:8556",coordinator:admission.address,rulesVersion:4}));
process.env.INTERLUDE_ROOMS_MANIFEST="/tmp/pongit-coordinator-test.json";
process.env.RPC_URL="http://127.0.0.1:8556";process.env.ROOMS_ADMISSION_ENABLED="true";process.env.ROOMS_CHAOS_ENABLED="false";
await db.query("CREATE TABLE profiles(player text PRIMARY KEY,handle text UNIQUE,avatar integer);CREATE TABLE player_blocks(player text,blocked text)");
const coordinator=(await createRoomsCoordinator({db,origin:"https://pongit.xyz",body:readBody,send:(res,data,status=200)=>{res.statusCode=status;res.setHeader("content-type","application/json");res.end(JSON.stringify(data,(_,v)=>typeof v==="bigint"?String(v):v));},graphql:async()=>({Match:[]})}))!;
const server=createServer(async(req,res)=>{if(!await coordinator.route(req,res,new URL(req.url!,"http://local").pathname)){res.statusCode=404;res.end();}});
const wss=new WebSocketServer({server});wss.on("connection",(socket,req)=>socket.on("message",async raw=>{const m=JSON.parse(String(raw));try{await coordinator.subscribe(socket,req,m.player);}catch{socket.close();}}));
await new Promise<void>(r=>server.listen(4005,"127.0.0.1",r));
const players=Array.from({length:8},()=>({address:privateKeyToAccount(generatePrivateKey()).address.toLowerCase(),token:randomBytes(32).toString("hex")}));
for(const p of players)await db.query("INSERT INTO il_sessions VALUES($1,$2,$2,$3,'0',$4)",[createHash("sha256").update(p.token).digest("hex"),p.address,Math.floor(Date.now()/1000)+7200,app]);
async function api(p:typeof players[number],path:string,body?:any){const r=await fetch("http://127.0.0.1:4005/interlude/"+path,{method:body===undefined?"GET":"POST",headers:{origin:"https://pongit.xyz",cookie:"pongit_rooms="+p.token,"x-pongit-player":p.address,"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json() as any;return {status:r.status,...data};}
const action=(p:typeof players[number],path:string,body:any={},operation=crypto.randomUUID())=>api(p,path,{...body,operation});
async function until(fn:()=>Promise<boolean>,timeout=10000){const at=Date.now();while(Date.now()-at<timeout){if(await fn())return;await pause(100);}throw Error("Timed out in private coordinator test");}
const report:any={at:new Date().toISOString(),checks:[],cycles:0};let socket:WebSocket|undefined;
try{
 await until(async()=>coordinator.status().online);
 // Real uniqueness constraints, operation journal and concurrent HTTP requests.
 for(let n=0;n<20;n++){
  const p=players[0],operation=crypto.randomUUID();
  const queued=await Promise.all([action(p,"queue",{mode:0},operation),action(p,"queue",{mode:0},operation)]);
  assert(queued.every(r=>r.status===200));assert((await api(p,"state")).queue);
  assert.equal(Number((await db.query("SELECT count(*) FROM il_occupancy WHERE player=$1",[p.address])).rows[0].count),1);
  assert.equal((await action(p,"queue/cancel")).status,200);assert(!(await api(p,"state")).queue);report.cycles++;
 }
 report.checks.push("20 duplicate-click queue/cancel cycles keep exactly one occupancy");
 const created=await action(players[0],"rooms",{mode:0});assert.equal(created.status,200);const room=created.room;
 await Promise.all(players.slice(1).map(p=>action(p,"rooms/join",{room})));assert.equal((await api(players[0],"state")).room.members.length,8);
 const ninth={address:privateKeyToAccount(generatePrivateKey()).address.toLowerCase(),token:randomBytes(32).toString("hex")};
 await db.query("INSERT INTO il_sessions VALUES($1,$2,$2,$3,'0',$4)",[createHash("sha256").update(ninth.token).digest("hex"),ninth.address,Math.floor(Date.now()/1000)+7200,app]);
 assert.equal((await action(ninth,"rooms/join",{room})).status,400);report.checks.push("Eight members fit, ninth member rejected");
 let offer:any;await until(async()=>{offer=(await api(players[0],"state")).room.offer;return !!offer;});
 slowSnapshot=true;const accepting=action(players[0],"offers/accept",{id:offer.id});await pause(100);
 const began=Date.now();assert.equal((await api(players[7],"presence",{})).status,200);assert.equal((await api(players[7],"state")).status,200);
 report.independentPresenceMs=Date.now()-began;assert(report.independentPresenceMs<800);assert.equal((await accepting).status,200);slowSnapshot=false;
 report.checks.push("Slow acceptance RPC does not hold the global lobby lock");
 // A published Chaos pause does not progress while its financial checkpoint
 // is unavailable. The observer must remain live without sending idle ticks.
 const paused=empty(BigInt(offer.id));paused[2]=2n;paused[3]=offer.a;paused[4]=offer.b;paused[8]=9000000n;
 paused[12]={...paused[12],mode:1,awaitingServe:true,resumeAt:3000000n};
 snapshots.set(offer.id,paused);const readsBefore=sessionReads,writesBefore=engineWrites;
 await pause(4500);assert(sessionReads>readsBefore);assert.equal(engineWrites,writesBefore);
 snapshots.delete(offer.id);
 report.checks.push('Missing Chaos checkpoint keeps observation alive without idle engine writes');
 const messages:any[]=[];socket=new WebSocket("ws://127.0.0.1:4005",{headers:{cookie:"pongit_rooms="+players[0].token}});
 socket.on("open",()=>socket!.send(JSON.stringify({player:players[0].address})));socket.on("message",raw=>messages.push(JSON.parse(String(raw))));
 await until(async()=>messages.some(m=>m.type==="rooms-changed"));faultEpoch=true;
 await until(async()=>messages.some(m=>m.type==="rooms-unavailable"),16000);
 assert.equal(socket.readyState,WebSocket.OPEN);assert(!messages.some(m=>m.type==="rooms-expired"));
 assert.equal((await api(players[0],"state")).status,503);faultEpoch=false;
 await until(async()=>(await api(players[0],"state")).status===200);
 report.checks.push("Temporary permission RPC failure preserves the session and rejects unverified actions");
 await db.query("UPDATE il_sessions SET expires=0 WHERE player=$1",[players[0].address]);
 await until(async()=>messages.some(m=>m.type==="rooms-expired"));report.checks.push("Real expiry still closes the subscription");
 expiredDelegation=true;
 await until(async()=>(await api(players[1],"config")).errorCode==="ENGINE_DELEGATION_EXPIRED");
 const unavailable=await api(players[1],"config");
 assert.equal(unavailable.online,false);assert.equal(unavailable.admission,false);assert(unavailable.checkedAt>0);assert(unavailable.retryAt>Date.now());
 const saved=(await db.query("SELECT document FROM il_lobby WHERE app=$1",[app])).rows[0].document;
 const terminalRoom=Object.values(saved.rooms).find((r:any)=>r.offer) as any;
 assert(terminalRoom?.offer,'Regression fixture must have an offer');
 const terminal=empty(BigInt(terminalRoom.offer.id));
 terminal[2]=3n;terminal[3]=terminalRoom.offer.a;terminal[4]=terminalRoom.offer.b;terminal[6]=terminalRoom.offer.b;
 terminal[12].scoreA=2;terminal[12].scoreB=7;terminal[12].finished=true;
 snapshots.set(terminalRoom.offer.id,terminal);
 const raw=await admission.signTransaction({type:'eip1559',chainId:4242,nonce:276,to:app,data:encodeFunctionData({abi,functionName:'tick',args:[BigInt(terminalRoom.offer.id)]}),gas:15000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
 await db.query("INSERT INTO il_engine_jobs(app,id,nonce,raw,hash,status,epoch) VALUES($1,'lost-terminal-tick',276,$2,$3,'pending',1)",[app,raw,keccak256(raw)]);
 await until(async()=>!!(await db.query("SELECT 1 FROM il_results WHERE app=$1 AND id=$2 AND score_b=7 AND published=true",[app,terminalRoom.offer.id])).rowCount,16000);
 const repaired=(await db.query("SELECT document FROM il_lobby WHERE app=$1",[app])).rows[0].document.rooms[terminalRoom.id];
 assert.equal(repaired.offer.status,'complete');assert.equal(repaired.winner,terminalRoom.offer.b);
 assert.equal((await db.query("SELECT status FROM il_engine_jobs WHERE id='lost-terminal-tick'")).rows[0].status,'pending');
 report.checks.push('Expired delegation with missing receipt still repairs terminal rooms and published history without resending');
 await db.query("UPDATE il_engine_jobs SET status='quarantined' WHERE id='lost-terminal-tick'");
 assert.equal((await api(players[1],"state")).status,200,"Engine expiry must not revoke player authentication");
 expiredDelegation=false;
 await until(async()=>coordinator.status().online,35000);
 assert.equal((await api(players[1],"config")).error,"");
 report.checks.push("Engine expiry blocks admission, preserves recovery reads and player access, and recovers after renewal");
 report.passed=true;
}catch(e){report.error=String(e);report.coordinator=coordinator.status();throw e;}
finally{socket?.close();coordinator.stop();wss.close();server.close();rpc.close();await pause(200);await db.end();await mkdir("artifacts/stream-coordinator",{recursive:true});await writeFile("artifacts/stream-coordinator/report.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
