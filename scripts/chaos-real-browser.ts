// Actual coordinator, SDK, Interlude and Monad. Only the HTTPS hostname is routed
// to private containers. EOA-owned sessions do not prove physical passkey recovery.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import WebSocket from 'ws';
import {createPublicClient,createWalletClient,http,parseTransaction,decodeFunctionData,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {createInterludeClient,memoryStore,storageKey} from '@interludelayer-sdk/sdk';
import {roomsEventsAbi as abi} from '../shared/abi-PongChaosEvents';
import {chaosQualificationRecord,verifyQualificationApp} from './chaos-qualification-record';
import {chainTools} from './independent-chain-tools';
assert.equal(process.env.PONG_CHAOS_QUALIFY,'isolated-hosted-testnet');
const production=process.env.PONG_CHAOS_PRODUCTION_FIXTURE==='authorized-testnet-candidate';
const publicSite=process.env.PONG_BROWSER_PUBLIC==='authorized-testnet-public';
assert(!publicSite||production,'Public validation requires the qualified production deployment');
const m=JSON.parse(await readFile(`artifacts/drand/${production?'production':'integration'}-manifests.json`,'utf8')).game;
let fixturePrefix='chaos-events-production-20260913';
if(production)assert.equal(m.app,'0x78d3341e3452d7ec1add9371de3008639eed8eb0');
else{
 const {prefix,record}=await chaosQualificationRecord();fixturePrefix=prefix;assert.equal(m.app,record.app);
 const t=await chainTools(prefix);try{await verifyQualificationApp(t,prefix,m.app);}finally{await t.close();}
}
const run=process.env.PONG_BROWSER_RUN||'1';assert(/^[1-9]$/.test(run));
const file=`/secrets/${fixturePrefix}-browser-${run}.json`;try{await readFile(file);throw Error('Reconcile existing browser fixture');}catch(e){if((e as any).code!=='ENOENT')throw e;}
const origin='https://pongit.xyz',apiHost=publicSite?origin+'/api':'http://chaos-api:4013',out=`artifacts/drand/real-browser-${run}`,people:any[]=[],secret:any={people:[],commands:[],rooms:[]};
const report:any={at:new Date().toISOString(),app:m.app,scope:publicSite?'Public HTTPS production, real coordinator, hosted contracts and Monad; synthetic EOA owners':'Real private coordinator and hosted contracts through HTTPS-origin Chromium; synthetic EOA owners',matches:[],errors:[],requests:[]};
const encode=(v:any)=>JSON.stringify(v,(_,v)=>typeof v==='bigint'?String(v):v);let tail=Promise.resolve();
const save=()=>{const bytes=encode(secret);tail=tail.then(async()=>{await writeFile(file+'.next',bytes,{mode:0o600});await rename(file+'.next',file);});return tail;};await save();
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});await mkdir(out,{recursive:true});
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
const node=createPublicClient({transport:http(m.node,{retryCount:0,timeout:10000})});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function api(p:any,path:string,body?:any){const res=await fetch(apiHost+'/interlude/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'content-type':'application/json','x-pongit-player':p.address,...(p.cookie?{cookie:p.cookie}:{})},body:body===undefined?undefined:encode({...body,operation:crypto.randomUUID()})});
 const cookie=res.headers.get('set-cookie');if(cookie)p.cookie=cookie.split(';')[0];const data=await res.json();assert(res.ok,`${path}: ${String(data.error||res.status)}`);return data;}
async function waitFor(fn:()=>Promise<any>,label:string,ms=45000){const end=Date.now()+ms;while(Date.now()<end){const x=await fn();if(x)return x;await sleep(500);}throw Error('Timeout: '+label);}
try{
 await waitFor(async()=>{const h=await(await fetch(apiHost+(publicSite?'/interlude/config':'/health'))).json();return h.online&&h.admission!==false&&(!publicSite||h.app===m.app);},'coordinator available');
 assert.equal(await node.readContract({address:m.app,abi,functionName:'activeCount'}),0n);
 for(let i=0;i<6;i++){
  const key=generatePrivateKey(),owner=privateKeyToAccount(key),store=memoryStore(),client=createInterludeClient({app:m.app,abi,node:m.node,base,store,fastPath:true});
  await client.openSession({wallet:createWalletClient({account:owner,chain:monadTestnet,transport:http()}),scope:['acceptMatch','input','tick','cancelMatch','concede'],expirySeconds:1800,assertDigest:true});
  const stored=store.get(storageKey(m.app,10143,owner.address));assert(stored);
  const context=await browser.newContext({viewport:i%3===1?{width:390,height:844}:{width:1440,height:1000},reducedMotion:i>=3?'reduce':'no-preference'});
  const p:any={address:owner.address.toLowerCase(),cookie:'',context,stored,calls:[],closing:false};people.push(p);secret.people.push({key,address:p.address,stored});await save();
  await context.addInitScript(({stored,key,account,address})=>{if(!sessionStorage.getItem(key))sessionStorage.setItem(key,stored);sessionStorage.setItem(account,address);localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'}));},{stored,key:storageKey(m.app,10143,owner.address),account:`pongit:rooms:${m.app}:account`,address:p.address});
  if(!publicSite)await context.route(origin+'/**',async route=>{const u=new URL(route.request().url());try{await route.fulfill({response:await route.fetch({url:u.pathname.startsWith('/api/')?apiHost+u.pathname.slice(4)+u.search:'http://countdown-web:3000'+u.pathname+u.search,maxRetries:2})});}catch(e){if(!p.closing)throw e;}});
  await context.route(m.node+'**',async route=>{const rpc=route.request().postDataJSON();if(rpc?.method==='interlude_sendTransaction'){const raw=rpc.params[0],tx=parseTransaction(raw as Hex),action=decodeFunctionData({abi,data:tx.data!}).functionName;secret.commands.push({player:p.address,raw,at:Date.now()});await save();p.calls.push({action,nonce:tx.nonce,bytes:(raw.length-2)/2});}await route.continue();});
  if(!publicSite)await context.routeWebSocket('wss://pongit.xyz/ws',async route=>{
   const cookies=(await context.cookies(origin)).map(c=>c.name+'='+c.value).join(';'),pending:any[]=[],server=new WebSocket('ws://chaos-api:4013/ws',{headers:{origin,cookie:cookies}});
   route.onMessage(data=>server.readyState===1?server.send(data):pending.push(data));server.on('open',()=>pending.splice(0).forEach(data=>server.send(data)));server.on('message',data=>route.send(data.toString()));server.on('error',()=>route.close());server.on('close',()=>route.close());route.onClose(()=>server.close());
  });
  p.page=await context.newPage();p.page.on('pageerror',(e:Error)=>report.errors.push(e.message));
  p.page.on('requestfinished',async(req:any)=>{if(!req.url().startsWith(m.node))return;try{const rpc=req.postDataJSON(),r=await req.response(),timing=req.timing();report.requests.push({player:i,method:rpc.method,status:r.status(),ms:timing.responseEnd-timing.requestStart});}catch{}});
 }
 for(const mode of [0,1]){
  const group=people.slice(mode*3,mode*3+3);await Promise.all(group.map(p=>p.page.goto(origin+'/rooms')));
  for(const p of group){await p.page.waitForFunction(()=>{const b=document.querySelector('.rooms-account-toggle');return b&&!/Connect|Renew|Restoring/i.test(b.textContent||'');},{},{timeout:40000});p.cookie=(await p.context.cookies(origin)).map((c:any)=>c.name+'='+c.value).join(';');}
  const roomId=(await api(group[0],'rooms',{mode,players:group.slice(1).map(p=>p.address)})).room;secret.rooms.push(roomId);await save();
  await api(group[1],'rooms/join',{room:roomId});await api(group[2],'rooms/join',{room:roomId});
  const offer=await waitFor(async()=>{const s=await api(group[0],'state');return s.room?.offer?.status==='offered'?s.room.offer:null;},'real offer');
  await Promise.all(group.map(p=>p.page.goto(origin+'/rooms/'+roomId)));
  for(const p of group.slice(0,2))await p.page.getByRole('button',{name:'Accept',exact:true}).click({timeout:15000});
  await group[1].page.locator('.match-countdown-digit').filter({hasText:'3'}).waitFor();
  await Promise.all(group.map(p=>p.page.locator('.rooms-court:not(.rooms-intro)').waitFor({timeout:45000})));
  const id=BigInt(offer.id),start=Date.now();let reversals=0,reloaded=false;
  while(Date.now()-start<100000){
   const snap=await node.readContract({address:m.app,abi,functionName:'getSnapshot',args:[id]});if(snap[2]>=3n)break;
   const key=reversals++%2?'ArrowUp':'ArrowDown';await Promise.all(group.slice(0,2).map(p=>p.page.keyboard.down(key)));await sleep(100);await Promise.all(group.slice(0,2).map(p=>p.page.keyboard.up(key)));await sleep(100);
   if(!reloaded&&reversals>=30){await group[1].page.reload();await group[1].page.locator('.rooms-court:not(.rooms-intro)').waitFor({timeout:30000});reloaded=true;}
  }
  const live=await node.readContract({address:m.app,abi,functionName:'getSnapshot',args:[id]});assert.equal(live[2],3n);assert.equal(Math.max(live[12].scoreA,live[12].scoreB),7);
  for(const p of group.slice(0,2)){await p.page.getByText(p.address===live[6].toLowerCase()?'VICTORY':'DEFEAT',{exact:true}).waitFor({timeout:20000});assert(await p.page.getByText(`${live[12].scoreA} : ${live[12].scoreB}`,{exact:true}).count()>=1);}
  assert.equal(await group[2].page.getByText('VICTORY',{exact:true}).count(),0);assert.equal(await group[2].page.getByText('DEFEAT',{exact:true}).count(),0);
  await waitFor(async()=>{const s=await base.readContract({address:m.app,abi,functionName:'getSnapshot',args:[id]});return s[2]===3n&&s[6]===live[6];},'real publication',120000);
  for(const [i,p] of group.entries()){await p.page.screenshot({path:`${out}/${mode}-${i}.png`});secret.people[mode*3+i].session=await p.page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage)));await save();}
  report.matches.push({id:String(id),mode,score:[live[12].scoreA,live[12].scoreB],f5:reloaded,reversals,commands:group.map(p=>p.calls)});
  for(const p of group){p.closing=true;await p.context.close();}
 }
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.passed=false;report.error=String((e as any).shortMessage||(e as Error).message).split('\n')[0];for(const [i,p] of people.entries())if(!p.page.isClosed()){report[`page${i}`]=(await p.page.locator('body').innerText()).slice(0,5000);await p.page.screenshot({path:`${out}/failure-${i}.png`});}}
finally{await save();await writeFile(out+'/report.json',JSON.stringify(report,null,2));for(const p of people)p.closing=true;await browser.close();console.log(JSON.stringify({passed:report.passed,error:report.error,matches:report.matches.map((r:any)=>({mode:r.mode,score:r.score,f5:r.f5,reversals:r.reversals})),errors:report.errors}));if(!report.passed)process.exitCode=1;}
