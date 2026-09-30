// Read-only public playback proof. No credentials, wallet or transaction writes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const [app,epoch,id,out]=process.argv.slice(2);
assert(/^0x[\da-f]{40}$/i.test(app)&&/^\d+$/.test(epoch)&&/^\d+$/.test(id)&&out?.startsWith('artifacts/qualification/'));
const origin='https://pongit.xyz',reference={chainId:10143,app,epoch,id};
const response=await fetch(`${origin}/api/agents/replay?app=${app}&epoch=${epoch}&id=${id}`);
assert(response.ok);const replay=await response.json();assert.equal(replay.availability,'available');assert(replay.frameCount>2);
await mkdir(out,{recursive:true});
const report:any={startedAt:new Date().toISOString(),scope:'Actual public replay API and desktop Chrome/Edge with emulated mobile viewport; no engine, passkey or write',reference,frameCount:replay.frameCount,checks:[],passed:false};
try{
 for(const channel of ['chrome','msedge']){
  const browser=await chromium.launch({channel,headless:true});
  try{for(const [width,height] of [[360,640],[1440,1000]]){
   const context=await browser.newContext({viewport:{width,height}});const blocked:string[]=[],errors:string[]=[];
   await context.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'})));
   await context.route('**/*',async route=>{
    const r=route.request(),u=new URL(r.url());
    if(u.origin===origin&&r.method()==='GET')return route.continue();
    if(u.origin==='https://testnet-rpc.monad.xyz'&&r.method()==='POST'){
     let method:string;try{method=r.postDataJSON()?.method;}catch{method='';}
     if(['eth_chainId','eth_getBlockByNumber','eth_blockNumber'].includes(method))return route.continue();
    }
    blocked.push(`${r.method()} ${u.origin}`);return route.abort();
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message.split('\n')[0]));page.setDefaultTimeout(20000);
   try{
    await page.goto(`${origin}/agents/arenas/${app}/${epoch}/${id}`,{waitUntil:'domcontentloaded'});
    const open=page.getByRole('button',{name:'Watch replay',exact:true});await open.click();
    const dialog=page.getByRole('dialog',{name:'Match replay',exact:true});await dialog.locator('canvas').waitFor();
    const controls=await dialog.locator('button').evaluateAll(buttons=>buttons.map(b=>({radius:getComputedStyle(b).borderRadius,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})));
    assert(controls.every(c=>c.radius==='0px'&&c.width>=44&&c.height>=44),'Replay controls lost their pixel shape or touch size');
    assert((await dialog.evaluate(el=>getComputedStyle(el).borderImageSource)).includes('frame-violet.svg'),'Replay frame differs from Pixel Palace');
    const box=await dialog.locator('canvas').boundingBox();assert(box&&box.width>200&&box.height>110&&Math.abs(box.width/box.height-16/9)<.03);
    const slider=dialog.getByRole('slider',{name:'Replay position'});assert.equal(await slider.getAttribute('max'),String(replay.frameCount-1));
    await dialog.getByRole('button',{name:'Play replay',exact:true}).click();await page.waitForTimeout(1800);assert(Number(await slider.inputValue())>0);
    await slider.fill(String(replay.frameCount-1));await page.waitForTimeout(200);
    const last=replay.frames.at(-1).state;await dialog.getByText(`${last.scoreA} : ${last.scoreB}`,{exact:true}).waitFor();
    assert(await page.evaluate(()=>getComputedStyle(document.body).overflow==='hidden'&&document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:`${out}/${channel}-${width}.png`,fullPage:true});
    await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert(await open.evaluate(el=>el===document.activeElement));
    assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
    report.checks.push({channel,width,height,playback:true,finalScore:[last.scoreA,last.scoreB],focus:true,pixelControls:true,blockedRequests:blocked.length});
   }catch(e){await page.screenshot({path:`${out}/${channel}-${width}-failure.png`,fullPage:true}).catch(()=>{});throw e;}
   finally{await context.unrouteAll({behavior:'ignoreErrors'});await context.close();}
  }}finally{await browser.close();}
 }
 report.passed=true;
}catch(e){report.error=String((e as Error).message).split('\n')[0];process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));}
