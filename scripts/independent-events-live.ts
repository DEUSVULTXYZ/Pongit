// Real hosted versioned events service qualification with disposable synthetic owners.
// This is not a physical passkey/browser test. All signed bytes stay private.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,encodeAbiParameters,keccak256,parseEther,parseTransaction,type Abi,type Address,type Hex} from 'viem';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import WebSocket from 'ws';
import {publicIndependentManifest,independentCreditMessage} from '../shared/independent';
import {independentRules} from '../shared/independent-rules';
import {independentReader} from '../shared/independent-read';
import {abi as familyAbi} from '../shared/abi-independent-ArcadeFamily';
import {EngineFeed} from '../shared/engine-feed';
import {EngineStream} from '../shared/engine-stream';
import {engineTransport} from '../shared/engine-transport';
import {compactArenaSession} from '../shared/compact-arena-session';
import {readHubDelegation} from '../shared/rooms-hub';
import {betTypes,domain} from '../shared/protocol';

assert.equal(process.env.PONG_INDEPENDENT_EVENTS_QUALIFICATION,'isolated-vps');
const raw=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));
assert.equal(raw.production,false);assert([12,13].includes(raw.rulesVersion));assert.equal(raw.status,'sealed');
const m=publicIndependentManifest(raw),rules=independentRules(m),base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:12000})}),r=independentReader(base,m);
const run=process.env.PONG_EVENTS_RUN??'1';assert(/^[1-9][0-9]?$/.test(run));
const secret=`/secrets/events-live-${run}.json`,out=`artifacts/independent-candidate/events-live-${run}.json`;
try{await readFile(secret);throw Error('Preserve and reconcile the previous fixture before a new run');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const api='http://independent-events-service:4012/independent';
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2);
const privateState:any={lobby:m.lobby,createdAt:new Date().toISOString(),players:Array.from({length:5},()=>({owner:generatePrivateKey(),arcade:generatePrivateKey()})),operations:{},jobs:[],matches:[]};
const report:any={at:new Date().toISOString(),rules:m.rulesVersion,lobby:m.lobby,scope:'Actual private service, Monad and hosted Interlude; synthetic owners, no physical passkey claim',matches:[],checks:[],operations:[],passed:false};
let tail=Promise.resolve();const save=()=>{const text=json(privateState);tail=tail.then(async()=>{await writeFile(secret+'.next',text,{mode:0o600});await rename(secret+'.next',secret);});return tail;};
await mkdir('artifacts/independent-candidate',{recursive:true});const flush=()=>writeFile(out,json(report));
const owners=privateState.players.map((p:any)=>privateKeyToAccount(p.owner)),keys=privateState.players.map((p:any)=>privateKeyToAccount(p.arcade));
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until<T>(fn:()=>Promise<T>,label:string,timeout=120000):Promise<NonNullable<T>>{
 const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value as NonNullable<T>;await sleep(750);}throw Error('Timeout: '+label);
}
async function request(path:string,body?:unknown){
 const response=await fetch(api+path,{...(body?{method:'POST',headers:{'content-type':'application/json'},body:json(body)}:{}),signal:AbortSignal.timeout(30000)});
 const value=await response.json() as any;
 assert(response.ok,`Private API ${path} HTTP ${response.status}: ${value.code??'unavailable'}`);return value;
}
async function operation(id:Hex){return until(async()=>{const v=await request('/operations/'+id);assert.notEqual(v.status,'failed','Confirmed sponsor revert');return v.status==='confirmed'?v:null;},'sponsored operation');}
async function submit(name:string,to:Address,data:Hex){
 const id=keccak256(encodeAbiParameters([{type:'address'},{type:'bytes'},{type:'uint256'},{type:'string'}],[to,data,0n,'']));
 privateState.operations[name]={id,to,data};await save();
 const result=await request('/transactions',{to,data});assert.equal(result.id,id);
 const done=await operation(id);report.operations.push({name,id,hash:done.hash});await flush();return done;
}
async function command(player:number,name:string,method:string,args:readonly unknown[]=[]){
 const grant=await r.family('grantOf',[owners[player].address]),hash=await r.family('grantDigest',[grant]);
 const data=encodeFunctionData({abi:rules.lobby as Abi,functionName:method,args}),nonce=await r.lobby('commandNonces',[hash]),deadline=(await base.getBlock()).timestamp+120n;
 const digest=await r.lobby('commandDigest',[hash,data,nonce,deadline]),signature=await keys[player].sign({hash:digest});
 return submit(name,m.lobby,encodeFunctionData({abi:rules.lobby,functionName:'relay',args:[owners[player].address,data,nonce,deadline,signature]}));
}
async function prepare(mode:0|1){
 const a=mode*2,b=a+1;
 await command(a,`room-${mode}`,'createRoom',[mode]);const room=await r.lobby('occupancy',[owners[a].address]);
 await command(b,`join-${mode}`,'joinRoom',[room]);
 const proposal=await until(async()=>{const v=await r.lobby('room',[room]);return v.proposal||null;},'contract room proposal');
 await command(a,`accept-${mode}-a`,'acceptProposal',[proposal]);await command(b,`accept-${mode}-b`,'acceptProposal',[proposal]);
 const app=await until(async()=>{const v=await r.lobby('arenaOf',[proposal]);return /^0x0{40}$/i.test(v)?null:v;},'contract arena assignment');
 const arena=m.arenas.find(x=>x.app.toLowerCase()===app.toLowerCase());assert(arena);
 const binding=await until(async()=>{const v=await r.arena(app,'boundMatch');return v.epoch&&v.id===proposal?v:null;},'real delegation admission',180000);
 const record={app,epoch:String(binding.epoch),id:String(proposal),a,b,mode};privateState.matches.push(record);await save();
 return {...record,id:proposal,epoch:binding.epoch,node:arena.node!,binding};
}
const stops:Array<()=>void>=[];
async function play(match:Awaited<ReturnType<typeof prepare>>){
 const {app,id,epoch,mode}=match,row:any={app,id,epoch,mode,changes:[0,0],scores:[],effects:[],inputs:[],frames:0,countdown:[],startedAt:new Date().toISOString()};report.matches.push(row);await flush();
 const observer=createPublicClient({transport:engineTransport(match.node),pollingInterval:1000}),stream=new EngineStream(match.node,app,url=>new WebSocket(url,{origin:'https://pongit.xyz'}) as any);
 const feed=new EngineFeed({node:observer,app,abi:rules.arena},stream);stops.push(feed.watch(id,()=>row.frames++),()=>stream.stop());
 await until(async()=>{try{const s:any=await observer.request({method:'interlude_session',params:[]} as any);return String(s.epoch)===String(epoch)&&s.app.toLowerCase()===app.toLowerCase();}catch{return false;}},'hosted engine identity',240000);
 assert.equal(await observer.readContract({address:app,abi:rules.arena,functionName:'RULES_VERSION'}),BigInt(m.rulesVersion!));
 const d=await readHubDelegation(base,m.hub,app);assert.equal(d.epoch,epoch);assert.equal(d.status,1);
 const players=[match.a,match.b].map(index=>{
  const transport=engineTransport(match.node,{
   async beforeSend(raw){
    const tx=parseTransaction(raw as Hex),hash=keccak256(raw as Hex),signer=keys[index].address;
    assert.equal(tx.to?.toLowerCase(),app.toLowerCase());assert.equal(tx.chainId,4242);assert.equal(tx.value??0n,0n);
    const pending=privateState.jobs.find((j:any)=>j.app===app&&j.signer===signer&&j.state==='uncertain');assert(!pending||pending.hash===hash,'Reconcile the exact earlier command');
    if(!pending)privateState.jobs.push({app,epoch:String(epoch),id:String(id),signer,nonce:tx.nonce,hash,raw,state:'uncertain'});await save();
   },
   received(method,result){if(!['interlude_sendTransaction','eth_getTransactionReceipt'].includes(method))return;const j=privateState.jobs.find((j:any)=>j.hash===result?.transactionHash);
    if(j&&['0x1','0x0','success','reverted'].includes(String(result.status))){j.state=['0x1','success'].includes(String(result.status))?'confirmed':'reverted';void save();}}
  });
  const node=createPublicClient({transport});return {index,node,session:compactArenaSession({node,abi:rules.arena,app,key:privateState.players[index].arcade,match:id,expires:BigInt(privateState.expires)}),direction:0};
 });
 if(m.rulesVersion===13){
  for(const p of players){const receipt=await p.session.send('confirmReady',[id]);await feed.receipt(id,receipt,'confirmReady',[id],keys[p.index].address);}
  row.readinessConfirmed=true;
 }
 let firstPlaying=0,lastTick=0,lastScore='',money:Promise<void>|undefined,moneyError:unknown,bought=false;
 const started=Date.now(),end=started+240000;
 async function bet(){
  const window=await until(async()=>{const w=await base.readContract({address:m.settlement,abi:rules.settlement,functionName:'bettingWindow',args:[id,0n]}) as readonly [boolean,bigint];return w[0]?w:null;},'realtime market');
  const bettor=owners[4],expires=Number((await base.getBlock()).timestamp)+120;
  const credit=await request('/credit',{player:bettor.address,expires,signature:await bettor.signMessage({message:independentCreditMessage(bettor.address,m.vault,expires)})});await operation(credit.id);
  for(const side of [0,1]){
   const nonce=await base.readContract({address:m.market,abi:rules.market,functionName:'nonces',args:[bettor.address]}) as bigint;
   const value={player:bettor.address,matchId:id,side,shares:parseEther('.006'),maxCost:parseEther('.012'),version:window[1],nonce,deadline:(await base.getBlock()).timestamp+120n};
   const signature=await bettor.signTypedData({domain:domain('PONG Market',10143,m.market),types:betTypes,primaryType:'Bet',message:value});
   await submit(`bet-${side}`,m.market,encodeFunctionData({abi:rules.market,functionName:'buy',args:[value,signature]}));
   if(side===0)await until(async()=>{const q=await observer.readContract({address:app,abi:rules.arena,functionName:'queuedPressure',args:[id]}) as readonly bigint[];row.pressureDelivered=q[0]>0n;return row.pressureDelivered;},'confirmed bet transported to game');
  }
  bought=true;row.betsConfirmed=true;
 }
 while(Date.now()<end){
  if(moneyError)throw moneyError;
  const s=await feed.read(id);
  assert.equal(s.id,id);const score=`${s.state.scoreA}-${s.state.scoreB}`;
  if(score!==lastScore){row.scores.push({at:new Date().toISOString(),score,t:String(s.state.t)});lastScore=score;await flush();}
  if(s.phase===1){
   const launch=await observer.readContract({address:app,abi:rules.arena,functionName:'launchAt',args:[id]}) as bigint;
   const now=(await observer.getBlock()).timestamp;row.countdown.push({launch,now});
   if(launch>now)assert.equal(s.state.t,0n,'Countdown advanced physical time');
   await sleep(250);continue;
  }
  if(s.phase>=3){assert.equal(s.phase,3,'Technical cancellation is not a passing match');row.finalScore=[s.state.scoreA,s.state.scoreB];row.winner=s.winner;break;}
  if(!firstPlaying)firstPlaying=Date.now();
  assert.equal(s.state.awaitingServe,false,'Realtime Chaos paused for betting');
  if(mode&&!money)money=bet().catch(e=>{moneyError=e;});
  for(const e of s.chaos?.physics.effects??[])if(e.id&&!row.effects.includes(e.id))row.effects.push(e.id);
  await Promise.all(players.map(async(p,side)=>{
   const current=await feed.read(id);if(current.phase!==2)return;
   const v=current.state,position=side?v.right:v.left;
   let target=50000000n;
   if(Date.now()-firstPlaying<50000||mode&&!bought){
    const plane=side?984000000n:40000000n,dt=v.vx===0n?0n:(plane-v.x)*1000000n/v.vx;
    let y=v.y+(dt>0n?v.vy*dt/1000000n:0n)-6000000n;const period=1128000000n;y=((y%period)+period)%period;target=6000000n+(y>564000000n?period-y:y);
   }
   const direction=row.changes[side]<100?(row.changes[side]%2?1:-1):position<target-8000000n?1:position>target+8000000n?-1:0;
   if(direction===p.direction)return;
   const args=[id,direction,(side?current.nonceB:current.nonceA)+1n,current.head+150n],at=performance.now();
   try{const receipt=await p.session.send('input',args);await feed.receipt(id,receipt,'input',args,keys[p.index].address);row.inputs.push({side,ms:performance.now()-at,hash:receipt.hash});row.changes[side]++;p.direction=direction;lastTick=Date.now();}
   catch(e){const fresh=await feed.read(id,true);if((e as any).name==='AppRevertError'&&fresh.phase===3)return;throw e;}
  }));
  const fresh=await feed.read(id);
  if(fresh.phase===2&&Date.now()-lastTick>=300){const receipt=await players[0].session.send('tick',[id]);await feed.receipt(id,receipt,'tick',[id],keys[match.a].address);lastTick=Date.now();}
  await sleep(row.changes.some((n:number)=>n<100)?40:150);
 }
 if(money)await money;if(moneyError)throw moneyError;
 assert(row.finalScore&&Math.max(...row.finalScore)===7,'Natural seventh point not reached');assert(row.changes.every((n:number)=>n>=100),'100 confirmed direction changes required per player');
 const published=await until(async()=>{const v=await r.arena(app,'publishedResult');return v.status===3?v:null;},'result publication');
 assert.equal(published.winner.toLowerCase(),row.winner.toLowerCase());assert.deepEqual([published.scoreA,published.scoreB],row.finalScore);
 await until(async()=>await r.ratings('indexOf',[id]),'common contract capture');
 if(mode){
  assert(bought&&row.pressureDelivered);
  const bettor=owners[4],payoutId=await base.readContract({address:m.market,abi:rules.market,functionName:'payoutId',args:[0,id,bettor.address]}) as Hex;
  const payout:any=await until(async()=>{const p:any=await base.readContract({address:m.market,abi:rules.market,functionName:'payouts',args:[payoutId]});return p[2]===2?p:null;},'automatic beneficiary payout',180000);
  assert.equal(payout[1],parseEther('.006'));assert.equal(await base.getBalance({address:bettor.address}),payout[1]);row.payment={id:payoutId,amount:payout[1],beneficiary:bettor.address};
 }
 assert(!privateState.jobs.some((j:any)=>j.app===app&&j.state==='uncertain'));
 row.finishedAt=new Date().toISOString();row.passed=true;await flush();return match;
}
const tasks:Promise<unknown>[]=[];
try{
 await save();assert.equal((await request('/config')).manifest.lobby.toLowerCase(),m.lobby.toLowerCase());
 const issued=(await base.getBlock()).timestamp;privateState.expires=String(issued+7200n);await save();
 for(let i=0;i<4;i++){
  const grant={player:owners[i].address,key:keys[i].address,issuedAt:issued,expires:issued+7200n,revision:0n};
  const signature=await owners[i].sign({hash:await r.family('grantDigest',[grant])});
  await submit(`register-${i}`,m.family,encodeFunctionData({abi:familyAbi,functionName:'register',args:[grant,signature]}));
 }
 for(const mode of [0,1] as const){const match=await prepare(mode);const task=play(match);task.catch(()=>{});tasks.push(task);}
 await Promise.all(tasks);report.checks.push('Two independently admitted real Classic/Chaos matches, natural results, contract capture and realtime payout');report.passed=true;
}catch(e){report.error=String((e as any).shortMessage||(e as Error).message).split('\n')[0].replace(/0x[\da-f]{130,}/gi,'[signed bytes omitted]').slice(0,500);process.exitCode=1;await Promise.allSettled(tasks);}
finally{stops.forEach(fn=>fn());report.finishedAt=new Date().toISOString();await save();await flush();console.log(json({passed:report.passed,error:report.error,matches:report.matches.map((x:any)=>({app:x.app,id:x.id,mode:x.mode,score:x.finalScore,changes:x.changes,passed:x.passed}))}));}
