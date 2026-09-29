// Actual production UI, synthetic read-only APIs. No passkeys or chain submissions.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {zeroHash,type Address} from 'viem';
import {pooledHouseBots,type AgentPoolManifest} from '../shared/agent-pool';
import type {ArcadeStage} from '../shared/arcade-progress';

const origin=process.env.PONG_PROGRESS_ORIGIN??'http://127.0.0.1:4196';
assert.equal(new URL(origin).hostname,'127.0.0.1');
const channel=process.env.BROWSER_CHANNEL??'chrome',output=process.env.PONG_PROGRESS_OUTPUT??'artifacts/qualification/20260929/progress-1';
const address=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const node=JSON.parse(await readFile('deployments/agents.json','utf8')).node;
const manifest:AgentPoolManifest={version:5,rulesVersion:15,houseInstances:'official-v1',countdownClock:'engine-ticks-v1',chainId:10143,engineChainId:4242,
 hub:address(1),pool:address(2),catalog:address(3),tournaments:address(4),ratings:address(5),challenges:address(6),qualifications:address(7),family:address(8),
 arenas:[9,10,11,12,13,14,15].map(n=>({app:address(n),node,runtimeHash:zeroHash})),
 enabled:true,tournamentsEnabled:true,verifiedCapacity:5,qualificationEvidence:`0x${'b'.repeat(64)}`,maxMatches:5,
 lanes:{tournament:1,challenge:4},arenaAdmissions:'verified-epoch-v1',durationSeconds:300,overtimeSeconds:60,intervalSeconds:60};
const people=pooledHouseBots.map((p,i)=>({...p,agent:address(100+i),creator:address(90),official:true,available:true,waiting:false,modes:[0,1],qualification:{0:true,1:true},availability:{0:'available',1:'available'},friendlyInstances:{0:true,1:true}}));
const report:any={at:new Date().toISOString(),build:process.env.PONG_BROWSER_BUILD??'development',scope:'Isolated app, synthetic API states; no hosted game or physical device claim',channel,checks:[],errors:[]};
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel,headless:true});
try{
 for(const [width,height] of [[360,640],[390,844],[768,1000],[1440,1000],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:width===390?'reduce':'no-preference',hasTouch:width<=390,recordVideo:{dir:`${output}/video-${channel}-${width}`,size:{width:Math.min(width,1440),height}}});
  await context.addInitScript(({owner})=>{
   localStorage.setItem('pongit:remembered-passkey',JSON.stringify({address:owner,credential:{credentialId:'read-only-fixture'},rpId:'pongit.xyz'}));
   localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,background:false}));
  },{owner:address(200)});
  let stage:ArcadeStage='capacity',progress:undefined|{completed:number;total:number},failed=false;
  let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});let catalogLoading=true;
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.pathname.startsWith('/api/'))u.pathname=u.pathname.slice(4);
   if(u.origin===origin)return route.continue();
   if(req.method()!=='GET'){report.errors.push(`Unexpected write: ${u.pathname}`);return route.abort();}
   if(u.pathname==='/agents/events')return route.fulfill({status:503,body:'Use fallback reads'});
   let body:unknown;
   if(u.pathname==='/agents/config')body=manifest;
   else if(u.pathname==='/agents/catalog'){if(catalogLoading)await gate;body={items:people,next:null};}
   else if(u.pathname==='/agents/live')body={items:[]};
   else if(u.pathname===`/agents/challenges/${address(200)}`){
    if(failed)return route.fulfill({status:503,json:{error:'Arena recovery is required. Your challenge is saved.',code:'AGENT_RECOVERING'}});
    body={request:{id:'1',player:address(200),agent:people[0].agent,mode:0,status:1,at:'1',ref:null,waitReason:'arena',progress:{stage,observedAt:Date.now(),revision:stage,progress}}};
   }else{return route.fulfill({status:503,json:{error:'Synthetic fixture has no external service'}});}
   return route.fulfill({json:body});
  });
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`${origin}/agents`);
  await page.locator('[data-arcade-progress="loading"]').waitFor();
  assert.equal(await page.getByRole('progressbar',{name:'Loading your rivals'}).getAttribute('aria-valuenow'),null);
  catalogLoading=false;release();await page.getByRole('button',{name:'Challenge NOVA',exact:true}).waitFor();
  await page.locator('[data-arcade-progress="capacity"]').waitFor();
  const heights:number[]=[];
  for(stage of ['capacity','sponsorship','confirmation','preparing','synchronizing'] as ArcadeStage[]){
   // Reload exercises the restored challenge, not a test-only React prop setter.
   await page.reload();const panel=page.locator(`[data-arcade-progress="${stage}"]`);await panel.waitFor();
   const bar=panel.getByRole('progressbar');assert.equal(await bar.getAttribute('aria-valuenow'),null);
   assert(await page.getByRole('button',{name:'Cancel challenge',exact:true}).isEnabled());
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.evaluate(()=>document.fonts.ready);
   const box=await panel.boundingBox();assert(box);heights.push(box.height);
   await panel.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/${channel}-${width}-${stage}.png`,fullPage:true});
   if(width===1440)await panel.screenshot({path:`${output}/${channel}-${stage}-panel.png`});
  }
  assert(Math.max(...heights)-Math.min(...heights)<1,'Wait transitions changed reserved panel height');
  const panel=page.locator('[data-arcade-progress="synchronizing"]');
  const a=await panel.locator('[aria-hidden=true]').last().boundingBox();await page.waitForTimeout(250);
  const b=await panel.locator('[aria-hidden=true]').last().boundingBox();assert(a&&b);
  if(width===390)assert.equal(a.x,b.x,'Reduced motion still animates');else assert.notEqual(a.x,b.x,'Pixel ball does not animate');
  progress={completed:2,total:4};stage='preparing';await page.reload();
  await page.waitForFunction(()=>document.querySelector('[data-measured=true] [role=progressbar]')?.getAttribute('aria-valuenow')==='2');
  assert.equal(await page.locator('[data-measured=true] [data-filled=true]').count(),8);
  failed=true;await page.reload();await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('[data-incident=true]').evaluateAll(nodes=>nodes.flatMap(n=>n.getAnimations({subtree:true})).length),0,'Incident must stop loading animation');
  await page.screenshot({path:`${output}/${channel}-${width}-incident.png`,fullPage:true});
  report.checks.push({width,height,animated:width!==390,reducedMotion:width===390,unknownHasNoPercentage:true,measuredSegments:8,reservedHeight:true,cancelAccessible:true,restoredChallenge:true});
  await context.close();
 }
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.passed=false;report.error=(e as Error).message;process.exitCode=1;}
finally{await browser.close();await writeFile(`${output}/${channel}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
