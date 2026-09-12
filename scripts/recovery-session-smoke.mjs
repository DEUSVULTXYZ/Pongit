// Real zero-value follow-up with the existing disposable test grants. No new
// owner authorization and no financial operations are performed.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {monadTestnet} from 'viem/chains';
import {createInterludeClient,memoryStore,storageKey} from '@interludelayer-sdk/sdk';
import {roomsChaosAbi as abi} from '../shared/abi-PongRoomsTestnet.ts';
import {RoomsCommandJournal} from '../web/lib/rooms-command-journal.ts';
import {engineTransport} from '../shared/engine-transport.ts';
assert.equal(process.env.PONG_RECOVERY_SMOKE,'reuse-disposable-test-grants');
const file=process.env.PONG_RECOVERY_SMOKE_FILE;assert(file?.startsWith('/secrets/paid-chaos-'));
const record=JSON.parse(await readFile(file,'utf8'));assert.equal(record.bet?.status,'confirmed');
if(record.followup)assert.equal(process.env.PONG_RECOVERY_SMOKE_RETRY,'verify-unsubmitted');
const m=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const base=createPublicClient({chain:monadTestnet,transport:http('https://testnet-rpc.monad.xyz',{retryCount:0})});
const values=new Map(Object.entries(record.commands));const journal=new RoomsCommandJournal({getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},m.app,abi);
const players=[];let tail=Promise.resolve();
async function save(){for(let i=0;i<players.length;i++)record.players[i].stored=players[i].store.get(storageKey(m.app,10143,players[i].address));record.commands=Object.fromEntries(values);const bytes=json(record);tail=tail.then(async()=>{await writeFile(file+'.next',bytes,{mode:0o600});await rename(file+'.next',file);});await tail;}
const client=store=>createInterludeClient({app:m.app,node:m.node,abi,base,store,fastPath:true,transport:engineTransport(m.node,{async beforeSend(raw){await journal.beforeSend(raw);await save();},received(method,result){journal.received(method,result);void save();}})});
const observer=client(memoryStore());
async function api(p,path,body){const r=await fetch('https://pongit.xyz/api/interlude/'+path,{method:body===undefined?'GET':'POST',headers:{origin:'https://pongit.xyz','content-type':'application/json',cookie:p.cookie,'x-pongit-player':p.address},body:body===undefined?undefined:json({...body,operation:crypto.randomUUID()}),signal:AbortSignal.timeout(15000)});const d=await r.json();assert(r.ok,path+': '+String(d.error||r.status));return d;}
async function until(f,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){const x=await f();if(x)return x;await sleep(1500);}throw Error(label+' timed out');}
const report={at:new Date().toISOString(),app:m.app,checks:[],transactions:[],passed:false};
async function send(p,name,args){assert(!journal.pending(p.address),'Resolve the existing hash before another action');const r=await p.session.send(name,args);await save();report.transactions.push({action:name,hash:r.hash,ms:r.latencyMs});return r;}
try{
 await observer.status();
 assert.equal(await observer.read('activeCount',[]),0n);
 if(record.followup){
  const old=await observer.read('getSnapshot',[BigInt(record.followup.offer.id)]);assert.equal(old[2],0n,'Do not replace a previously submitted match');
  record.priorSmokeAttempts=[...(record.priorSmokeAttempts||[]),record.followup];delete record.followup;
 }
 for(const saved of record.players.slice(0,2)){
  const store=memoryStore();store.set(storageKey(m.app,10143,saved.address),saved.stored);
  const p={...saved,store,client:client(store)};delete p.ownerKey;players.push(p);
  p.session=await p.client.restoreSession(p.address);assert(p.session);await api(p,'state');
 }
 const [a,b]=players;record.followup={room:(await api(a,'rooms',{mode:0,players:[b.address]})).room};await save();
 await api(b,'rooms/join',{room:record.followup.room});
 const offer=await until(async()=>{const s=await api(a,'state');return s.room?.offer?.status==='offered'?s.room.offer:null;},'offer');record.followup.offer=offer;await save();
 const id=BigInt(offer.id);report.matchId=offer.id;
 for(const p of players){await api(p,'offers/accept',{id:offer.id});const r=await send(p,'acceptMatch',[{...offer,id,expires:BigInt(offer.expires),rules:BigInt(offer.rules)},offer.signature]);await api(p,'offers/accept',{id:offer.id,receiptHash:r.hash});}
 const initial=await observer.read('getSnapshot',[id]);
 await until(async()=>{const s=await observer.read('getSnapshot',[id]);return s[12].t>initial[12].t?s:null;},'VPS recovery tick');
 report.checks.push('Existing grants admitted another Classic match without an owner signature','New relayer observed and advanced the game');
 for(let i=0;i<4;i++)for(const p of players){const s=await observer.read('getSnapshot',[id]);if(s[2]!==2n)break;const left=p.address===offer.a.toLowerCase();await send(p,'input',[id,i%2?1:-1,s[left?9:10]+1n,s[7]+150n]);await sleep(250);}
 const terminal=await observer.read('getSnapshot',[id]);if(terminal[2]===2n)await send(a,'concede',[id]);
 await until(async()=>{const s=await observer.readSettled('getSnapshot',[id]);return s[2]===3n?s:null;},'publication');report.checks.push('Inputs and terminal publication succeeded after relayer restart');report.passed=true;
}catch(e){report.error=String(e.shortMessage||e.message).split('Request body')[0].slice(0,600);process.exitCode=1;}
finally{
 if(record.followup?.offer)try{const id=BigInt(record.followup.offer.id),s=await observer.read('getSnapshot',[id]);if(s[2]===1n||s[2]===2n)await send(players[0],s[2]===1n?'cancelMatch':'concede',[id]);}catch(e){report.cleanupError=String(e.shortMessage||e.message).split('Request body')[0].slice(0,300);}
 for(const p of players)try{await api(p,'rooms/leave',{});}catch{}
 await save();await writeFile('artifacts/paid-chaos/session-smoke.json',json(report));console.log(json(report));
}
