// Real hosted capability test. These are fresh, private rehearsal deployments,
// never the live website's arena. Passing does not activate a production migration.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {Pool} from 'pg';
import WebSocket from 'ws';
import {createPublicClient,createWalletClient,http,encodeFunctionData,keccak256,parseAbi,type Address,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {createInterludeClient,memoryStore,storageKey} from '@interludelayer-sdk/sdk';
import {roomsChaosAbi as abi} from '../shared/abi-PongRoomsTestnet';
import {chaosOfferDomain,chaosOfferTypes} from '../shared/rooms-chaos';
import {readHubDelegation} from '../shared/rooms-hub';
import {EngineStream} from '../shared/engine-stream';
import {engineTransport} from '../shared/engine-transport';
assert.equal(process.env.PONG_ARENA_QUALIFY,'fresh-hosted-arenas');
const journalPath=process.env.PONG_ARENA_PROVISION_JOURNAL!,privatePath=process.env.PONG_ARENA_TEST_SESSIONS!;
assert(journalPath?.startsWith('/secrets/')&&privatePath?.startsWith('/secrets/'));
const provision=JSON.parse(await readFile(journalPath,'utf8'));
const arenas=provision.arenas.filter(Boolean);
assert(arenas.length===3&&arenas.every((a:any)=>a.state==='answered'&&a.app&&a.node));
assert.equal(new Set(arenas.map((a:any)=>a.app.toLowerCase())).size,3);
const live=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
assert(arenas.every((a:any)=>a.app.toLowerCase()!==live.app.toLowerCase()));
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:8000})});
assert.equal(await base.getChainId(),10143);
const coordinator=privateKeyToAccount(process.env.INTERLUDE_COORDINATOR_KEY as Hex);
const operator=privateKeyToAccount(JSON.parse(await readFile(process.env.ROOMS_LIFECYCLE_KEY_FILE!,'utf8')).privateKey);
const wallet=createWalletClient({account:operator,chain:monadTestnet,transport:http(process.env.RPC_URL)});
const db=new Pool({connectionString:process.env.DATABASE_URL});
const report:any={at:new Date().toISOString(),purpose:'hosted isolation qualification',productionMigrated:false,actions:[],checks:[],arenas:arenas.map((a:any)=>({app:a.app,node:a.node}))};
const out='artifacts/independent-arenas';await mkdir(out,{recursive:true});
const secrets:any={sessions:[],jobs:[]};
let saveTail=Promise.resolve();
const save=()=>{const data=JSON.stringify(secrets);saveTail=saveTail.then(async()=>{await writeFile(privatePath+'.next',data,{mode:0o600});await rename(privatePath+'.next',privatePath);});return saveTail;};
// An existing file requires inspecting and resuming the prior identities, not rerunning this test.
try{await readFile(privatePath);throw Error('Existing test session journal requires reconciliation');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const flush=()=>writeFile(out+'/report.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const clients:any[]=[],players:any[]=[],stops:Array<()=>void>=[],counts=[0,0,0];
async function send(i:number,side:number,name:string,args:any[]){
 const event:any={at:new Date().toISOString(),arena:i,player:side,name,state:'sending'};report.actions.push(event);await flush();
 const receipt=await players[i][side].session.send(name,args);Object.assign(event,{state:'confirmed',hash:receipt.hash,latencyMs:receipt.latencyMs});await flush();return receipt;
}
async function start(i:number,mode:number){
 const id=BigInt(i+1),a=players[i][0].owner.address,b=players[i][1].owner.address;
 const offer={id,room:keccak256(new TextEncoder().encode(`independent:${arenas[i].app}`)),a,b,mode,ranked:false,expires:BigInt(Math.floor(Date.now()/1000)+25),rules:4n,entropy:keccak256(new TextEncoder().encode(arenas[i].app))};
 const signature=await coordinator.signTypedData({domain:chaosOfferDomain(10143,arenas[i].app),types:chaosOfferTypes,primaryType:'MatchOffer',message:offer});
 await send(i,0,'acceptMatch',[offer,signature]);await send(i,1,'acceptMatch',[offer,signature]);
 assert.equal((await clients[i].read('getSnapshot',[id]))[2],2n);report.checks.push(`Arena ${i+1} started in mode ${mode}`);
}
async function published(i:number){
 const deadline=Date.now()+90000,id=BigInt(i+1);
 while(Date.now()<deadline){
  const [liveHash,baseHash]=await Promise.all([clients[i].read('resultHashes',[id]),clients[i].readSettled('resultHashes',[id])]);
  if(liveHash!=='0x'+'0'.repeat(64)&&liveHash===baseHash){report.checks.push(`Arena ${i+1} terminal hash published`);return;}
  await wait(1500);
 }
 throw Error(`Arena ${i+1} publication timed out`);
}
async function close(i:number){
 const connection=await db.connect();let locked=false;
 try{
  for(let n=0;n<15&&!locked;n++){locked=(await connection.query('SELECT pg_try_advisory_lock(701340) AS ok')).rows[0].ok;if(!locked)await wait(1000);}
  assert(locked,'Lifecycle operator is busy');
  const app=arenas[i].app as Address,d=await readHubDelegation(base,provision.hub,app);
  assert.equal(d.status,1);assert.equal(await clients[i].readSettled('activeCount',[]),0n);
  const id=`independent-rehearsal:${app}:${d.epoch}:close`;
  assert.equal((await db.query('SELECT 1 FROM il_lifecycle_jobs WHERE id=$1 OR (owner=$2 AND status=\'pending\')',[id,operator.address.toLowerCase()])).rowCount,0);
  const nonce=await base.getTransactionCount({address:operator.address,blockTag:'pending'});
  assert.equal(nonce,await base.getTransactionCount({address:operator.address,blockTag:'latest'}));
  const data=encodeFunctionData({abi:parseAbi(['function closeEngine()']),functionName:'closeEngine'});
  await base.call({account:operator.address,to:app,data});
  const request=await wallet.prepareTransactionRequest({to:app,data,nonce});request.gas=request.gas*12n/10n;
  const raw=await wallet.signTransaction(request),hash=keccak256(raw);
  await db.query('INSERT INTO il_lifecycle_jobs(id,app,owner,nonce,raw,hash,status) VALUES($1,$2,$3,$4,$5,$6,\'pending\')',[id,app,operator.address.toLowerCase(),nonce,raw,hash]);
  try{await base.sendRawTransaction({serializedTransaction:raw});}catch{/* resolve this hash only */}
  const receipt=await base.waitForTransactionReceipt({hash,timeout:45000});
  await db.query('UPDATE il_lifecycle_jobs SET status=$2 WHERE id=$1',[id,receipt.status==='success'?'confirmed':'failed']);assert.equal(receipt.status,'success');
  report.actions.push({arena:i,name:'closeEngine',hash,block:receipt.blockNumber});
 }finally{if(locked)await connection.query('SELECT pg_advisory_unlock(701340)');connection.release();}
}
try{
 for(let i=0;i<3;i++){
  const a=arenas[i],store=memoryStore();
  const client=createInterludeClient({app:a.app,abi,node:a.node,base,store,fastPath:true,transport:engineTransport(a.node,{
   async beforeSend(raw){const hash=keccak256(raw as Hex);assert(!secrets.jobs.some((j:any)=>j.app===a.app&&j.state==='uncertain'),'Previous command unresolved');secrets.jobs.push({app:a.app,raw,hash,state:'uncertain'});await save();},
   received(method,result){if(!['interlude_sendTransaction','eth_getTransactionReceipt'].includes(method)||!result?.transactionHash)return;const j=secrets.jobs.find((x:any)=>x.hash===result.transactionHash);if(j){j.state='received';void save();}}
  })});clients.push(client);
  const d=await readHubDelegation(base,provision.hub,a.app),status=await client.status();
  assert.equal(d.status,1);assert.equal(BigInt(status.epoch),d.epoch);assert(d.expiresAt>BigInt(Math.floor(Date.now()/1000)+600));
  assert.equal(await client.read('activeCount',[]),0n);assert.equal(await client.readSettled('activeCount',[]),0n);assert.equal(await client.read('coordinator',[]),coordinator.address);
  players[i]=[];
  for(let side=0;side<2;side++){
   const owner=privateKeyToAccount(generatePrivateKey());
   const session=await client.openSession({wallet:createWalletClient({account:owner,chain:monadTestnet,transport:http()}),scope:['acceptMatch','input','tick','concede'],expirySeconds:7200,assertDigest:true});
   players[i].push({owner,session});secrets.sessions.push({app:a.app,owner:owner.address,stored:store.get(storageKey(a.app,10143,owner.address))});await save();
  }
  const stream=new EngineStream(a.node,a.app,url=>new WebSocket(url,{origin:'https://pongit.xyz'}) as any);
  stops.push(stream.subscribe(()=>counts[i]++));
 }
 await start(0,0);await start(1,1);
 for(let n=0;n<4;n++)for(let i=0;i<2;i++)for(let side=0;side<2;side++){
  const s:any=await clients[i].read('getSnapshot',[BigInt(i+1)]);assert.equal(s[2],2n);
  await send(i,side,'input',[BigInt(i+1),n%2?1:-1,s[side?10:9]+1n,s[7]+150n]);
 }
 await send(0,0,'concede',[1n]);await published(0);await close(0);
 const before:any=await clients[1].read('getSnapshot',[2n]);assert.equal(before[2],2n);
 await send(1,0,'input',[2n,0,before[9]+1n,before[7]+150n]);
 const after:any=await clients[1].read('getSnapshot',[2n]);assert(after[1]>before[1]);
 assert.equal((await readHubDelegation(base,provision.hub,arenas[0].app)).status,2);
 report.checks.push('Closing arena 1 does not stop arena 2');
 await start(2,0);report.checks.push('Arena 3 starts during arena 1 challenge window');
 await send(1,0,'concede',[2n]);await send(2,0,'concede',[3n]);
 await published(1);await published(2);await close(1);await close(2);
 report.appliedFrames=counts;assert(counts.every(n=>n>0),'Applied websocket events not received for every arena');
 report.passed=true;
}catch(e){report.passed=false;report.error=String((e as any).shortMessage||(e as Error).message).split('Request Arguments')[0].slice(0,700);process.exitCode=1;}
finally{for(const stop of stops)stop();await saveTail;await db.end();report.finishedAt=new Date().toISOString();await flush();console.log(JSON.stringify({passed:report.passed,error:report.error,checks:report.checks}));}
