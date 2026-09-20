// Private real-service browser check. Only the UI opening gate and explicit
// transport faults are simulated. No physical WebAuthn claim and no public flag.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {chromium,type BrowserContext,type Page} from '@playwright/test';
import {createPublicClient,http} from 'viem';
import {readHubDelegation} from '../shared/rooms-hub';
import {validateAgentPoolManifest,type PoolMatchView} from '../shared/agent-pool';
import type {AgentMatchRef} from '../shared/agents';
import type {Address} from 'viem';

assert.equal(process.env.PONG_SERIES_BROWSER,'isolated-vps');
const prefix=process.env.PONG_AGENT_SERIES_PREFIX!;assert(/^agent-series-candidate-\d{8}-[3-9]$/.test(prefix));
const manifest=validateAgentPoolManifest(JSON.parse(await readFile('/manifest/manifest.json','utf8')));
assert.equal(manifest.enabled,false);assert.equal(manifest.rulesVersion,11);
const origin='https://pongit.xyz',api='http://pongit-series3-sponsor:4102',web='http://pongit-series3-web:3000';
const nodes=new Set(manifest.arenas.map(a=>new URL(a.node).origin));
const run=Number(process.env.PONG_SERIES_BROWSER_RUN??1);assert(Number.isSafeInteger(run)&&run>=1&&run<=99);
const suffix=run===1?'':`-${run}`;
const privatePath=`/secrets/${prefix}-browser${suffix}.json`,reportPath=`/diagnostics/series-browser${suffix}.json`;
const resumePath=process.env.PONG_SERIES_BROWSER_RESUME;
assert(!resumePath||run>1&&/^\/agents\/arenas\/0x[\da-f]{40}\/\d+\/\d+$/i.test(resumePath));
const reuse=process.env.PONG_SERIES_BROWSER_REUSE==='1';assert(!reuse||run>1);
const restored=resumePath||reuse?JSON.parse(await readFile(`/secrets/${prefix}-browser.json`,'utf8')):undefined;
try{await readFile(privatePath);throw Error('Preserve and reconcile the existing browser run first');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
await writeFile(privatePath,JSON.stringify({createdAt:new Date().toISOString()}),{mode:0o600});
const report:any={at:new Date().toISOString(),pool:manifest.pool,rules:11,scope:'Private VPS HTTPS-origin browser, actual contracts and sponsorship; virtual Mera PRF, UI opening gate overridden only for this browser',checks:[],matches:[],faults:[],rpc:[],errors:[],passed:false};
if(resumePath)report.recoveryOf={run:1,path:resumePath};
const checkpoint=async()=>writeFile(reportPath,JSON.stringify(report,null,2));
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const until=async(fn:()=>Promise<boolean>,name:string,ms=90000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await sleep(1000);}throw Error(`Timed out: ${name}`);};
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
let loseReply=false,throttle=false,assertions=0,page:Page|undefined,human:BrowserContext|undefined,cdp:any,authenticatorId:string|undefined;
let progressBusy=false;
const progress=setInterval(()=>{if(progressBusy||!page||page.isClosed())return;progressBusy=true;
 void page.locator('body').innerText({timeout:2000}).then(async text=>{report.page={url:page!.url(),text:text.replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,5000)};await checkpoint();}).catch(()=>{}).finally(()=>{progressBusy=false;});
},5000);
async function context(player=false){
 const c=await browser.newContext({viewport:{width:1440,height:1000},...(player&&restored?{storageState:restored.storage}:{})});
 if(player&&restored)await c.addInitScript(values=>{for(const [k,v] of Object.entries(values))if(sessionStorage.getItem(k)===null)sessionStorage.setItem(k,String(v));},restored.session);
 await c.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'})));
 await c.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());
  try{
  if(u.origin===origin&&!u.pathname.startsWith('/api/'))return route.fulfill({response:await route.fetch({url:web+u.pathname+u.search,timeout:30000})});
  if(u.origin==='http://localhost:4000'||u.origin===origin&&u.pathname.startsWith('/api/')){
   const path=u.origin===origin?u.pathname.slice(4):u.pathname;
   assert(path.startsWith('/agents/'),'Never send browser writes to human services');
   const response=await route.fetch({url:api+path+u.search,timeout:45000});
   if(path==='/agents/config'){
    const value=await response.json();assert.equal(value.pool,manifest.pool);assert.equal(value.enabled,false);
    return route.fulfill({response,json:{...value,enabled:true,verifiedCapacity:2,qualificationEvidence:`0x${'f'.repeat(64)}`}});
   }
   return route.fulfill({response});
  }
  if(nodes.has(u.origin)){
   const body=request.postDataJSON(),method=String(body?.method??'http');
   if(player&&throttle&&method==='interlude_sendTransaction'){
    throttle=false;report.faults.push({at:new Date().toISOString(),kind:'Injected 429 before send'});
    return route.fulfill({status:429,headers:{'Retry-After':'1'},json:{error:'Private qualification throttle'}});
   }
   const start=performance.now(),response=await route.fetch({timeout:20000});
   report.rpc.push({player,method,status:response.status(),ms:performance.now()-start,bytes:Buffer.byteLength(request.postData()??'')});
   if(player&&loseReply&&method==='interlude_sendTransaction'){
    const data=await response.json();assert(response.ok()&&!data.error,'Withhold only an executed transaction response');
    loseReply=false;report.faults.push({at:new Date().toISOString(),kind:'Reply lost after execution'});return route.abort('failed');
   }
   return route.fulfill({response});
  }
  assert.equal(request.method(),'POST','Unexpected external browser request');assert.equal(u.origin,'https://testnet-rpc.monad.xyz');
  return route.continue();
  }catch(e){
   report.errors.push(`Route ${request.method()} ${u.origin}${u.pathname}: ${(e as Error).message.split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]')}`);
   await route.abort('failed').catch(()=>{});
  }
 });
 return c;
}
async function savePrivate(){
 if(!page||page.isClosed()||!human)return;
 const state={storage:await human.storageState(),session:await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage))),
  credentials:authenticatorId?await cdp.send('WebAuthn.getCredentials',{authenticatorId}):null};
 await writeFile(privatePath+'.next',JSON.stringify(state),{mode:0o600});await rename(privatePath+'.next',privatePath);
}
try{
 // Test the delivered HTTP policy before creating any account or challenge.
 // API fixtures without captured headers cannot establish this integration.
 const headers=await fetch(web+'/agents');assert(headers.ok,'Private web unavailable');
 const csp=headers.headers.get('content-security-policy')??'';
 const connect=csp.split(';').find(x=>x.trim().startsWith('connect-src '))?.trim().split(/\s+/).slice(1)??[];
 for(const node of nodes){assert(connect.includes(node),`Built CSP omits approved arena ${node}`);assert(connect.includes(node.replace(/^http/,'ws')),`Built CSP omits approved arena WebSocket ${node}`);}
 report.checks.push('Actual delivered CSP includes every approved arena HTTP and WebSocket origin');await checkpoint();
 // Queue just before a real release, not twenty minutes before a ten-minute
 // invitation expires. A sleeping browser does not occupy an arena.
 const waitEnd=Date.now()+5400000;
 while(!resumePath){
  const b=await base.getBlock();let near=false;
  for(const a of manifest.arenas){const d=await readHubDelegation(base,manifest.hub,a.app,b.number);if(d.status===0||d.status===2&&d.stakeUnlockAt<=b.timestamp+90n)near=true;}
  if(near)break;assert(Date.now()<waitEnd,'No real arena admission became available');await sleep(15000);
 }
 human=await context(true);const spectator=await context();page=await human.newPage();const watch=await spectator.newPage();
 for(const p of [page,watch]){p.setDefaultTimeout(45000);p.on('pageerror',e=>report.errors.push(e.message));}
 cdp=await human.newCDPSession(page);await cdp.send('WebAuthn.enable');
 ({authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}}));
 cdp.on('WebAuthn.credentialAsserted',()=>assertions++);
 let initialAssertions=0;
 for(const mode of [0,1]){
  if(mode===0&&resumePath){await page.goto(origin+resumePath);report.checks.push('Recovered saved virtual-Mera family without a new ceremony');}
  else{
   await page.goto(`${origin}/agents?mode=${mode}`);const nova=page.getByRole('button',{name:'Challenge NOVA',exact:true});await nova.waitFor();await nova.click();
   if(mode===0&&!restored){await page.getByRole('button',{name:'Create account',exact:true}).click();await until(async()=>!await page!.getByRole('dialog',{name:'Connect to challenge an agent'}).count(),'Mera ceremony');initialAssertions=assertions;await savePrivate();report.checks.push('Real Mera PRF family and sponsored challenge');}
   else if(mode===0)report.checks.push('Reused the saved virtual-Mera family for a new sponsored challenge');
  }
  await checkpoint();
  await page.waitForURL(/\/agents\/arenas\/0x[\da-fA-F]{40}\/\d+\/\d+/,{timeout:660000});await savePrivate();
  const url:string=page.url(),parts:string[]=new URL(url).pathname.split('/');
  const ref:AgentMatchRef={chainId:10143,app:parts[3] as Address,epoch:parts[4],id:parts[5]};
  assert(manifest.arenas.some(a=>a.app.toLowerCase()===ref.app.toLowerCase()));
  report.current={ref,mode,url};await checkpoint();
  const up=page.getByRole('button',{name:'Move up',exact:true});await up.waitFor({timeout:120000});await until(()=>up.isEnabled(),'Controllable arena');
  await watch.goto(url);await watch.locator('canvas').waitFor();
  for(let i=0;i<60;i++){
   if(!await up.count()||!await up.isEnabled())break;
   if(mode===0&&i===5)loseReply=true;if(mode===0&&i===12)throttle=true;
   await page.keyboard.down(i%2?'s':'w');await sleep(100);await page.keyboard.up(i%2?'s':'w');await sleep(100);
   if(i===25){await savePrivate();await page.reload();await until(()=>up.isEnabled(),'F5 session reuse');assert.equal(assertions,initialAssertions,'F5 or another arena requested a fresh passkey');report.checks.push(`Mode ${mode}: F5 reused scoped key`);}
  }
  if(await up.count()&&await up.isEnabled()){
   await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('button',{name:'Concede match',exact:true}).click();
  }
  await until(async()=>{const r=await fetch(`${api}/agents/matches/${ref.app}/${ref.epoch}/${ref.id}`);const v=await r.json();return r.ok&&!!v.result;},'Published result',390000);
  const result:PoolMatchView=await (await fetch(`${api}/agents/matches/${ref.app}/${ref.epoch}/${ref.id}`)).json();assert(result.result);
  await page.keyboard.press('Escape');await watch.locator('.pool-published-result').waitFor();
  const expected:number[]=[result.result.scoreA,result.result.scoreB];
  for(const p of [page,watch])assert.deepEqual((await p.locator('.agent-score b').allTextContents()).map(Number),expected);
  await savePrivate();assert.equal(assertions,initialAssertions,'Family reuse requested a new ceremony');
  report.matches.push({ref,mode,result:result.result,scoreMatched:true,authAssertions:assertions});
 }
 assert(!loseReply&&!throttle,'Both labelled faults must actually be exercised');assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.error=(e as Error).message.split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{
 clearInterval(progress);while(progressBusy)await sleep(50);
 await savePrivate().catch(()=>{report.privateSnapshotFailed=true;});
 if(!report.passed&&page&&!page.isClosed()){
  report.page={url:page.url(),text:(await page.locator('body').innerText()).replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,5000)};
  await page.screenshot({path:`/diagnostics/series-browser${suffix}.png`,fullPage:true}).catch(()=>{});
 }
 await checkpoint();
 for(const context of browser.contexts())await context.unrouteAll({behavior:'ignoreErrors'});
 await browser.close();
 console.log(JSON.stringify({passed:report.passed,error:report.error,matches:report.matches,checks:report.checks,faults:report.faults}));
}
