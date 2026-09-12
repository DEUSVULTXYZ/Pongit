// Real hosted contract-authority qualification. Private keys/commands never enter the report.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createWalletClient,http,encodeFunctionData,keccak256,type Address,type Hex} from 'viem';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {createInterludeClient,memoryStore,storageKey} from '@interludelayer-sdk/sdk';
import {chainTools} from './independent-chain-tools';
import {engineTransport} from '../shared/engine-transport';
import {EngineStream} from '../shared/engine-stream';
import WebSocket from 'ws';

const path=process.env.PONG_INDEPENDENT_MANIFEST!,secretPath=process.env.PONG_INDEPENDENT_TEST_KEYS!;
assert(path?.startsWith('/secrets/')&&secretPath?.startsWith('/secrets/'));
const m=JSON.parse(await readFile(path,'utf8'));assert.equal(m.production,false);assert.equal(m.status,'sealed');
const t=await chainTools(m.prefix);
const abi=(await t.artifact('IndependentArena')).abi,l=(await t.artifact('IndependentLobby')).abi,f=(await t.artifact('ArcadeFamily')).abi;
const hubAbi=(await t.artifact('IInterludeHub')).abi;
let state:any;
try{state=JSON.parse(await readFile(secretPath,'utf8'));assert.equal(state.lobby,m.lobby);}
catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;state={lobby:m.lobby,issuedAt:Math.floor(Date.now()/1000),players:Array.from({length:4},()=>({root:generatePrivateKey(),arcade:generatePrivateKey()})),operations:{},matches:[],jobs:[],sessions:[]};}
let tail=Promise.resolve();const save=()=>{const data=JSON.stringify(state,(_,v)=>typeof v==='bigint'?String(v):v);tail=tail.then(async()=>{await writeFile(secretPath+'.next',data,{mode:0o600});await rename(secretPath+'.next',secretPath);});return tail;};
const report:any={at:new Date().toISOString(),productionMigrated:false,lobby:m.lobby,checks:[],arenas:[],rootGrantSignatures:4,measurements:[]};
await mkdir('artifacts/independent-candidate',{recursive:true});
const flush=()=>writeFile('artifacts/independent-candidate/qualification.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
const roots=state.players.map((p:any)=>privateKeyToAccount(p.root));
const keys=state.players.map((p:any)=>privateKeyToAccount(p.arcade));
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function call(player:number,name:string,method:string,args:any[]=[]){
 let op=state.operations[name];
 if(!op){
  const grant:any=await t.base.readContract({address:m.family,abi:f,functionName:'grantOf',args:[roots[player].address]});
  assert(grant.key.toLowerCase()===keys[player].address.toLowerCase(),'Registered family grant missing');
  const hash=await t.base.readContract({address:m.family,abi:f,functionName:'grantDigest',args:[grant]}) as Hex;
  const data=encodeFunctionData({abi:l,functionName:method,args});
  const nonce=await t.base.readContract({address:m.lobby,abi:l,functionName:'commandNonces',args:[hash]});
  const deadline=BigInt(Math.floor(Date.now()/1000)+120);
  const digest=await t.base.readContract({address:m.lobby,abi:l,functionName:'commandDigest',args:[hash,data,nonce,deadline]}) as Hex;
  const signature=await keys[player].sign({hash:digest});
  op=state.operations[name]={data:encodeFunctionData({abi:l,functionName:'relay',args:[roots[player].address,data,nonce,deadline,signature]})};await save();
 }
 return t.submit(`qualify-${name}`,op.data,m.lobby);
}
async function makeMatch(index:number,a:number,b:number,mode:number){
 let match=state.matches[index];
 if(!match){
  await call(a,`room-${index}`,'createRoom',[mode]);
  const room=await t.base.readContract({address:m.lobby,abi:l,functionName:'occupancy',args:[roots[a].address]});
  match=state.matches[index]={room:String(room),a,b,mode};await save();
 }
 await call(b,`join-${index}`,'joinRoom',[BigInt(match.room)]);
 await t.write(`qualify-propose-${index}`,m.lobby,l,'propose',[BigInt(match.room)]);
 if(!match.id){const room:any=await t.base.readContract({address:m.lobby,abi:l,functionName:'room',args:[BigInt(match.room)]});match.id=String(room.proposal);await save();}
 await call(a,`accept-${index}-a`,'acceptProposal',[BigInt(match.id)]);
 await call(b,`accept-${index}-b`,'acceptProposal',[BigInt(match.id)]);
 await t.write(`qualify-assign-${index}`,m.lobby,l,'assignNext');
 const app=await t.base.readContract({address:m.lobby,abi:l,functionName:'arenaOf',args:[BigInt(match.id)]}) as Address;
 assert.notEqual(app,'0x0000000000000000000000000000000000000000');match.app=app;await save();
 const validator=await t.base.readContract({address:m.hub,abi:hubAbi,functionName:'defaultValidator'});
 const terms:any=await t.base.readContract({address:m.hub,abi:hubAbi,functionName:'termsOf',args:[validator]});
 await t.write(`qualify-open-${index}`,m.lobby,l,'openArena',[BigInt(match.id)],terms.delegationFee);
 if(!match.node){
  // Persist the POST intent; an uncertain previous response only permits a GET lookup.
  const create=!match.hostRequested; if(create){match.hostRequested=new Date().toISOString();await save();}
  const response=await fetch(`https://control.interludelayer.xyz/sessions${create?'':'/'+app}`,{
    method:create?'POST':'GET',headers:{'content-type':'application/json'},...(create?{body:JSON.stringify({app})}:{}),signal:AbortSignal.timeout(60000)});
  const body=await response.json().catch(()=>null) as any;
  assert(response.ok&&typeof body?.url==='string',`Hosted ${create?'creation':'lookup'} HTTP ${response.status}`);
  if(body.app)assert.equal(body.app.toLowerCase(),app.toLowerCase());match.node=body.url;await save();
 }
 return match;
}
const clients:any[]=[],sessions:any[]=[],stops:Array<()=>void>=[];
async function engine(index:number){
 const match=state.matches[index],store=memoryStore();
 for(const s of state.sessions.filter((s:any)=>s.app===match.app))store.set(s.key,s.value);
 const client=createInterludeClient({app:match.app,abi,node:match.node,base:t.base,store,fastPath:true,transport:engineTransport(match.node,{
  async beforeSend(raw){const hash=keccak256(raw as Hex);const pending=state.jobs.find((j:any)=>j.app===match.app&&j.state==='uncertain');assert(!pending||pending.hash===hash,'Reconcile the exact pending command before signing');if(!pending){state.jobs.push({app:match.app,hash,raw,state:'uncertain'});await save();}},
  received(method,result){if(!['interlude_sendTransaction','eth_getTransactionReceipt'].includes(method)||!['0x0','0x1','success','reverted'].includes(String(result?.status)))return;const job=state.jobs.find((j:any)=>j.hash?.toLowerCase()===result.transactionHash?.toLowerCase());if(job){job.state=['0x1','success'].includes(result.status)?'confirmed':'reverted';void save();}}
 })});
 let ready=false;
 for(let n=0;n<40;n++){
  try{const status=await client.status();const binding:any=await client.read('boundMatch',[]);if(status.epoch>0&&BigInt(binding.epoch)===BigInt(status.epoch)&&String(binding.id)===match.id){ready=true;match.epoch=String(status.epoch);await save();break;}}
  catch{/* Read-only retry while the hosted image starts. */}await wait(5000);
 }
 assert(ready,`Hosted arena ${match.app} did not expose the prepared match and epoch`);
 const pair=[];
 for(const p of [match.a,match.b]){
  const session=await client.openSession({wallet:createWalletClient({account:keys[p],chain:monadTestnet,transport:http()}),scope:['input','tick','concede'],expirySeconds:Math.min(3600,state.issuedAt+7200-Math.floor(Date.now()/1000)),assertDigest:true});
  pair.push(session);const key=storageKey(match.app,10143,keys[p].address),value=store.get(key);
  const at=state.sessions.findIndex((x:any)=>x.key===key);const record={app:match.app,key,value};if(at<0)state.sessions.push(record);else state.sessions[at]=record;await save();
 }
 clients[index]=client;sessions[index]=pair;
 const row={app:match.app,node:match.node,epoch:match.epoch,id:match.id,appliedFrames:0};report.arenas.push(row);await flush();
 stops.push(new EngineStream(match.node,match.app,url=>new WebSocket(url,{origin:'https://pongit.xyz'}) as any).subscribe(()=>row.appliedFrames++));
 return client;
}
async function send(index:number,side:number,name:string,args:any[]){
 const result=await sessions[index][side].send(name,args);
 report.measurements.push({arena:index,method:name,ms:result.latencyMs,hash:result.hash});await flush();return result;
}
async function published(index:number){
 const c=clients[index],id=BigInt(state.matches[index].id),end=Date.now()+90000;
 const hash=await c.read('resultHashes',[id]);assert.notEqual(hash,'0x'+'0'.repeat(64));
 while(Date.now()<end){if(await c.readSettled('resultHashes',[id])===hash)return;await wait(2000);}
 throw Error('Terminal publication timed out');
}
try{
 await save();
 for(let i=0;i<4;i++){
  let op=state.operations[`grant-${i}`];
  if(!op){
   const g={player:roots[i].address,key:keys[i].address,issuedAt:BigInt(state.issuedAt),expires:BigInt(state.issuedAt+7200),revision:0n};
   const hash=await t.base.readContract({address:m.family,abi:f,functionName:'grantDigest',args:[g]}) as Hex;
   const signature=await roots[i].sign({hash});op=state.operations[`grant-${i}`]={data:encodeFunctionData({abi:f,functionName:'register',args:[g,signature]})};await save();
  }
  await t.submit(`qualify-grant-${i}`,op.data,m.family);
 }
 await makeMatch(0,0,1,0);await engine(0);report.checks.push('First contract-selected Classic match hosted');await flush();
 await makeMatch(1,2,3,1);await engine(1);report.checks.push('Second independent Chaos match hosted');await flush();
 for(let n=0;n<3;n++)for(let index=0;index<2;index++)for(let side=0;side<2;side++){
  const s:any=await clients[index].read('getSnapshot',[BigInt(state.matches[index].id)]);
  assert.equal(s[2],2n);await send(index,side,'input',[BigInt(state.matches[index].id),n%2?1:-1,s[side?10:9]+1n,s[7]+150n]);
 }
 await send(0,0,'concede',[BigInt(state.matches[0].id)]);await published(0);
 await t.write('qualify-close-0',m.lobby,l,'closeArena',[BigInt(state.matches[0].id)]);
 const s:any=await clients[1].read('getSnapshot',[BigInt(state.matches[1].id)]);assert.equal(s[2],2n);
 await send(1,0,'input',[BigInt(state.matches[1].id),0,s[9]+1n,s[7]+150n]);
 report.checks.push('Closing Classic does not interrupt Chaos');await flush();
 await call(0,'leave-first-a','leaveRoom');await call(1,'leave-first-b','leaveRoom');
 await makeMatch(2,0,1,0);await engine(2);
 await send(2,0,'input',[BigInt(state.matches[2].id),1,1n,(await clients[2].read('getSnapshot',[BigInt(state.matches[2].id)]))[7]+150n]);
 report.checks.push('Third match started during challenge using the same root arcade grants');await flush();
 for(const index of [1,2]){await send(index,0,'concede',[BigInt(state.matches[index].id)]);await published(index);await t.write(`qualify-close-${index}`,m.lobby,l,'closeArena',[BigInt(state.matches[index].id)]);}
 assert(report.arenas.every((a:any)=>a.appliedFrames>0),'Applied notifications missing');
 report.passed=true;
}catch(e){report.passed=false;report.error=String((e as any).shortMessage||(e as Error).message).split('Request Arguments')[0].replace(/0x[\da-f]{130,}/gi,'[hex omitted]').slice(0,700);process.exitCode=1;}
finally{for(const stop of stops)stop();await tail;report.finishedAt=new Date().toISOString();await flush();await t.close();console.log(JSON.stringify({passed:report.passed,error:report.error,checks:report.checks}));}
