// Actual wallet implementation and actual AgentPoolMatch UI. Initial private
// admission is invoked through an isolated harness, not an enabled public lobby.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
import {installSyncProbe,syncMetrics,confirmedInputMetrics} from './browser-sync-probe';
import {decodeFunctionData,parseTransaction} from 'viem';
import {reusableAgentArenaAbi} from '../shared/abi-ReusableAgentArena';
assert.equal(process.env.PONG_FIVE_BROWSER,'private-mera-match');
const v3=process.env.PONG_FIVE_BROWSER_V3==='reviewed-private';
assert(!process.env.PONG_FIVE_BROWSER_V3||v3);
// Keep the production build's relying-party origin. Only this test context
// redirects its web/assets/API to private services; no public request is sent.
const origin=v3?'https://pongit.xyz':'http://localhost:4190';
const api=v3?'https://pongit.xyz/api':'http://localhost:4000';
const run=process.env.PONG_FIVE_BROWSER_RUN!,mode=Number(process.env.RENDER_MODE??0),channel=process.env.BROWSER_CHANNEL??'chrome';
assert(/^[1-9]$/.test(run)&&[0,1].includes(mode)&&['chrome','msedge'].includes(channel));
const attempt=process.env.PONG_FIVE_BROWSER_ATTEMPT??run;assert(/^[1-9][a-z]?$/.test(attempt));
const out=`artifacts/qualification/${v3?'20261001/v3-':'20260928/'}browser-${attempt}-${channel}-${mode}`;
await mkdir(out,{recursive:true});
const privatePath=process.env.PONG_BROWSER_PRIVATE_PATH!;assert(privatePath&&privatePath.includes('private-backups'));
await writeFile(privatePath,'{}',{flag:'wx',mode:0o600});
const report:any={startedAt:new Date().toISOString(),passed:false,mode,channel,virtualPrf:true,
 scope:'Local candidate UI, unchanged private API and real Monad/Interlude; actual Mera with a virtual PRF authenticator. Initial challenge uses the private wallet harness. Not a physical passkey or public lobby qualification.',errors:[],commands:[],checks:[]};
const browser=await chromium.launch({channel,headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
let spectator:import('@playwright/test').Page|undefined;
if(v3)await installSyncProbe(page);
const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
let assertions=0;cdp.on('WebAuthn.credentialAsserted',()=>assertions++);
const savePrivate=async()=>writeFile(privatePath,JSON.stringify({storage:await context.storageState(),session:await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage))),credentials:await cdp.send('WebAuthn.getCredentials',{authenticatorId})}),{mode:0o600});
const starts=new WeakMap<object,number>(),controls=new WeakMap<object,{direction:number;sequence:string}>();
const inputIntents:{at:number;direction:number}[]=[],receipts:any[]=[];
const retainIntents=async()=>{inputIntents.push(...await page.evaluate(()=>(window as any).__intents??[]));};
page.on('request',r=>{starts.set(r,performance.now());try{
 const body=r.postDataJSON();if(body?.method!=='interlude_sendTransaction')return;
 const call=decodeFunctionData({abi:reusableAgentArenaAbi,data:parseTransaction(body.params[0]).data!});
 if(call.functionName==='input')controls.set(r,{direction:Number(call.args[2]),sequence:String(call.args[3])});
}catch{/* Decode only in memory. Never retain signed payloads. */}});
page.on('pageerror',e=>report.errors.push(e.message.slice(0,200)));
page.on('response',async response=>{const request=response.request();try{
 const body=request.postDataJSON();if(body?.method!=='interlude_sendTransaction')return;
 const data=await response.json(),began=starts.get(request)??performance.now();report.commands.push({ms:performance.now()-began,http:response.status(),error:!!data.error});
 if(data.result?.transactionHash&&['0x1','success'].includes(data.result.status)&&controls.has(request))receipts.push({sentAt:performance.timeOrigin+began,confirmedAt:performance.timeOrigin+performance.now(),...controls.get(request)});
 }catch{}});
