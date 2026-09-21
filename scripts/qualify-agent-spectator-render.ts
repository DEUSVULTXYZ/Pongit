import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const channel=process.env.BROWSER_CHANNEL??'chrome',run=process.env.RENDER_RUN??'before';
assert(['chrome','msedge'].includes(channel)&&/^[a-z0-9-]+$/.test(run));
const out=`/diagnostics/agent-spectator/${run}-${channel}`;await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel,headless:true,args:['--no-sandbox']});
const report:any={at:new Date().toISOString(),channel,run,passed:false,mocked:false};
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.addInitScript(()=>{
  localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'}));
  (window as any).__ballFrames=[];
  const fill=CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){
   fill.call(this,x,y,w,h);
   if(w===12&&h===12&&['#f3fcff','#e7deff'].includes(String(this.fillStyle))&&this.canvas.closest('.pool-canvas-slot')){
    const frames=(window as any).__ballFrames;if(frames.length<6000)frames.push({at:performance.now(),x:x+6,y:y+6});
   }
  };
 });
 let game:any;
 const deadline=Date.now()+120000;
 while(Date.now()<deadline&&!game){
  const response=await page.request.get('https://pongit.xyz/api/agents/live');assert(response.ok());
  game=(await response.json()).items.find((g:any)=>g.mode===0);
  if(!game)await page.waitForTimeout(4000);
 }
 assert(game,'No actual live Classic agent match within two minutes');report.ref=game.ref;
 await page.goto(`https://pongit.xyz/agents/arenas/${game.ref.app}/${game.ref.epoch}/${game.ref.id}`,{waitUntil:'domcontentloaded'});
 const court=page.locator('.pool-canvas-slot canvas');await court.waitFor({timeout:60000});
 await page.waitForTimeout(4000);await page.evaluate(()=>(window as any).__ballFrames=[]);
 await page.waitForTimeout(12000);
 const frames:any[]=await page.evaluate(()=>(window as any).__ballFrames);report.samples=frames.length;
 await page.screenshot({path:out+'/court.png',fullPage:true});report.text=await page.locator('main').innerText();
 const intervals:number[]=[],freeze:number[]=[];let still=0,moving=0;
 for(let i=1;i<frames.length;i++){
  const dt=frames[i].at-frames[i-1].at;intervals.push(dt);
  if(Math.hypot(frames[i].x-frames[i-1].x,frames[i].y-frames[i-1].y)>.05){moving++;freeze.push(still);still=0;}else still+=dt;
 }
 freeze.push(still);intervals.sort((a,b)=>a-b);
 report.render={inside:frames.filter(f=>f.x>=6&&f.x<=1018&&f.y>=6&&f.y<=570).length/frames.length,
  moving:moving/Math.max(1,frames.length-1),p95FrameMs:intervals[Math.floor(intervals.length*.95)],maxFreezeMs:Math.max(...freeze)};
 await writeFile(out+'/frames.json',JSON.stringify(frames));
 assert(frames.length>200,'Insufficient court ball frames');assert(report.render.inside>.98,'Ball must remain visible');
 assert(report.render.moving>.6,'Ball must move between sparse network updates');
 assert(report.render.p95FrameMs<80,'Rendering is stuttering');assert(report.render.maxFreezeMs<1500,'Long frozen ball');report.passed=true;
}catch(e){report.error=String((e as Error).message);process.exitCode=1;}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
