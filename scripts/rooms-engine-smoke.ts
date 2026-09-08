// Isolated hosted-engine diagnostic. No financial transaction or fake pressure checkpoint.
import assert from "node:assert/strict";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {randomBytes} from "node:crypto";
import {existsSync} from "node:fs";
import {createPublicClient, createWalletClient, http, type Hex} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {monadTestnet} from "viem/chains";
import {createInterludeClient, memoryStore, storageKey} from "@interludelayer-sdk/sdk";
import {roomsChaosAbi as abi} from "../shared/abi-PongRoomsTestnet";
import {chaosOfferDomain, chaosOfferTypes} from "../shared/rooms-chaos";
import {EngineSnapshotError, readEngineSnapshot} from "../shared/engine-snapshot";

assert.equal(process.env.ROOMS_ENGINE_SMOKE, "isolated-vps");
const manifest = JSON.parse(await readFile(process.env.ROOMS_SMOKE_MANIFEST!, "utf8"));
assert.equal(manifest.app.toLowerCase(), process.env.ROOMS_SMOKE_APP?.toLowerCase());
const out = process.env.ROOMS_SMOKE_REPORT!;
const secretFile = process.env.ROOMS_SMOKE_RECOVERY!;
assert(secretFile.startsWith("/secrets/") && out.startsWith("artifacts/"));
assert(!existsSync(secretFile) && !existsSync(out),"Inspect the recorded attempt before reusing an engine or test identities");
const signer = privateKeyToAccount(process.env.INTERLUDE_COORDINATOR_KEY as Hex);
assert.equal(signer.address.toLowerCase(), manifest.coordinator.toLowerCase());
const base = createPublicClient({chain:monadTestnet, transport:http("https://testnet-rpc.monad.xyz",{timeout:8000,retryCount:0})});
const makeClient = (store = memoryStore()) => createInterludeClient({app:manifest.app, abi, node:manifest.node, base, store,
  transport:http(manifest.node,{timeout:5000,retryCount:0}), fastPath:true});
