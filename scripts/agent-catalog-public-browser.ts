// Actual public read-only deployment check. No API fixtures or signing keys.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const channel=process.env.BROWSER_CHANNEL??'chrome';
assert(channel==='chrome'||channel==='msedge');
const out=process.env.PONG_CATALOG_PUBLIC_OUTPUT??'artifacts/qualification/20260929/catalog-public-1';
await mkdir(out,{recursive:true});
const report:any={at:new Date().toISOString(),channel,scope:'Actual HTTPS and canonical API; read-only, no live-game or physical-passkey claim',checks:[],errors:[],writes:0,blockedRequests:[]};
const browser=await chromium.launch({channel,headless:true});
let lastPage:import('@playwright/test').Page|undefined;
try{
 const context=await browser.newContext();
 await context.addInitScript({content:'globalThis.__name=(fn)=>fn;'});
 await context.addInitScript(()=>{
  localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,background:false}));
  Object.defineProperty(navigator.credentials,'get',{value:()=>{(window as any).passkeyCalls=((window as any).passkeyCalls??0)+1;return Promise.reject(Error('Read-only check refuses passkeys'));}});
 });
 // A regression must fail without creating a public challenge or sponsorship.
 await context.route('**/*',async route=>{
  if(route.request().method()!=='GET'){
   const request=route.request(),url=new URL(request.url());let rpcMethod:unknown;
   try{rpcMethod=request.postDataJSON()?.method;}catch{}
   report.blockedRequests.push({origin:url.origin,path:url.pathname,method:request.method(),rpcMethod:typeof rpcMethod==='string'?rpcMethod:undefined});
   report.writes++;return route.abort();
  }
  return route.continue();
 });
 const page=await context.newPage();lastPage=page;page.setDefaultTimeout(20000);
 page.on('pageerror',e=>report.errors.push(e.message));
 const capacityResponse=await context.request.get('https://pongit.xyz/api/agents/capacity');
 assert(capacityResponse.ok());const {capacity}=await capacityResponse.json();report.capacity=capacity;
 for(const size of [{width:360,height:640},{width:390,height:844},{width:768,height:1024},{width:1440,height:1000}]){
  await page.setViewportSize(size);const start=Date.now();
  const response=await page.goto('https://pongit.xyz/agents',{waitUntil:'domcontentloaded'});assert.equal(response?.status(),200);
  await page.getByRole('button',{name:'Challenge NOVA',exact:true}).waitFor();
  const catalogueMs=Date.now()-start;
  assert.equal(await page.getByText('PONGIT BOT',{exact:true}).count(),8);
  assert(await page.locator('.agent-card').count()>=8,'Community registrations must remain visible');
  const modes=page.getByRole('group',{name:'Game mode'}),chaos=modes.getByRole('button',{name:'Chaos',exact:true});
  await chaos.click();assert.equal(await chaos.getAttribute('aria-pressed'),'true');
  const design=await chaos.evaluate(el=>({radius:getComputedStyle(el).borderRadius,height:el.getBoundingClientRect().height,icon:!!el.querySelector('svg')}));
  assert(design.radius==='0px'&&design.height>=44&&design.icon);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.getByText(/No entry fees|Testnet preview|No fees or prize/i).count(),0);
  const down=await page.locator('[data-arcade-progress=unavailable]').count();
  if(down){
   await page.getByRole('button',{name:'Challenge NOVA',exact:true}).click();
   await page.getByText('NOVA is selected.',{exact:false}).waitFor();
   assert.equal(await page.getByRole('dialog').count(),0);
   assert.equal(await page.evaluate(()=>(window as any).passkeyCalls??0),0);
  }
  // Full-page screenshots do not cause below-fold lazy portraits to load.
  // Visit every row and verify decoded images rather than accepting blank cards.
  for(const card of await page.locator('.agent-card').all())await card.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll<HTMLImageElement>('.agent-card img')).every(img=>img.complete&&img.naturalWidth>0));
  await page.getByRole('heading',{name:'Agent Arcade',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/${channel}-${size.width}.png`,fullPage:true});
  report.checks.push({...size,catalogueMs,pixelMode:design,outageSelection:!!down,noOverflow:true,portraitsDecoded:true});
 }
 for(const path of ['/','/agents/tournaments','/docs']){
  const response=await page.goto('https://pongit.xyz'+path,{waitUntil:'domcontentloaded'});assert.equal(response?.status(),200);
  await page.locator('main').waitFor();report.checks.push({path,status:response?.status()});
 }
 assert.equal(report.writes,0);assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.passed=false;report.failure=(e as Error).message;report.page=await lastPage?.locator('body').innerText().catch(()=>null);await lastPage?.screenshot({path:`${out}/${channel}-failure.png`,fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{await browser.close();await writeFile(`${out}/${channel}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
