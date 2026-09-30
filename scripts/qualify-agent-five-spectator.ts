// Candidate HTML, unchanged private contract API and direct hosted engine reads.
// No mocked game state, sessions, signatures, writes or production routing edits.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {clockProgression} from '../shared/clock-progression';
assert(['private-read-only','public-read-only'].includes(process.env.PONG_FIVE_SPECTATOR??''));
const publicSite=process.env.PONG_FIVE_SPECTATOR==='public-read-only';
const channel=process.env.BROWSER_CHANNEL??'chrome',mode=Number(process.env.RENDER_MODE??0),run=process.env.RENDER_RUN!;
assert(['chrome','msedge'].includes(channel)&&[0,1].includes(mode)&&/^[a-z0-9-]+$/.test(run));
const origin=publicSite?'https://pongit.xyz':'http://127.0.0.1:4190',api=publicSite?origin+'/api':'http://127.0.0.1:4193';
const seconds=Number(process.env.RENDER_SECONDS??60);assert(seconds>=30&&seconds<=120);
const out=`artifacts/qualification/20260928/live-${run}-${channel}-${mode}`;await mkdir(out,{recursive:true});
const report:any={startedAt:new Date().toISOString(),channel,mode,seconds,passed:false,
 scope:publicSite?'Actual public HTTPS spectator and direct hosted engine. Read-only headless desktop browser; no game admission, wallet authorization or physical mobile proof.':'Local production build, private API transported unchanged over SSH, direct hosted Interlude HTTP/WebSocket. Headless desktop browser; no physical mobile or public HTTPS journey proof.',errors:[],requests:[]};
const browser=await chromium.launch({channel,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',e=>report.errors.push(e.message.slice(0,300)));
const started=new WeakMap<object,number>();
page.on('request',r=>started.set(r,Date.now()));
page.on('response',r=>{const q=r.request(),u=new URL(r.url());if(u.hostname.includes('fly.dev')){
 let methods:string[]=[];try{const data=q.postDataJSON();methods=(Array.isArray(data)?data:[data]).map(v=>String(v?.method??'HTTP'));}catch{methods=['HTTP'];}
 report.requests.push({at:new Date().toISOString(),host:u.hostname,methods,status:r.status(),ms:Date.now()-(started.get(q)??Date.now())});
}});
try{
 if(!publicSite)await page.route('http://localhost:4000/agents/**',async route=>{assert.equal(route.request().method(),'GET');const u=new URL(route.request().url());const response=await route.fetch({url:api+u.pathname+u.search});await route.fulfill({response});});
 await page.addInitScript(()=>{
  localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'}));
  (window as any).__ball=[];(window as any).__clock=[];
  const fill=CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){fill.call(this,x,y,w,h);
   if(w===12&&h===12&&String(this.fillStyle)==='#f3fcff'&&this.canvas.closest('.pool-canvas-slot')){
    const frames=(window as any).__ball;if(frames.length<12000)frames.push({at:performance.now(),x:x+6,y:y+6});
   }
  };
  setInterval(()=>{const c=document.querySelector<HTMLCanvasElement>('.pool-canvas-slot canvas');if(c&&(window as any).__clock.length<1500)(window as any).__clock.push({at:performance.now(),...c.dataset});},100);
 });
 const afterId=BigInt(process.env.RENDER_AFTER_ID??0);
 let game:any;const admissionDeadline=Date.now()+360000;
 while(!game&&Date.now()<admissionDeadline){
  const live=await page.request.get(api+'/agents/live');assert(live.ok());
  game=(await live.json()).items.find((v:any)=>v.mode===mode&&BigInt(v.ref.id)>afterId);
  if(!game)await page.waitForTimeout(1000);
 }
 assert(game,'No actual live match for requested mode');report.ref=game.ref;
 await page.goto(`${origin}/agents/arenas/${game.ref.app}/${game.ref.epoch}/${game.ref.id}`,{waitUntil:'domcontentloaded'});
 await page.locator('.pool-canvas-slot canvas').waitFor({timeout:60000});
 // Measure actual rallies, not the required launch countdown or loading phase.
 await page.waitForFunction(()=>Number(document.querySelector<HTMLCanvasElement>('.pool-canvas-slot canvas')?.dataset.processedUs??0)>1000000,{},{timeout:30000});
 await page.waitForTimeout(5000);
 await page.evaluate(()=>{(window as any).__ball=[];(window as any).__clock=[];});
 await page.waitForTimeout(seconds*1000);
 const frames:any[]=await page.evaluate(()=>(window as any).__ball),clock:any[]=await page.evaluate(()=>(window as any).__clock);
 await writeFile(out+'/frames.json',JSON.stringify(frames));await writeFile(out+'/clock.json',JSON.stringify(clock));
 await page.screenshot({path:out+'/court.png',fullPage:true});report.text=await page.locator('main').innerText();
 const intervals:number[]=[],holds:any[]=[];let still=0,moving=0;
 for(let i=1;i<frames.length;i++){const dt=frames[i].at-frames[i-1].at;intervals.push(dt);
  if(Math.hypot(frames[i].x-frames[i-1].x,frames[i].y-frames[i-1].y)>.05){moving++;if(still>100)holds.push({at:frames[i].at,ms:still,x:frames[i-1].x,y:frames[i-1].y});still=0;}else still+=dt;
 }
 if(still>100)holds.push({at:frames.at(-1)?.at,ms:still,x:frames.at(-1)?.x,y:frames.at(-1)?.y});
 const quantile=(values:number[],p:number)=>values.sort((a,b)=>a-b)[Math.floor((values.length-1)*p)];
 report.render={samples:frames.length,visible:frames.filter(f=>f.x>=6&&f.x<=1018&&f.y>=6&&f.y<=570).length/frames.length,
 moving:moving/Math.max(1,frames.length-1),p95FrameMs:quantile(intervals,.95),maxHoldMs:Math.max(0,...holds.map(h=>h.ms)),holds};
 report.clock=clockProgression(clock.filter(c=>c.sampledAt&&c.processedUs&&c.renderedUs),seconds*1000-2500);
 assert(frames.length>seconds*30,'Insufficient visible ball frames');assert(report.render.visible>.98,'Ball left court');
 assert(report.render.p95FrameMs<=20,'Desktop frame p95 exceeds 20 ms');
 assert(report.render.maxHoldMs<=500,'A hold exceeds 500 ms; inspect its exact cause before accepting');
 assert(report.clock&&report.clock.processedRatio>=.98&&report.clock.processedRatio<=1.02,'Engine clock outside 98–102% real time');
 assert(report.clock.renderedRatio>=.98&&report.clock.renderedRatio<=1.02,'Displayed clock outside 98–102% real time');
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.error=String((e as Error).message).slice(0,500);process.exitCode=1;report.text=await page.locator('body').innerText().catch(()=>'unreadable');await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});}
finally{await page.unrouteAll({behavior:'ignoreErrors'});report.finishedAt=new Date().toISOString();await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({out,passed:report.passed,error:report.error,render:report.render,clock:report.clock}));await browser.close();}
