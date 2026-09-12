// Observe a disposable match using saved limited credentials. No new game or root signature.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
assert.equal(process.env.ROOMS_BROWSER_TEST,'isolated-vps');
const saved=JSON.parse(await readFile('/secrets/independent-browser-v2-chaos-fresh1.json','utf8'));
const edge=process.env.BROWSER_CHANNEL==='msedge',label=edge?'edge':'chrome';
const browser=await chromium.launch({headless:true,...(edge?{channel:'msedge'}:{}),args:['--no-sandbox']});
const report:any={at:new Date().toISOString(),browser:label,checks:[],errors:[],scope:'Private VPS frontend, real Monad and hosted reads, saved limited session, no new root signature or match'};
const out='artifacts/independent-candidate/recovery-browser';await mkdir(out,{recursive:true});
try{
 const player=saved.players[0],context=await browser.newContext({viewport:{width:1440,height:1000},storageState:player.storage});
 let engineRequests=0;context.on('request',r=>{if(new URL(r.url()).hostname.endsWith('.fly.dev'))engineRequests++;});
 await context.addInitScript(values=>{
  for(const [key,value] of Object.entries(values))sessionStorage.setItem(key,String(value));
  const get=navigator.credentials.get.bind(navigator.credentials);(window as any).credentialRequests=0;
  navigator.credentials.get=(...args)=>{(window as any).credentialRequests++;return get(...args);};
 },player.session);
 await context.route('https://pongit.xyz/**',async route=>{
  const url=new URL(route.request().url());
  const target=url.pathname.startsWith('/api/independent/')?'http://independent-service:4012'+url.pathname.slice(4)+url.search:'http://independent-web:3000'+url.pathname+url.search;
  assert(!url.pathname.startsWith('/api/')||url.pathname.startsWith('/api/independent/'),'Unexpected legacy API');
  const response=await route.fetch({url:target,timeout:30000});
  if(url.pathname.endsWith('/independent/config'))report.configResponse={status:response.status(),keys:Object.keys(await response.json()).sort()};
  await route.fulfill({response});
 });
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message.slice(0,250)));
 page.on('requestfailed',request=>report.errors.push({url:request.url().split('?')[0],failure:request.failure()?.errorText}));
 page.on('console',message=>{if(message.type()==='error')report.errors.push({console:message.text().replace(/0x[\da-f]{64,}/gi,'[hex omitted]').slice(0,500)});});
 await page.goto(saved.roomUrl);await page.locator('.rooms-canvas').waitFor({timeout:60000});
 await page.waitForFunction(()=>/recovering|publication recovery|Waiting for point publication/.test(document.body.innerText),{},{timeout:30000});
 await page.waitForTimeout(12000);
 assert.equal(await page.evaluate(()=>(window as any).credentialRequests),0);
 report.checks.push('Room restoration and repeated snapshots keep the recovery state visible without a root passkey request');
 report.visible=await page.locator('.rooms-shell').innerText();
 for(const size of [{width:360,height:640},{width:390,height:844},{width:768,height:1024},{width:1440,height:1000},{width:844,height:390}]){
  await page.setViewportSize(size);await page.waitForTimeout(100);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
  const box=await page.locator('canvas').first().boundingBox();assert(box&&box.width>100&&box.height>50);
  await page.getByRole('button',{name:'Tools',exact:true}).click();
  await page.getByRole('dialog',{name:'Cabinet tools'}).waitFor();await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0);assert(await page.getByRole('button',{name:'Tools',exact:true}).evaluate(e=>document.activeElement===e));
  await page.screenshot({path:`${out}/${label}-${size.width}.png`});
  report.checks.push({viewport:size,canvas:box,dialogEscape:true,focusRestored:true});
 }
 await page.reload();await page.locator('.rooms-canvas').waitFor({timeout:45000});
 assert.equal(await page.evaluate(()=>(window as any).credentialRequests),0);
 report.checks.push('F5 preserves the current arena and limited session');
 if(process.env.PONG_EXPECT_CLOSED==='true'){
  assert.equal(engineRequests,0,'A closed delegation must restore through Monad, not the stopped node');
  assert(await page.getByRole('button',{name:'Move up',exact:true}).isDisabled());
  report.checks.push('Closed arena restores its published partial score with controls disabled and zero hosted-node requests');
 }
 const docsReady=context.waitForEvent('page');await page.getByRole('link',{name:'Docs ↗',exact:true}).click();const docs=await docsReady;let businessCalls=0;
 docs.on('request',req=>{if(/\.fly\.dev|\/api\/independent|testnet-rpc/.test(req.url()))businessCalls++;});
 await docs.waitForLoadState('networkidle');assert(docs.url().endsWith('/docs'));assert.equal(businessCalls,0);await docs.close();
 report.checks.push('Docs opens separately without game RPC, and the arena remains open');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.passed=false;report.failure=(e as Error).message;
 for(const [i,p] of browser.contexts().flatMap(c=>c.pages()).entries()){
  report.errors.push({page:i,url:p.url(),visible:(await p.locator('body').innerText().catch(()=>'' )).slice(0,4000)});
  await p.screenshot({path:`${out}/${label}-failure-${i}.png`}).catch(()=>{});
 }throw e;}
finally{report.finishedAt=new Date().toISOString();await writeFile(`${out}/${label}.json`,JSON.stringify(report,null,2));await browser.close();}
