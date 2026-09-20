// Actual private web/API/replay; no account, signer or transaction transport.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium,type Page} from '@playwright/test';
import {validateAgentPoolManifest} from '../shared/agent-pool';
assert.equal(process.env.PONG_POOL_REPLAY_BROWSER,'private-vps');
const manifest=validateAgentPoolManifest(JSON.parse(await readFile('/manifest/manifest.json','utf8')));
assert.equal(manifest.enabled,false);
const app=process.env.PONG_REPLAY_APP!,epoch=process.env.PONG_REPLAY_EPOCH!,id=process.env.PONG_REPLAY_ID!;
assert(manifest.arenas.some(a=>a.app.toLowerCase()===app.toLowerCase())&&/^\d+$/.test(epoch)&&/^\d+$/.test(id));
const api='http://pongit-series3-reader-replays:4101',web='http://pongit-series3-web:3000',origin='https://pongit.xyz';
const replay=await (await fetch(`${api}/agents/replay?app=${app}&epoch=${epoch}&id=${id}`)).json();
assert(['available','partial'].includes(replay.availability)&&replay.frameCount>2);
const last=replay.frames.at(-1),report:any={at:new Date().toISOString(),scope:'Actual recorded hosted match, private HTTP and rendered browser. No signatures or engine replay calls.',
 ref:{chainId:10143,app,epoch,id},availability:replay.availability,frames:replay.frameCount,checks:[],passed:false};
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
let currentPage:Page|undefined;
try{
 for(const channel of ['chrome','msedge']){
  browser=await chromium.launch({channel,headless:true,args:['--no-sandbox']});
  for(const [width,height] of [[360,640],[1440,1000]]){
   const context=await browser.newContext({viewport:{width,height}});let engineCalls=0;const errors:string[]=[];
   await context.route('**/*',async route=>{
    const r=route.request(),u=new URL(r.url());
    try{
     if(u.origin===origin)return route.fulfill({response:await route.fetch({url:web+u.pathname+u.search})});
     if(u.origin==='http://localhost:4000'){
      assert.equal(r.method(),'GET');assert(u.pathname.startsWith('/agents/'));
      const response=await route.fetch({url:api+u.pathname+u.search});
      if(u.pathname==='/agents/config')return route.fulfill({response,json:{...await response.json(),enabled:true}});
      return route.fulfill({response});
     }
     engineCalls++;await route.abort('blockedbyclient');
    }catch(e){errors.push((e as Error).message.split('\n')[0]);await route.abort().catch(()=>{});}
   });
   const page=await context.newPage();currentPage=page;page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`${origin}/agents/arenas/${app}/${epoch}/${id}`);
   await page.getByRole('button',{name:'Enter muted',exact:true}).click();
   const open=page.getByRole('button',{name:'Watch replay',exact:true});await open.click();
   const dialog=page.getByRole('dialog',{name:'Match replay'});await dialog.locator('canvas').waitFor();
   const court=await dialog.locator('canvas').boundingBox();assert(court&&court.width>200&&court.height>110,'The recorded court has visible area');
   assert(Math.abs(court.width/court.height-16/9)<.03,'Replay retains the actual court proportions');
   const slider=dialog.getByRole('slider',{name:'Replay position'});assert.equal(await slider.getAttribute('max'),String(replay.frameCount-1));
   await dialog.getByRole('button',{name:'Play replay',exact:true}).click();await page.waitForTimeout(1800);
   assert(Number(await slider.inputValue())>0,'Actual replay advances');
   await slider.fill(String(replay.frameCount-1));await page.waitForTimeout(200);
   await dialog.getByText(`${last.state.scoreA} : ${last.state.scoreB}`,{exact:true}).waitFor();
   assert(await page.evaluate(()=>getComputedStyle(document.body).overflow==='hidden'));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:`/diagnostics/replay-${channel}-${width}.png`,fullPage:true});
   await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert(await open.evaluate(e=>e===document.activeElement));
   assert.equal(engineCalls,0);assert.deepEqual(errors,[]);report.checks.push({channel,width,height,court,finalScore:[last.state.scoreA,last.state.scoreB],engineCalls,playback:true,focus:true});
   await context.unrouteAll({behavior:'ignoreErrors'});await context.close();
  }
  await browser.close();browser=undefined;
 }
 report.passed=true;
}catch(e){report.error=(e as Error).message.split('\n')[0];process.exitCode=1;
 if(currentPage&&!currentPage.isClosed()){report.page=await currentPage.locator('body').innerText();await currentPage.screenshot({path:'/diagnostics/replay-failure.png',fullPage:true});}}
finally{
 await writeFile('/diagnostics/series-replay-browser.json',JSON.stringify(report,null,2));
 if(browser){for(const c of browser.contexts())await c.unrouteAll({behavior:'ignoreErrors'});await browser.close();}
 console.log(JSON.stringify(report));
}
