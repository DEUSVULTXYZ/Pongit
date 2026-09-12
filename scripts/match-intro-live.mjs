// Real HTTPS coordinator and hosted engine. Unfunded, disposable friendly players.
// Only admission, observation and concession; no bet, credit or financial signature.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createPublicClient,createWalletClient,http} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {createInterludeClient,memoryStore,decodeSession,storageKey} from '@interludelayer-sdk/sdk';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {roomsChaosAbi as abi} from '../shared/abi-PongRoomsTestnet.ts';
assert.equal(process.env.INTRO_LIVE_TEST,'authorized-testnet');
const file='/secrets/intro-live.json';
try{await readFile(file);throw Error('Previous fixture must be reconciled first');}catch(e){if(e.code!=='ENOENT')throw e;}
const manifest=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
const origin='https://pongit.xyz',base=createPublicClient({chain:monadTestnet,transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:10000})});
const make=store=>createInterludeClient({app:manifest.app,abi,node:manifest.node,base,store,transport:http(manifest.node,{retryCount:0,timeout:12000}),fastPath:true});
const observer=make(memoryStore()),players=[],contexts=[],pages=[];
const report={at:new Date().toISOString(),scope:'Real HTTPS API and Interlude, two unfunded friendly players per mode; no financial actions',scenarios:[],errors:[]};
const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
async function save(){await writeFile(file,json(players.map(p=>({address:p.address,cookie:p.cookie,room:p.room,stored:p.store.get(storageKey(manifest.app,10143,p.address))}))),{mode:0o600});}
async function api(p,path,body){const r=await fetch(origin+'/api/interlude/'+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',...(p?{cookie:p.cookie,'x-pongit-player':p.address}:{})},body:body===undefined?undefined:json(body),signal:AbortSignal.timeout(20000)});if(r.headers.get('set-cookie'))p.cookie=r.headers.get('set-cookie').split(';')[0];const data=await r.json();assert(r.ok,`${path}: ${String(data.error||r.status).split('\n')[0]}`);return data;}
const action=(p,path,body={})=>api(p,path,{...body,operation:crypto.randomUUID()});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=40000){const start=Date.now();while(Date.now()-start<ms){const v=await fn();if(v)return v;await pause(500);}throw Error('Timed out: '+label);}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 await observer.status();assert.equal(await observer.read('activeCount',[]),0n,'Do not run alongside an existing player match');
 for(const mode of [0,1]){
  const pair=[];
  for(let index=0;index<2;index++){
   const owner=privateKeyToAccount(generatePrivateKey()),store=memoryStore(),client=make(store);
   await client.openSession({wallet:createWalletClient({account:owner,chain:monadTestnet,transport:http()}),scope:['acceptMatch','input','tick','cancelMatch','concede'],assertDigest:true,expirySeconds:1200});
   const p={address:owner.address.toLowerCase(),store,client,cookie:''};players.push(p);pair.push(p);await save();
   const stored=store.get(storageKey(manifest.app,10143,p.address)),grant=decodeSession(stored),c=await api(p,'auth/challenge',{player:p.address});
   await api(p,'auth/session',{player:p.address,nonce:c.nonce,signature:await privateKeyToAccount(grant.privateKey).signMessage({message:c.message}),grant:grant.grant,grantSignature:grant.signature});await save();
   const context=await browser.newContext({viewport:{width:index?390:1440,height:900}});contexts.push(context);p.context=context;
   await context.addInitScript(({stored,key,accountKey,address})=>{sessionStorage.setItem(key,stored);sessionStorage.setItem(accountKey,address);localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'}));window.introDigits=[];new MutationObserver(()=>{const digit=document.querySelector('.match-countdown-digit')?.textContent;if(digit&&window.introDigits.at(-1)?.digit!==digit)window.introDigits.push({digit,at:Date.now()});}).observe(document,{childList:true,subtree:true,characterData:true});},{stored,key:storageKey(manifest.app,10143,p.address),accountKey:`pongit:rooms:${manifest.app}:account`,address:p.address});
   await context.addCookies([{name:'pongit_rooms',value:p.cookie.split('=')[1],url:origin,httpOnly:true,secure:true,sameSite:'Strict'}]);
   if(process.env.TEST_WEB_HOST)await context.route(origin+'/**',async route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/api/'))return route.continue();return route.fulfill({response:await route.fetch({url:`http://${process.env.TEST_WEB_HOST}:3000${u.pathname}${u.search}`})});});
   p.page=await context.newPage();pages.push(p.page);p.page.on('pageerror',e=>report.errors.push(e.message));
  }
  const [a,b]=pair,room=(await action(a,'rooms',{mode,players:[b.address]})).room;
  a.room=b.room=room;await save();await action(b,'rooms/join',{room});
  const offer=await until(async()=>{const s=await api(a,'state');return s.room?.offer?.status==='offered'?s.room.offer:null;},'friendly offer');
  await Promise.all(pair.map(p=>p.page.goto(origin+'/rooms/'+room)));
  await a.page.getByRole('button',{name:'Accept',exact:true}).click();await a.page.getByText('Waiting for your rival',{exact:true}).waitFor();
  await b.page.getByRole('button',{name:'Accept',exact:true}).click();
  await Promise.all(pair.map(p=>p.page.locator('.rooms-court:not(.rooms-intro)').waitFor({timeout:40000})));
  const digits=await Promise.all(pair.map(p=>p.page.evaluate(()=>window.introDigits)));
  for(const values of digits)assert.deepEqual(values.map(x=>x.digit),['3','2','1']);
  const live=await observer.read('getSnapshot',[BigInt(offer.id)]);assert.equal(live[2],2n);
  report.scenarios.push({mode,match:offer.id,digits,phase:Number(live[2])});
  await a.page.getByRole('button',{name:'Tools',exact:true}).click();await a.page.getByRole('button',{name:'Concede',exact:true}).click();
  await until(async()=>(await observer.read('getSnapshot',[BigInt(offer.id)]))[2]===3n,'confirmed concession');
  for(const p of pair){await p.context.close();await action(p,'rooms/leave');p.room=null;await save();}
  await until(async()=>await observer.read('activeCount',[])===0n,'room released');
 }
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.error=String(e.shortMessage||e.message).split('\n')[0];report.passed=false;}
finally{
 // Try cleanup through the existing browser-owned nonce lane; never create a
 // second writer for an account with an uncertain browser transaction.
 for(const p of players.filter(p=>p.room))try{if(!p.page.isClosed()){await p.page.getByRole('button',{name:'Tools',exact:true}).click({timeout:3000});await p.page.getByRole('button',{name:'Concede',exact:true}).click({timeout:3000});await pause(1500);}await action(p,'rooms/leave');p.room=null;}catch{report.cleanupPending=true;}
 for(const p of players)if(p.page&&!p.page.isClosed())try{const journal=await p.page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([k])=>k.startsWith('pongit:commands:'))));await writeFile(`/secrets/commands-${p.address}.json`,json(journal),{mode:0o600});}catch{}
 await save();await browser.close();await mkdir('artifacts/intro',{recursive:true});await writeFile('artifacts/intro/live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(!report.passed)process.exitCode=1;
}