try{
 const routePrivate=async(target:import('@playwright/test').Page)=>{
  if(v3)await target.route(origin+'/**',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname.startsWith('/api/'))return route.abort('blockedbyclient');
   try{await route.fulfill({response:await route.fetch({url:'http://127.0.0.1:4197'+u.pathname+u.search})});}
   catch{report.errors.push('Private web transport failed');await route.abort().catch(()=>{});}
  });
  await target.route(api+'/agents/**',async route=>{const u=new URL(route.request().url()),path=u.pathname.replace(/^\/api\//,'/');
   const headers={'access-control-allow-origin':origin,'access-control-allow-headers':'content-type','access-control-allow-methods':'GET,POST,OPTIONS'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   const sponsor=v3&&(/^\/agents\/(transactions|operations)(\/|$)/.test(path));
   try{const response=await route.fetch({url:`http://127.0.0.1:${sponsor?4196:4194}`+path+u.search});await route.fulfill({response,headers:{...response.headers(),...headers}});}
   catch{report.errors.push('Private API transport failed');await route.abort().catch(()=>{});}
  });
 };
 await routePrivate(page);
 await context.addInitScript({content:await readFile(process.env.PONG_BROWSER_WALLET_BUNDLE!,'utf8')});
 await context.addInitScript(()=>{
  localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'}));
  (window as any).__paddle=[];(window as any).__keys=[];(window as any).__digits=[];(window as any).__intents=[];
  const fill=CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){fill.call(this,x,y,w,h);if(x===22&&w===12&&h>40&&this.canvas.closest('.pool-canvas-slot')){const rows=(window as any).__paddle;if(rows.length<30000)rows.push({at:performance.now(),y});}};
  window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown'].includes(e.code)){
   (window as any).__keys.push({at:performance.now(),dir:e.code});
   (window as any).__intents.push({at:performance.timeOrigin+performance.now(),direction:e.code==='ArrowUp'?-1:1});
  }});
  window.addEventListener('keyup',e=>{if(['ArrowUp','ArrowDown'].includes(e.code))(window as any).__intents.push({at:performance.timeOrigin+performance.now(),direction:0});});
  setInterval(()=>{const digit=document.querySelector('.match-countdown-digit')?.textContent;if(digit)(window as any).__digits.push({at:performance.now(),digit});},40);
 });
 await page.goto(origin+'/agents',{waitUntil:'domcontentloaded'});
 const intent=await page.evaluate(async mode=>(window as any).__qualifyMera(mode),mode);await savePrivate();report.player=intent.player;
 const writeIntent=spawn('ssh',['pongit','tee',`/opt/pongit/tests/fluid-20260928/${v3?'v3-games-6033dbe/evidence':'evidence-1'}/browser-intent-${run}.json`],{stdio:['pipe','ignore','pipe']});writeIntent.stdin.end(JSON.stringify(intent));
 await new Promise<void>((resolve,reject)=>{writeIntent.once('error',reject);writeIntent.once('exit',code=>code===0?resolve():reject(Error('Private intent transfer failed')));});
 let ref:any;const until=Date.now()+120000;
 while(Date.now()<until){const value=await (await page.request.get('http://127.0.0.1:4194/agents/challenges/'+intent.player)).json();if(value.request?.ref){ref=value.request.ref;break;}await page.waitForTimeout(350);}
 assert(ref,'Actual browser admission deadline');report.ref=ref;report.admittedAt=new Date().toISOString();
 await page.goto(`${origin}/agents/arenas/${ref.app}/${ref.epoch}/${ref.id}`,{waitUntil:'domcontentloaded'});
 if(v3){spectator=await browser.newPage({viewport:{width:1440,height:1000}});await routePrivate(spectator);await installSyncProbe(spectator);await spectator.goto(page.url(),{waitUntil:'domcontentloaded'});}
 await page.locator('.pool-canvas-slot canvas').waitFor({timeout:60000});
 await page.waitForFunction(()=>{const button=document.querySelector<HTMLButtonElement>('button[aria-label="Move up"]');return button&&!button.disabled&&!document.querySelector('.match-countdown');},{},{timeout:60000});
 report.countdown=await page.evaluate(()=>(window as any).__digits);assert(report.countdown.length>0,'No visible real countdown');
 const before=assertions;report.playingAt=new Date().toISOString();
 for(let i=0;i<110;i++){
  const key=i%2?'ArrowDown':'ArrowUp';await page.keyboard.down(key);await page.waitForTimeout(80);await page.keyboard.up(key);await page.waitForTimeout(40);
  if(i===34){await retainIntents();await savePrivate();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>{const b=document.querySelector<HTMLButtonElement>('button[aria-label="Move up"]');return b&&!b.disabled;},{},{timeout:20000});assert.equal(assertions,before);report.checks.push('F5 reused the actual Mera grant');}
 }
 const trace=await page.evaluate(()=>({paddle:(window as any).__paddle,keys:(window as any).__keys}));
 await writeFile(out+'/input-trace.json',JSON.stringify(trace));
 const local:number[]=[];for(const key of trace.keys){const initial=[...trace.paddle].reverse().find((p:any)=>p.at<=key.at);if(!initial)continue;const moved=trace.paddle.find((p:any)=>p.at>key.at&&p.at-key.at<300&&Math.abs(p.y-initial.y)>.2);if(moved)local.push(moved.at-key.at);}
 const percentile=(a:number[],p:number)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*p)];
 report.input={samples:local.length,p95Ms:percentile(local,.95)};report.commandP95Ms=percentile(report.commands.filter((c:any)=>!c.error).map((c:any)=>c.ms),.95);
 await retainIntents();report.confirmedInput=confirmedInputMetrics(inputIntents,receipts);
 await page.screenshot({path:out+'/court.png',fullPage:true});
 if(v3){
  await page.waitForTimeout(45000);
  report.sync=syncMetrics(await page.evaluate(()=>(window as any).__syncProbe));
  report.spectatorSync=syncMetrics(await spectator!.evaluate(()=>(window as any).__syncProbe));
  await spectator!.screenshot({path:out+'/spectator.png',fullPage:true});
  report.performance={player:report.sync.p95FrameMs<=20&&report.sync.maxHoldMs<=500&&report.sync.frameGaps.length===0,
   spectator:report.spectatorSync.p95FrameMs<=20&&report.spectatorSync.maxHoldMs<=500&&report.spectatorSync.frameGaps.length===0};
 }
 report.text=await page.locator('main').innerText();assert(report.commands.length>=100,'Fewer than 100 real command receipts');assert(report.commands.every((c:any)=>!c.error),'Command RPC failed');
 assert(report.input.samples>=50&&report.input.p95Ms<=50,'Local paddle latency exceeded 50 ms');assert(report.commandP95Ms<=300,'Command receipt latency exceeded 300 ms');
 if(v3)assert(report.confirmedInput.samples>=100&&report.confirmedInput.p95Ms<=300&&!report.confirmedInput.mismatches.length,'Input-to-confirmation gate failed');
 if(v3)assert(Object.values(report.performance).every(Boolean),'Player or spectator rendering gate failed');
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.error=String((e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,250);process.exitCode=1;report.text=await page.locator('body').innerText().catch(()=>'unavailable');}
finally{await savePrivate();report.finishedAt=new Date().toISOString();await writeFile(out+'/report.json',JSON.stringify(report,null,2));await page.unrouteAll({behavior:'ignoreErrors'});await browser.close();}
