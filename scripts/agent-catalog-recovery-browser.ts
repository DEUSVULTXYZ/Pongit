// Real browser/CSS against an isolated build. Contract/API states are fixtures;
// this suite cannot establish hosted admission latency or live game fluidity.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {pooledHouseBots} from '../shared/agent-pool';
import {agentAvailability,type AgentCapacity} from '../shared/agent-availability';

const origin=process.env.PONG_CATALOG_ORIGIN??'http://127.0.0.1:4197';
assert.equal(new URL(origin).hostname,'127.0.0.1');
const channel=process.env.BROWSER_CHANNEL??'chrome';
const output=process.env.PONG_CATALOG_OUTPUT??'artifacts/qualification/20260929/catalog-recovery-1';
const manifest=JSON.parse(await readFile('deployments/agent-pool.json','utf8'));
const owner='0x0000000000000000000000000000000000000200';
const people=pooledHouseBots.map((b,i)=>({...b,agent:`0x${(100+i).toString(16).padStart(40,'0')}`,creator:owner,official:true,modes:[0,1],qualification:{0:true,1:true},available:true,waiting:false}));
const report:any={at:new Date().toISOString(),channel,scope:'Isolated UI and synthetic API; no chain writes, passkeys or hosted game claim',checks:[],errors:[]};
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel,headless:true});
let lastPage:import('@playwright/test').Page|undefined;
try{
 for(const [width,height] of [[360,640],[390,844],[768,1000],[1440,1000],[844,390]]){
  let capacity:AgentCapacity={known:false,admissions:true,serviceUnavailable:true,reason:'publication',readyArenas:0,freeChallengeLanes:4,observedAt:Date.now()};
  let pending=false,staleCatalog=false,writes=0,preflights=0;
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<=390||height<=390,reducedMotion:width===390?'reduce':'no-preference',recordVideo:{dir:`${output}/${channel}-${width}-video`,size:{width,height}}});
  await context.addInitScript({content:'globalThis.__name=(fn)=>fn;'});
  await context.addInitScript(({owner})=>{
   localStorage.setItem('pongit:remembered-passkey',JSON.stringify({address:owner,credential:{credentialId:'read-only-fixture'},rpId:'pongit.xyz'}));
   localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,background:false}));
   Object.defineProperty(navigator.credentials,'get',{value:()=>{(window as any).passkeyCalls=((window as any).passkeyCalls??0)+1;return Promise.reject(Error('Fixture refuses passkeys'));}});
  },{owner});
  await context.route('**/*',async route=>{
   const r=route.request(),u=new URL(r.url());if(u.origin===origin)return route.continue();
   const p=u.pathname.replace(/^\/api\//,'/');
   if(r.method()!=='GET'){writes++;return route.abort();}
   if(p==='/agents/events')return route.fulfill({status:503,body:'Polling fixture'});
   const advertised=staleCatalog?{...capacity,known:true,serviceUnavailable:false,readyArenas:4}:capacity;
   let body:any;
   if(p==='/agents/config')body={...manifest,enabled:true};
   else if(p==='/agents/catalog')body={items:people.map(bot=>({...bot,availability:{0:agentAvailability(advertised,{modeSupported:true,qualified:true,available:true,exclusiveBusy:false}),1:agentAvailability(advertised,{modeSupported:true,qualified:true,available:true,exclusiveBusy:false})}})),capacity:advertised,next:null};
   else if(p==='/agents/capacity'){preflights++;body={capacity};}
   else if(p==='/agents/live')body={items:[]};
   else if(p===`/agents/challenges/${owner}`)body={request:pending?{id:'1',player:owner,agent:people[0].agent,mode:1,status:1,at:'1',ref:null,waitReason:'arena',progress:{stage:'unavailable',revision:'outage',observedAt:Date.now()}}:null};
   else{report.errors.push(`Unexpected external GET ${p}`);return route.abort();}
   return route.fulfill({json:body});
  });
  const page=await context.newPage();lastPage=page;page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('503 (Service Unavailable)'))report.errors.push(m.text().slice(0,250));});
  await page.goto(origin+'/agents');await page.getByRole('button',{name:'Challenge NOVA',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
  const modes=page.getByRole('group',{name:'Game mode'}),classic=modes.getByRole('button',{name:'Classic',exact:true}),chaos=modes.getByRole('button',{name:'Chaos',exact:true});
  assert.equal(await classic.getAttribute('aria-pressed'),'true');await chaos.click();assert.equal(await chaos.getAttribute('aria-pressed'),'true');
  const design=await chaos.evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return{radius:s.borderRadius,border:s.borderColor,height:r.height,width:r.width,icon:!!el.querySelector('svg')};});
  assert.equal(design.radius,'0px');assert(design.icon&&design.height>=44&&design.width>=44);assert.notEqual(design.border,await classic.evaluate(el=>getComputedStyle(el).borderColor),'Selected mode has no distinct pixel border');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Catalogue overflow');
  assert.equal(await page.locator('.agent-grid').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),width>=1100?4:2);
  const tooSmall=await page.locator('main button').evaluateAll(els=>els.filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.width<44||r.height<44);}).map(el=>el.getAttribute('aria-label')??el.textContent));assert.deepEqual(tooSmall,[]);
  const incident=page.locator('[data-arcade-progress=unavailable]');await incident.waitFor();
  await page.getByRole('button',{name:'Challenge NOVA',exact:true}).click();await page.getByText('NOVA is selected.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.evaluate(()=>(window as any).passkeyCalls??0),0);assert.equal(writes,0);
  assert.equal(await incident.evaluate(el=>el.getAnimations({subtree:true}).length),0,'Incident is still a fake loading animation');
  await page.screenshot({path:`${output}/${channel}-${width}-outage.png`,fullPage:true});
  // A stale available catalogue must be checked again before opening passkeys.
  staleCatalog=true;await page.reload();await page.getByRole('button',{name:'Challenge NOVA',exact:true}).click();await incident.waitFor();
  assert(preflights>0);assert.equal(await page.getByRole('dialog').count(),0);assert.equal(writes,0);staleCatalog=false;
  // Existing requests survive the outage, and cancellation remains accessible.
  pending=true;await page.reload();await page.getByRole('button',{name:'Cancel challenge',exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'Cancel challenge',exact:true}).isEnabled());assert.equal(await page.locator('[data-arcade-progress=capacity]').count(),0);
  await page.screenshot({path:`${output}/${channel}-${width}-saved-request.png`,fullPage:true});pending=false;
  // Healthy, occupied capacity is a queue, not an outage. A house tournament
  // does not reserve the archetype or prevent another friendly challenge.
  capacity={...capacity,known:true,serviceUnavailable:false,readyArenas:0,freeChallengeLanes:0};await page.reload();
  const challenge=page.getByRole('button',{name:'Challenge NOVA',exact:true});await challenge.waitFor();await challenge.click();await page.getByRole('dialog',{name:'Connect to challenge an agent'}).waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.locator(':focus').getAttribute('aria-label'),'Challenge NOVA');
  capacity={...capacity,readyArenas:4,freeChallengeLanes:4};await page.reload();await challenge.waitFor();
  await page.screenshot({path:`${output}/${channel}-${width}-ready.png`,fullPage:true});
  if(width===1440){await page.evaluate(()=>{document.documentElement.style.zoom='2';});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'2x zoom overflow');await page.screenshot({path:`${output}/${channel}-zoom.png`,fullPage:true});}
  report.checks.push({width,height,pixelModeControls:design,unavailableDoesNotAuthenticate:true,preflightChecksStaleCatalogue:true,requestPreserved:true,cancelAccessible:true,healthyQueueUsable:true,focusRestored:true,writes,preflights});
  await context.close();
 }
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.passed=false;report.error=(e as Error).message;report.page=await lastPage?.locator('body').innerText().catch(()=>null);await lastPage?.screenshot({path:`${output}/${channel}-failure.png`,fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{await browser.close();await writeFile(`${output}/${channel}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
