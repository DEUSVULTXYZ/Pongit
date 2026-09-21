// Real hosted, deliberately interrupted private match. This verifies the 30-minute
// technical-cancellation bound, NOT continuous availability or a natural finish.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,encodeAbiParameters,keccak256,type Abi,type Address,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {publicIndependentManifest,type FamilyGrant,lobbyCommandTypes} from '../shared/independent';
import {independentRules,independentControlArgs} from '../shared/independent-rules';
import {independentReader} from '../shared/independent-read';
import {familyGrantHash,lobbyCommandContext} from '../shared/independent-command';
import {abi as familyAbi} from '../shared/abi-independent-ArcadeFamily';
import {compactArenaSession} from '../shared/compact-arena-session';
import {engineTransport} from '../shared/engine-transport';
import {readEngineSnapshot} from '../shared/engine-snapshot';
import {engineState} from '../shared/engine-stream';
import {measuredFetch,rpcSamples} from '../shared/rpc-metrics';

assert.equal(process.env.PONG_HUMAN_LONG_GAP_TEST,'private-service-interruption');
const raw=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));
assert.equal(raw.production,false);assert.equal(raw.rulesVersion,14);assert.equal(raw.countdownClock,'engine-ticks-v1');
const run=process.env.PONG_LONG_GAP_RUN!;assert(/^[a-z0-9-]{1,24}$/.test(run));
const out=`artifacts/independent-candidate/long-gap-${run}.json`,secret=`/secrets/long-gap-${run}.json`;
const paused=`/secrets/long-gap-${run}.paused`;
try{await readFile(secret);throw Error('Preserve and reconcile the original private run');}catch(e){if((e as any).code!=='ENOENT')throw e;}
const m=publicIndependentManifest(raw),rules=independentRules(m);
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,fetchFn:measuredFetch('monad')})}),r=independentReader(base,m);
const api='http://independent-events-service:4012/independent';
const state:any={lobby:m.lobby,players:Array.from({length:2},()=>({owner:generatePrivateKey(),key:generatePrivateKey()})),jobs:[]};
const owners=state.players.map((p:any)=>privateKeyToAccount(p.owner)),keys=state.players.map((p:any)=>privateKeyToAccount(p.key));
const report:any={startedAt:new Date().toISOString(),lobby:m.lobby,passed:false,scope:'Actual engine clock, private service interruption, technical cancellation, publication and participation recovery; no continuous-gameplay claim'};
const json=(x:unknown)=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v,2);
let saved=Promise.resolve();const persist=()=>{const text=json(state);saved=saved.then(async()=>{await writeFile(secret+'.next',text,{mode:0o600});await rename(secret+'.next',secret);});return saved;};
const flush=async()=>{report.rpc=rpcSamples();await writeFile(out+'.next',json(report));await rename(out+'.next',out);};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until<T>(fn:()=>Promise<T>,label:string,timeout=180000):Promise<NonNullable<T>>{
 const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await fn();if(value)return value as NonNullable<T>;await sleep(750);}throw Error('Timeout: '+label);
}
async function request(path:string,body?:unknown){
 const response=await fetch(api+path,{...(body?{method:'POST',headers:{'content-type':'application/json'},body:json(body)}:{}),signal:AbortSignal.timeout(12000)});
 assert(response.ok,'Private API unavailable');return response.json() as Promise<any>;
}
async function submit(to:Address,data:Hex){
 const id=keccak256(encodeAbiParameters([{type:'address'},{type:'bytes'},{type:'uint256'},{type:'string'}],[to,data,0n,'']));
 state.jobs.push({id,to,data,status:'uncertain'});await persist();assert.equal((await request('/transactions',{to,data})).id,id);
 const op=await until(async()=>{const op=await request('/operations/'+id);assert.notEqual(op.status,'failed');return op.status==='confirmed'?op:null;},'sponsored operation');
 state.jobs.find((j:any)=>j.id===id).status='confirmed';await persist();return op;
}
const grants:FamilyGrant[]=[];
async function command(i:number,name:string,args:readonly unknown[]){
 const {hash,nonce,deadline}=await lobbyCommandContext(base,m,grants[i]);
 const data=encodeFunctionData({abi:rules.lobby as Abi,functionName:name,args});
 const signature=await keys[i].signTypedData({domain:{name:'PONGIT Independent Lobby',version:'1',chainId:10143,verifyingContract:m.lobby},types:lobbyCommandTypes,primaryType:'LobbyCommand',message:{grantHash:hash,dataHash:keccak256(data),nonce,deadline}});
 return submit(m.lobby,encodeFunctionData({abi:rules.lobby,functionName:'relay',args:[owners[i].address,data,nonce,deadline,signature]}));
}
try{
 await mkdir('artifacts/independent-candidate',{recursive:true});await persist();await flush();assert.equal(await base.getChainId(),10143);
 assert.equal((await request('/config')).manifest.lobby.toLowerCase(),m.lobby.toLowerCase());
 const issued=(await base.getBlock()).timestamp;
 for(let i=0;i<2;i++){
  const grant={player:owners[i].address,key:keys[i].address,issuedAt:issued,expires:issued+7200n,revision:0n};grants.push(grant);
  const hash=familyGrantHash(m,grant);assert.equal(hash,await r.family('grantDigest',[grant]));
  await submit(m.family,encodeFunctionData({abi:familyAbi,functionName:'register',args:[grant,await owners[i].sign({hash})]}));
 }
 await command(0,'createRoom',[1]);const room=await r.lobby('occupancy',[owners[0].address]);await command(1,'joinRoom',[room]);
 const id=await until(async()=>(await r.lobby('room',[room])).proposal||null,'proposal');
 await Promise.all([command(0,'acceptProposal',[id]),command(1,'acceptProposal',[id])]);
 const app=await until(async()=>{const v=await r.lobby('arenaOf',[id]);return /^0x0{40}$/i.test(v)?null:v;},'assignment');
 const arena=m.arenas.find(a=>a.app.toLowerCase()===app.toLowerCase());assert(arena);
 const binding=await until(async()=>{const v=(await r.lobby('ticketOf',[id]))[1];return v.epoch?v:null;},'admission');
 const epoch=binding.epoch,node=createPublicClient({transport:engineTransport(arena.node!)});
 const snapshot=async()=>engineState(await readEngineSnapshot({app,abi:rules.arena,node:node as any},id));
 const senders=state.players.map((p:any,i:number)=>compactArenaSession({node:createPublicClient({transport:engineTransport(arena.node!,{
  async beforeSend(raw){const hash=keccak256(raw as Hex);const pending=state.jobs.find((j:any)=>j.signer===keys[i].address&&j.status==='uncertain');assert(!pending||pending.hash===hash);if(!pending)state.jobs.push({app,epoch:String(epoch),id:String(id),signer:keys[i].address,raw,hash,status:'uncertain'});await persist();},
  received(method,result){if(!['interlude_sendTransaction','eth_getTransactionReceipt'].includes(method))return;const j=state.jobs.find((j:any)=>j.hash===result?.transactionHash);if(j&&['0x1','0x0','success','reverted'].includes(String(result.status))){j.status=['0x1','success'].includes(String(result.status))?'confirmed':'reverted';void persist();}}
 })}),app,abi:rules.arena,key:p.key,match:id,epoch,expires:grants[i].expires}));
 await until(async()=>{try{return (await snapshot()).phase===1;}catch{return false;}},'hosted loading');
 for(const sender of senders)await sender.send('confirmReady',independentControlArgs(14,epoch,[id]));
 const initial=await until(async()=>{const s=await snapshot();return s.phase===2?s:null;},'playing');
 state.match={app,id,epoch};await persist();
 report.match={app,id,epoch};report.initial={head:initial.head,clock:initial.clock,t:initial.state.t};report.pauseRequestedAt=new Date().toISOString();await flush();
 await until(async()=>{try{const marker=JSON.parse(await readFile(paused,'utf8'));assert.equal(marker.lobby.toLowerCase(),m.lobby.toLowerCase());assert.equal(marker.serviceStopped,true);return marker;}catch(e){if((e as any).code==='ENOENT')return null;throw e;}},'operator stops ONLY isolated service');
 report.pausedAt=new Date().toISOString();await flush();
 // Absolute real engine time. No mocked timestamp, overwritten state or replay.
 const deadline=Date.now()+32*60_000;let frozen=await snapshot();report.frozenRevision=frozen.revision;
 while(frozen.clock<=1_800_000_000n){
  assert(Date.now()<deadline,'Real engine clock did not advance within 32 minutes');assert.equal(frozen.phase,2);assert.equal(frozen.revision,report.frozenRevision,'Another writer progressed this deliberately isolated fixture');
  report.observedAt=new Date().toISOString();report.observedClock=frozen.clock;await flush();await sleep(10000);frozen=await snapshot();
 }
 assert.equal(frozen.phase,2);assert.equal(frozen.revision,report.frozenRevision);
 const sent=await senders[0].send('tick',independentControlArgs(14,epoch,[id]));
 const terminal=await snapshot();assert.equal(terminal.phase,4);assert.equal(terminal.winner.toLowerCase(),'0x'+'0'.repeat(40));
 report.cancellation={hash:sent.hash,clock:terminal.clock,t:terminal.state.t,phase:terminal.phase};report.resumeRequestedAt=new Date().toISOString();await flush();
 const entry=await until(async()=>{if(!await r.ratings('indexOf',[id]))return null;return (await r.ratings('entry',[id])).latest;},'published cancellation captured after isolated service restart',600000);
 assert.equal(entry.status,4);assert.equal(entry.id,id);assert.equal(entry.epoch,epoch);
 await until(async()=>(await r.lobby('reservedMatch',[app]))===0n,'arena released from match');
 for(const owner of owners){const rating=await r.ratings('ratingOf',[owner.address,1]);assert.equal(rating.played,0);}
 assert(!state.jobs.some((j:any)=>j.status==='uncertain'));report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{130,}/gi,'[omitted]').slice(0,350);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await persist();await flush();console.log(json({out,passed:report.passed,error:report.error}));}
