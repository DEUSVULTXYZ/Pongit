// Actual public HTTPS smoke, with no response interception or signing keys.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
const channel=process.env.BROWSER_CHANNEL;
assert(channel==='chrome'||channel==='msedge');
const run=process.env.PONG_PREVIEW_BROWSER_RUN??'1';assert(/^[1-9][0-9]?$/.test(run));
const out=`/diagnostics/public-${channel}-${run}`;await mkdir(out,{recursive:true});
const report:any={startedAt:new Date().toISOString(),channel,origin:'https://pongit.xyz',mocked:false,passed:false,checks:[],errors:[]};
const browser=await chromium.launch({channel,headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext();
 await context.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'})));
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message.slice(0,250)));
 let publicationCalls=0,publicationDelayed=false;
 if(process.env.PONG_PREVIEW_DELAY_PUBLISHED==='1'){
  report.publicationDelayInjected=true;
  // Production can use either the API subdomain or the same-origin /api proxy.
  await page.route(/\/agents\/matches\//,async route=>{
   if(++publicationCalls===2){publicationDelayed=true;await new Promise(r=>setTimeout(r,12000));publicationDelayed=false;}
   await route.continue();
  });
 }
 const watchOnly=process.env.PONG_PREVIEW_WATCH_ONLY==='1';
 for(const width of watchOnly?[]:[360,390,768,1440]){
  await page.setViewportSize({width,height:width<500?800:1000});
  await page.goto('https://pongit.xyz/',{waitUntil:'domcontentloaded'});
  await page.getByRole('link',{name:/Play an agent/}).waitFor();
  await page.getByRole('link',{name:/Watch agents/}).waitFor();
  await page.getByRole('button',{name:/Play a person/}).waitFor();
  await page.getByRole('link',{name:/Play an agent/}).click();
  await page.getByRole('button',{name:'Challenge NOVA',exact:true}).waitFor({timeout:60000});
  for(const name of ['NOVA','PULSE','ONYX','VECTOR','DRIFT','ECHO','GLITCH','VIPER'])await page.getByRole('heading',{name,exact:true}).waitFor();
  await page.getByText(/^Testnet preview\./).waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);assert(!overflow,`Catalogue overflow ${width}`);
  await page.screenshot({path:`${out}/catalog-${width}.png`,fullPage:true});
  await page.getByRole('link',{name:'Tournaments',exact:true}).click();
  await page.getByRole('heading',{name:/Tournament #/}).waitFor({timeout:60000});
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),`Tournaments overflow ${width}`);
  await page.screenshot({path:`${out}/tournament-${width}.png`,fullPage:true});
  report.checks.push({width,home:true,eightBots:true,preview:true,tournament:true,noOverflow:true});
 }
 let games:any[]=[];const until=Date.now()+(watchOnly?180000:0);
 do{const response=await page.request.get('https://pongit.xyz/api/agents/live');assert(response.ok());games=(await response.json()).items;
  if(games.length||!watchOnly)break;await page.waitForTimeout(3000);
 }while(Date.now()<until);
 if(watchOnly)assert(games.length,'No public live match became available');
 if(games.length){
  const ref=games[0].ref;report.liveRef=ref;
  await page.goto(`https://pongit.xyz/agents/arenas/${ref.app}/${ref.epoch}/${ref.id}`,{waitUntil:'domcontentloaded'});
  await page.locator('canvas').first().waitFor({timeout:60000});
  if(report.publicationDelayInjected){
   const deadline=Date.now()+60000;
   while(!publicationDelayed&&Date.now()<deadline)await page.waitForTimeout(100);
   report.publicationCalls=publicationCalls;
   assert(publicationDelayed,'The second actual published-result request must be intercepted');
  }
  const hashes=[],delayedHashes=[];
  for(let i=0;i<(report.publicationDelayInjected?16:4);i++){await page.waitForTimeout(1200);const png=await page.locator('canvas').first().screenshot();const hash=createHash('sha256').update(png).digest('hex');hashes.push(hash);if(publicationDelayed)delayedHashes.push(hash);}
  report.liveCanvas={rendered:true,changed:new Set(hashes).size>1,hashes};assert(report.liveCanvas.changed,'Live canvas must progress');
  if(report.publicationDelayInjected){report.duringPublicationDelay={samples:delayedHashes.length,changed:new Set(delayedHashes).size>1};assert(report.duringPublicationDelay.changed,'Engine rendering must continue during the delayed result check');}
  await page.screenshot({path:`${out}/live.png`,fullPage:true});
 }else report.liveCanvas={rendered:false,reason:'No live admission at observation'};
 assert.equal(report.errors.length,0,'Public page runtime errors');report.passed=true;
}catch(e){report.failure=String((e as Error).message);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