const engine = makeClient(), startedAt = new Date().toISOString();
const report:any = {startedAt, app:manifest.app, checks:[], actions:[], snapshots:[]};
const secrets:any[] = [], players:any[] = [];
const save = async () => writeFile(out, JSON.stringify(report,(_,v)=>typeof v==="bigint"?v.toString():v,2));
const wait = (ms:number) => new Promise(r=>setTimeout(r,ms));
const rand = () => `0x${randomBytes(32).toString("hex")}` as Hex;
async function read(id:bigint){
  const snap:any = await readEngineSnapshot(engine,id);
  report.snapshots.push({at:new Date().toISOString(),id,revision:snap[1],phase:snap[2],head:snap[7],clock:snap[8],processed:snap[12].t,nonceA:snap[9],nonceB:snap[10],paused:snap[12].awaitingServe});
  assert(snap[8]>=snap[12].t,"read clock precedes stored physics");
  return snap;
}
async function send(player:any,name:string,args:readonly unknown[]){
  // Save intent before submission. A failure is never automatically replayed.
  const action:any={at:new Date().toISOString(),player:player.owner.address,name,matchId:name==="acceptMatch"?(args[0] as any).id:args[0],status:"sending"};
  report.actions.push(action);await save();
  const result=await player.session.send(name as any,args as any);
  Object.assign(action,{status:"accepted",hash:result.hash,latencyMs:result.latencyMs});await save();
}
await mkdir(out.slice(0,out.lastIndexOf("/")),{recursive:true});
try {
  const status=await engine.status();report.before=status;
  assert.equal(status.app.toLowerCase(),manifest.app.toLowerCase());assert.equal(status.chainId,4242);
  assert.equal(await engine.read("activeCount",[]),0n,"do not interrupt pre-existing matches");
  assert.equal(status.pendingDiffs.length,0);
  for(let i=0;i<4;i++){
    const owner=privateKeyToAccount(generatePrivateKey()),store=memoryStore(),client=makeClient(store);
    const session=await client.openSession({wallet:createWalletClient({account:owner,chain:monadTestnet,transport:http()}),
      scope:["acceptMatch","input","tick","concede","cancelMatch"],expirySeconds:1800,assertDigest:true});
    // Recovery is private and survives a process failure. Do not log this content.
    secrets.push({owner:owner.address,stored:store.get(storageKey(manifest.app,10143,owner.address))});
    await writeFile(secretFile,JSON.stringify(secrets),{mode:0o600});
    players.push({owner,session});
  }
  report.checks.push("Four scoped engine sessions with onchain digest verification");
  const matches:bigint[]=[];
  for(const mode of [0,1]){
    const id=BigInt(rand()),[a,b]=players.slice(mode*2,mode*2+2);
    const offer={id,room:rand(),a:a.owner.address,b:b.owner.address,mode,ranked:false,expires:BigInt(Math.floor(Date.now()/1000)+25),rules:4n,entropy:rand()};
    const signature=await signer.signTypedData({domain:chaosOfferDomain(10143,manifest.app),types:chaosOfferTypes,primaryType:"MatchOffer",message:offer});
    await send(a,"acceptMatch",[offer,signature]);assert.equal((await read(id))[2],1n);
    await send(b,"acceptMatch",[offer,signature]);assert.equal((await read(id))[2],2n);
    matches.push(id);
  }
  assert.equal(await engine.read("activeCount",[]),2n);
  report.checks.push("Classic and Chaos both active after two signed consents");
  for(let n=0;n<100;n++){
    const m=n%2,id=matches[m],side=Math.floor(n/2)%2,player=players[m*2+side],s=await read(id);
    assert.equal(s[2],2n);
    const direction=n%3-1;
    await send(player,"input",[id,direction,s[side===0?9:10]+1n,s[7]+150n]);
    const after=await read(id);assert.equal(after[side===0?9:10],s[side===0?9:10]+1n);
    if(n%20===0){report.checks.push(`${n+1} inputs observed`);console.log(JSON.stringify({inputs:n+1,head:after[7].toString(),phase:Number(after[2])}));}
    await wait(30);
  }
  for(let m=0;m<2;m++){
    await send(players[m*2],"concede",[matches[m]]);
    const s=await read(matches[m]);assert.equal(s[2],3n);assert.equal(s[6].toLowerCase(),players[m*2+1].owner.address.toLowerCase());
  }
  assert.equal(await engine.read("activeCount",[]),0n);
  report.checks.push("100 observed inputs and two independent results; no pressure or financial writes");
  const latencies=report.actions.filter((x:any)=>x.name==="input").map((x:any)=>x.latencyMs).sort((a:number,b:number)=>a-b);
  report.latencyMs={source:"VPS SDK receipt",p50:latencies[49],p95:latencies[94],p99:latencies[98]};
  // Observe automatic publication; do not bypass a hosted commit-token policy.
  const until=Date.now()+90000;
  do {
    const status=await engine.status();report.after=status;await save();
    if(status.pendingDiffs.length===0 && status.committedBatches>report.before.committedBatches)break;
    await wait(3000);
  }while(Date.now()<until);
  assert.equal(report.after.pendingDiffs.length,0,"terminal state has not been published");
  for(const id of matches){const settled:any=await engine.readSettled("getSnapshot",[id]);assert.equal(settled[2],3n);}
  report.checks.push("Both results published on Monad");report.passed=true;
}catch(e){
  report.passed=false;report.error=String((e as any).shortMessage||(e as Error).message).split("Request Arguments")[0].slice(0,1200);
  if(e instanceof EngineSnapshotError)report.readFailure={app:e.app,matchId:e.matchId,returnData:e.returnData};
  report.causes=[];
  for(let c:any=e;c && report.causes.length<6;c=c.cause){
    const detail=String(c.details||c.shortMessage||c.message||"").split("Request body")[0].split("Request Arguments")[0];
    report.causes.push({name:c.name,detail:detail.replace(/0x[0-9a-fA-F]{130,}/g,"[long hex omitted]").slice(0,1000)});
  }
  console.error(report.error);process.exitCode=1;
}finally{report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({app:report.app,passed:report.passed,checks:report.checks,latencyMs:report.latencyMs,error:report.error}));}
