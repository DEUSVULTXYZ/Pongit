// Authorized testnet check. Real coordinator and engine, disposable unfunded identities.
// This never enters the public matchmaking queue or signs a financial transaction.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createPublicClient,createWalletClient,http,decodeFunctionData,parseTransaction,decodeEventLog} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {createInterludeClient,memoryStore,decodeSession,storageKey,delegatableAbi} from '@interludelayer-sdk/sdk';
import {readFile,mkdir,writeFile,unlink} from 'node:fs/promises';
import {roomsChaosAbi as abi} from '../shared/abi-PongRoomsTestnet.ts';
assert.equal(process.env.STREAM_LIVE_TEST,'authorized-testnet');
const manifest=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
const origin='https://pongit.xyz',web=process.env.TEST_WEB_HOST,transport=process.env.STREAM_TEST||'events';
const out=`artifacts/stream-live/${transport}`,privateFile='/tmp/pongit-stream-live-recovery.json';
const stringify=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
const base=createPublicClient({chain:monadTestnet,transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:8000})});
const makeClient=store=>createInterludeClient({app:manifest.app,abi,node:manifest.node,base,store,transport:http(manifest.node,{retryCount:0,timeout:5000}),fastPath:true});
const observer=makeClient(memoryStore()),players=[],rooms=[],pages=[],stats=[];
const report={at:new Date().toISOString(),app:manifest.app,endpoint:manifest.node,transport,network:'Real browser-to-engine and public coordinator; disposable friendly rooms; no bets',transactions:[],errors:[],checks:[]};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p,path,body){
 const response=await fetch(origin+'/api/interlude/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'content-type':'application/json',...(p.cookie?{cookie:p.cookie,'x-pongit-player':p.address}:{})},body:body===undefined?undefined:stringify(body),signal:AbortSignal.timeout(15000)});
 if(response.headers.get('set-cookie'))p.cookie=response.headers.get('set-cookie').split(';')[0];
 const data=await response.json();assert(response.ok,path+': '+String(data.error||response.status));return data;
}
const action=(p,path,body={})=>api(p,path,{...body,operation:crypto.randomUUID()});
async function until(fn,label,ms=45000){const start=Date.now();while(Date.now()-start<ms){const v=await fn();if(v)return v;await sleep(500);}throw Error('Timed out: '+label);}
async function saveRecovery(){await writeFile(privateFile,stringify({players:players.map(p=>({address:p.address,stored:p.store.get(storageKey(manifest.app,10143,p.address)),cookie:p.cookie})),rooms}),{mode:0o600});}
async function attach(p,index,room){
 const context=await browser.newContext({viewport:index%2?{width:390,height:844}:{width:1440,height:1000}});
 const stored=p.store.get(storageKey(manifest.app,10143,p.address));assert(stored);
 await context.addInitScript(({stored,key,accountKey,address})=>{
  if(!sessionStorage.getItem(key))sessionStorage.setItem(key,stored);sessionStorage.setItem(accountKey,address);
  localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'}));
  window.__frames=[];let previous=performance.now();const frame=t=>{if(!document.hidden&&window.__frames.length<18000)window.__frames.push(t-previous);previous=t;requestAnimationFrame(frame);};requestAnimationFrame(frame);
 },{stored,key:storageKey(manifest.app,10143,p.address),accountKey:`pongit:rooms:${manifest.app}:account`,address:p.address});
 await context.addCookies([{name:'pongit_rooms',value:p.cookie.split('=')[1],url:origin,httpOnly:true,secure:true,sameSite:'Strict'}]);
 const row={player:index,role:index<4?'player':'spectator',calls:[],events:0,sockets:0,nonces:[],complete:false};stats.push(row);
 if(web)await context.route(origin+'/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/interlude/config'){const response=await route.fetch();const body=await response.json();return route.fulfill({response,json:{...body,stateTransport:transport}});}
  if(u.pathname.startsWith('/api/'))return route.continue();
  const response=await route.fetch({url:'http://'+web+':3000'+u.pathname+u.search});return route.fulfill({response});
 });
 const page=await context.newPage();pages.push(page);p.page=page;
 page.on('pageerror',e=>report.errors.push(e.message.slice(0,300)));
 page.on('requestfinished',async req=>{if(req.url()!==manifest.node&&req.url()!==manifest.node+'/')return;try{
  const rpc=req.postDataJSON(),response=await req.response(),t=req.timing();let name,nonce;
  if(rpc.method==='interlude_sendTransaction'){const wrapped=decodeFunctionData({abi:delegatableAbi,data:parseTransaction(rpc.params[0]).data});const call=decodeFunctionData({abi,data:wrapped.args[2]});name=call.functionName;if(name==='input'){nonce=String(call.args[2]);row.nonces.push(nonce);}}
  const headers=await response.allHeaders();row.calls.push({at:Date.now(),method:rpc.method,action:name,status:response.status(),ms:t.responseEnd-t.requestStart,requestId:headers['fly-request-id'],retryAfter:headers['retry-after']});
 }catch{}});
 page.on('websocket',socket=>{if(!socket.url().startsWith(manifest.node.replace('https:','wss:')))return;row.sockets++;
  socket.on('framereceived',({payload})=>{try{const x=JSON.parse(String(payload)).params?.result;if(!x?.succeeded)return;row.events++;for(const l of x.logs||[])try{const e=decodeEventLog({abi,data:l.data,topics:l.topics});if(e.eventName==='Completed'&&String(e.args.id)===room.offer.id)row.complete=true;}catch{}}catch{}});
 });
 await page.goto(origin+'/rooms/'+room.id);await page.locator('.rooms-court').waitFor({timeout:30000});
 if(index<4)await page.waitForFunction(()=>!document.querySelector('[aria-label="Move up"]')?.disabled,{},{timeout:30000});
 return page;
}
await mkdir(out,{recursive:true});
try{
 assert.equal(await observer.read('activeCount',[]),0n,'Only run when no existing game is active');
 for(let i=0;i<6;i++){
  const owner=privateKeyToAccount(generatePrivateKey()),store=memoryStore(),client=makeClient(store);
  const session=await client.openSession({wallet:createWalletClient({account:owner,chain:monadTestnet,transport:http()}),scope:['acceptMatch','input','tick','cancelMatch','concede'],assertDigest:true,expirySeconds:1200});
  const saved=decodeSession(store.get(storageKey(manifest.app,10143,owner.address))),p={address:owner.address.toLowerCase(),client,session,store,cookie:''};players.push(p);
  const c=await api(p,'auth/challenge',{player:p.address});
  await api(p,'auth/session',{player:p.address,nonce:c.nonce,signature:await privateKeyToAccount(saved.privateKey).signMessage({message:c.message}),grant:saved.grant,grantSignature:saved.signature});await saveRecovery();
 }
 for(const mode of [0,1]){
  const [a,b]=players.slice(mode*2,mode*2+2),id=(await action(a,'rooms',{mode,players:[b.address,players[4+mode].address]})).room;
  const r={id,offer:null};rooms.push(r);await saveRecovery();await action(b,'rooms/join',{room:id});
  r.offer=await until(async()=>{const s=await api(a,'state');return s.room?.offer?.status==='offered'?s.room.offer:null;},'offer '+mode);await saveRecovery();
  for(const p of [a,b]){
   await action(p,'offers/accept',{id:r.offer.id});const offer={...r.offer,id:BigInt(r.offer.id),expires:BigInt(r.offer.expires),rules:BigInt(r.offer.rules)};
   const result=await p.session.send('acceptMatch',[offer,r.offer.signature]);report.transactions.push({action:'accept',mode,hash:result.hash,ms:result.latencyMs});
   await action(p,'offers/accept',{id:r.offer.id,receiptHash:result.hash});
  }
  await action(players[4+mode],'rooms/join',{room:id});
 }
 assert.equal(await observer.read('activeCount',[]),2n);report.checks.push('Two simultaneous consensual friendly arenas: Classic and Chaos');
 for(let i=0;i<6;i++)await attach(players[i],i,rooms[i<4?Math.floor(i/2):i-4]);
 const began=Date.now();report.measurementStartedAt=new Date(began).toISOString();
 let cycle=0;
 while(Date.now()-began<65000 && stats.slice(0,4).some(s=>s.nonces.length<100&&!s.complete)){
  const key=cycle++%2?'ArrowUp':'ArrowDown';
  await Promise.all(pages.slice(0,4).map(p=>p.keyboard.down(key)));await sleep(140);
  await Promise.all(pages.slice(0,4).map(p=>p.keyboard.up(key)));await sleep(140);
  if(stats.some(s=>s.calls.some(c=>c.status===429))){report.checks.push('Stopped input load after a real 429; no quota inferred');break;}
 }
 report.inputSeconds=(Date.now()-began)/1000;
 await pages[1].reload();await pages[1].locator('.rooms-court').waitFor({timeout:30000});report.checks.push('Same-tab F5 restores the scoped session');
 await sleep(1500);
 report.measurementEndedAt=new Date().toISOString();
 for(let i=0;i<6;i++){
  stats[i].frameMs=await pages[i].evaluate(()=>window.__frames||[]);
  const ns=stats[i].nonces.map(BigInt);for(let n=1;n<ns.length;n++)assert.equal(ns[n],ns[n-1]+1n,'Input nonce is sequential');
 }
 assert.equal(report.errors.length,0);report.checks.push('No browser exception or input nonce gap');report.passed=true;
}catch(error){report.passed=false;report.error=String(error.shortMessage||error.message).split('Request body')[0].slice(0,700);}
finally{
 await browser.close();await sleep(500);
 for(const r of rooms)if(r.offer)try{const s=await observer.read('getSnapshot',[BigInt(r.offer.id)]);if(s[2]===1n||s[2]===2n){const p=players.find(x=>x.address===r.offer.a.toLowerCase());const session=await p.client.restoreSession(p.address);const result=await session.send(s[2]===1n?'cancelMatch':'concede',[BigInt(r.offer.id)]);report.transactions.push({action:'finish-test',hash:result.hash});}}catch(e){report.cleanupError=String(e.shortMessage||e.message).split('Request body')[0].slice(0,300);}
 for(const p of players)try{await action(p,'rooms/leave');}catch{}
 const percentile=(xs,p)=>{const s=xs.slice().sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(s.length*p))]??null;};
 report.browsers=stats.map(s=>({player:s.player,role:s.role,events:s.events,sockets:s.sockets,inputs:s.nonces.length,complete:s.complete,frames:{p50:percentile(s.frameMs||[],.5),p95:percentile(s.frameMs||[],.95),p99:percentile(s.frameMs||[],.99)},calls:s.calls}));
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));if(!report.cleanupError)await unlink(privateFile).catch(()=>{});
 console.log(JSON.stringify({...report,browsers:report.browsers.map(({calls,...s})=>({...s,calls:calls.length,readCount:calls.filter(c=>c.method==='eth_call').length,writeMs:{p50:percentile(calls.filter(c=>c.action).map(c=>c.ms),.5),p95:percentile(calls.filter(c=>c.action).map(c=>c.ms),.95),p99:percentile(calls.filter(c=>c.action).map(c=>c.ms),.99)}}))}));
 if(!report.passed)process.exitCode=1;
}
