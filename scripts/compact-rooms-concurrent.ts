// Four disposable owners, two actual hosted games. No user accounts or bets.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createWalletClient,http,keccak256,toHex,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {createInterludeClient,memoryStore,storageKey,decodeSession} from '@interludelayer-sdk/sdk';
import {chainTools} from './independent-chain-tools';
import {roomsCompactAbi as abi} from '../shared/abi-PongRoomsCompact';
import {compactRoomsSession} from '../shared/compact-rooms-session';
import {RoomsCommandJournal} from '../web/lib/rooms-command-journal';
import {engineTransport} from '../shared/engine-transport';
import {EngineStream,engineTuple} from '../shared/engine-stream';
import {EngineFeed} from '../shared/engine-feed';
assert.equal(process.env.PONG_COMPACT_CONCURRENT,'authorized-testnet');
const file='/secrets/compact-concurrent-20260913.json';try{await readFile(file);throw Error('Reconcile the existing fixture');}catch(e){if((e as any).code!=='ENOENT')throw e;}
const m=JSON.parse(await readFile('artifacts/realtime/manifests.json','utf8')).game,t=await chainTools('compact-concurrent-20260913');
const json=(v:any)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const saved:any={players:[],journals:{}},report:any={at:new Date().toISOString(),app:m.app,scope:'Two real hosted games with disposable EOA owners; no browser or physical passkey',matches:[]};
const save=()=>writeFile(file,json(saved),{mode:0o600});
const observer=createInterludeClient({app:m.app,abi,node:m.node,base:t.base,store:memoryStore(),transport:engineTransport(m.node),fastPath:true});
const stream=new EngineStream(m.node,m.app),feed=new EngineFeed(observer,stream),stops:(()=>void)[]=[],players:any[]=[],games:any[]=[];
const admission=privateKeyToAccount(process.env.INTERLUDE_COORDINATOR_KEY as Hex);
try{
 assert.equal(await observer.read('activeCount'),0n);
 for(let i=0;i<4;i++){
  const owner=privateKeyToAccount(generatePrivateKey()),store=memoryStore();
  const journal=new RoomsCommandJournal({getItem:()=>saved.journals[i]||null,setItem:(_,s)=>saved.journals[i]=s},m.app,abi);
  const client=createInterludeClient({app:m.app,abi,node:m.node,base:t.base,store,transport:engineTransport(m.node,{beforeSend:async(raw)=>{await journal.beforeSend(raw);await save();},received:(method,result)=>journal.received(method,result)}),fastPath:true});
  await client.openSession({wallet:createWalletClient({account:owner,chain:monadTestnet,transport:http()}),scope:['acceptMatch','input','tick','cancelMatch','concede'],expirySeconds:1800,assertDigest:true});
  await client.status();const raw=store.get(storageKey(m.app,10143,owner.address)),stored=decodeSession(raw)!;
  journal.bindRoomControls(owner.address,stored.grant.sessionKey,1n,stored.grant.expiry);
  saved.players.push({owner:owner.address,stored:raw});await save();players.push({owner,client,journal,session:compactRoomsSession({node:client.node,abi,app:m.app,stored,epoch:1n}),changes:0,dir:0});
 }
 for(const mode of [0,1]){
  // Account for the candidate's real pending storage budget before admission.
  for(let i=0;i<120;i++){if((await observer.status()).pendingDiffs.length<24)break;await sleep(500);}
  const id=202609139000n+BigInt(mode),pair=players.slice(mode*2,mode*2+2);
  const offer={id,room:toHex(id,{size:32}),a:pair[0].owner.address,b:pair[1].owner.address,mode,ranked:true,expires:BigInt(Math.floor(Date.now()/1000)+25),rules:5n,entropy:keccak256(toHex('concurrent compact '+id))};
  const signature=await admission.sign({hash:await observer.read('ticketDigest',[offer]) as Hex});
  for(const p of pair)await p.session.send('acceptMatch',[offer,signature]);
  games.push({id,mode,pair});stops.push(feed.watch(id,()=>{}));await feed.read(id,true);
 }
 assert.equal(await observer.read('activeCount'),2n);report.simultaneous=true;
 const started=Date.now();
 while(Date.now()-started<150000){
  let active=0;
  for(const g of games){
   let s:any=engineTuple(await feed.read(g.id));if(s[2]===3n)continue;active++;
   for(let j=0;j<2;j++){
    const p=g.pair[j],position=j?s[12].right:s[12].left,dir=p.changes<100?(p.changes%2?1:-1):position>60000000n?-1:0;
    if(dir!==p.dir){const args=[g.id,dir,s[j?10:9]+1n,s[7]+150n],result=await p.session.send('input',args);s=engineTuple(await feed.receipt(g.id,result,'input',args,p.owner.address));p.dir=dir;p.changes++;if(s[2]!==2n)break;}
   }
   if(s[2]===2n&&g.pair.every((p:any)=>p.changes>=100)){const result=await g.pair[0].session.send('tick',[g.id]);await feed.receipt(g.id,result,'tick',[g.id],g.pair[0].owner.address);}
  }
  if(!active)break;await sleep(25);
 }
 for(const g of games){
  const live:any=await observer.read('getSnapshot',[g.id]);assert.equal(live[2],3n);
  for(let i=0;i<240;i++){if((await observer.readSettled('getSnapshot',[g.id]) as any)[2]===3n)break;await sleep(500);}
  const published:any=await observer.readSettled('getSnapshot',[g.id]);assert.equal(published[2],3n);assert.equal(published[6],live[6]);
  const ratings=await Promise.all(g.pair.map((p:any)=>observer.read('ratingOf',[p.owner.address,g.mode])));
  assert(ratings.every((r:any)=>r.played===1&&r.elo!==1000));
  report.matches.push({mode:g.mode,id:g.id,score:[live[12].scoreA,live[12].scoreB],changes:g.pair.map((p:any)=>p.changes),ratings,published:true});
  for(const p of g.pair){assert(!p.journal.pending(p.owner.address));await p.session.revoke();}
 }
 report.passed=true;
}catch(e){report.passed=false;report.error=String((e as any).shortMessage||(e as Error).message).split('\n')[0];}
finally{stops.forEach(stop=>stop());stream.stop();await save();await writeFile('artifacts/realtime/compact-concurrent.json',json(report));console.log(json(report));await t.close();if(!report.passed)process.exitCode=1;}
