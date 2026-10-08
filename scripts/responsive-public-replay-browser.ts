// Public, read-only replay qualification. Uses retained frames, never a fixture API.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const run=process.env.PONG_REPLAY_RUN!,ref=process.env.PONG_REPLAY_REF!;
assert(/^[a-z0-9-]+$/.test(run));
assert(/^0x[\da-fA-F]{40}\/\d+\/\d+$/.test(ref));
const [app,epoch,id]=ref.split('/'),origin='https://pongit.xyz';
const out=`artifacts/qualification/${run}`;await mkdir(out,{recursive:true});
const report:any={startedAt:new Date().toISOString(),origin,ref,passed:false,checks:[],physicalMobile:false};
const candidateCss=process.env.PONG_REPLAY_CANDIDATE_CSS==='1'?await readFile('web/components/AgentReplay.module.css','utf8'):null;
report.candidateCss=!!candidateCss;
const widths=process.env.PONG_REPLAY_WIDTHS?process.env.PONG_REPLAY_WIDTHS.split(',').map(Number):[360,390,768,1366,1440];
assert(widths.every(w=>[360,390,768,1366,1440].includes(w)));
await writeFile(out+'/report.json',JSON.stringify(report),{flag:'wx'});
try{
 const response=await fetch(`${origin}/api/agents/replay?${new URLSearchParams({app,epoch,id})}`,{signal:AbortSignal.timeout(15000)});
 assert(response.ok,'Public retained replay endpoint failed');
 const replay=await response.json();assert.equal(replay.availability,'available');assert(replay.frameCount>2);
 const last=replay.frames.at(-1);report.frames=replay.frameCount;
 for(const channel of ['chrome','msedge']){
  const browser=await chromium.launch({channel,headless:false});
  try{for(const width of widths){
   const context=await browser.newContext({viewport:{width,height:width===1366?768:width<768?844:900},hasTouch:width<768,reducedMotion:'reduce'});
   let writes=0;const errors:string[]=[];
   await context.route('**/*',async route=>{
    const req=route.request();if(req.method()==='GET')return route.continue();
    let method='';try{method=req.postDataJSON()?.method??'';}catch{}
    if(['eth_chainId','eth_call','eth_getCode','eth_getBalance','eth_getStorageAt','eth_blockNumber','eth_getBlockByNumber','eth_getTransactionReceipt','eth_getLogs'].includes(method))return route.continue();
    writes++;await route.abort();
   });
   await context.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,background:false})));
   const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(`${origin}/agents/arenas/${ref}`,{waitUntil:'domcontentloaded'});
    const open=page.getByRole('button',{name:'Watch replay',exact:true}).first();await open.click();
    const dialog=page.getByRole('dialog',{name:'Match replay',exact:true});await dialog.locator('canvas').waitFor();
    if(candidateCss){
     const classes=await dialog.evaluate(e=>Array.from(new Set([e,...e.querySelectorAll('*')].flatMap(n=>Array.from(n.classList)))).filter(c=>c.startsWith('AgentReplay-module__')));
     let css=candidateCss.replace(/:global\(([^)]+)\)/g,'$1');
     for(const key of ['replay','heading','controls','accessibleScore','modal','recording','court']){
      const actual=classes.find(c=>c.endsWith('__'+key));if(actual)css=css.replace(new RegExp('\\.'+key+'(?![\\w-])','g'),'.'+actual);
     }
     await page.addStyleTag({content:css});
    }
    const court=await dialog.locator('canvas').boundingBox();assert(court&&court.width>200&&Math.abs(court.width/court.height-16/9)<.03);
    if(width===1440)assert(court.width>=1100,'Desktop replay must use the large court');
    if(width===1366)assert(court.width>=900,'Compact desktop replay must use the large court');
    if(width>=1024)assert(await dialog.evaluate(e=>e.scrollHeight<=e.clientHeight+1),'Desktop replay controls must fit without scrolling');
    const slider=dialog.getByRole('slider',{name:'Replay position'});assert.equal(await slider.getAttribute('max'),String(replay.frameCount-1));
    await dialog.getByRole('button',{name:'Play replay',exact:true}).click();await page.waitForTimeout(1800);assert(Number(await slider.inputValue())>0);
    await page.screenshot({path:`${out}/${channel}-${width}-playing.png`});
    await slider.fill(String(replay.frameCount-1));
    const score=dialog.locator('.score');assert.deepEqual(await score.locator('span').allTextContents(),[last.state.scoreA,last.state.scoreB].map(n=>String(n).padStart(2,'0')));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert(await open.evaluate(e=>e===document.activeElement));
    assert.equal(writes,0);assert.deepEqual(errors,[]);
    report.checks.push({channel,width,court,finalScore:[last.state.scoreA,last.state.scoreB],playback:true,focus:true,writes});
   }catch(error){
    report.failureLayout=await page.getByRole('dialog',{name:'Match replay',exact:true}).evaluate(e=>[e,...e.querySelectorAll('header,section,p,canvas,[class*="__controls"],[class*="__recording"]')].map(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();return{tag:n.tagName,class:n.className,y:r.y,width:r.width,height:r.height,padding:s.padding,margin:s.margin,scroll:n.scrollHeight,client:n.clientHeight};})).catch(()=>[]);
    await page.screenshot({path:`${out}/${channel}-${width}-failure.png`,fullPage:true}).catch(()=>{});throw error;
   }
   finally{await context.unrouteAll({behavior:'ignoreErrors'});await context.close();}
  }}finally{await browser.close();}
 }
 report.passed=true;
}catch(error){report.error=(error as Error).message.split('\n')[0];process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({out,passed:report.passed,checks:report.checks.length,error:report.error}));}
