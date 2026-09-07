// Deterministic presentation QA against the actual lab page. RPC snapshots are
// delayed fixtures inside Playwright only; no wallet or engine writes occur.
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {encodeFunctionData,encodeFunctionResult,zeroAddress,zeroHash} from 'viem';
import assert from 'node:assert/strict';

const manifest=JSON.parse(await readFile('deployments/interlude-lab.json','utf8'));
const abi=JSON.parse(await readFile('contracts/out/PongInterlude.sol/PongInterlude.json','utf8')).abi;
const selector=encodeFunctionData({abi,functionName:'getSnapshot'});
const stage=process.env.PONG_LAB_STAGE_URL;
assert(stage,'Use a private candidate or baseline web container');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const report={checkedAt:new Date().toISOString(),stage,cases:[],errors:[]};
const output=process.env.BOUNCE_REPORT||'artifacts/interlude/bounce-browser.json';
await mkdir('artifacts/interlude',{recursive:true});
try {
 for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.route('https://pongit.xyz/**',async route=>{
   const u=new URL(route.request().url());
   const response=await route.fetch({url:stage+u.pathname+u.search});await route.fulfill({response});
  });
  let scenario=null;
  await context.route(manifest.node+'/**',async route=>{
   const body=route.request().postDataJSON();
   if(body?.method!=='eth_call'||body.params?.[0]?.data!==selector||!scenario)return route.continue();
   const elapsed=Math.floor((Date.now()-scenario.started)/10)*10;
   const direction=BigInt(scenario.direction), confirmed=elapsed>=1000;
   // From x=840/184, impact is at 750 ms. The next resolved snapshot is
   // deliberately withheld until 1000 ms to expose the old impact barrier.
   const t=confirmed?BigInt(elapsed)*1000n:0n;
   const x=confirmed?(direction>0n?984n*1000000n:40n*1000000n)-direction*192n*(t-750000n)
     :(direction>0n?840n:184n)*1000000n;
   const s={x,y:216000000n+96n*t,vx:(confirmed?-direction:direction)*192000000n,vy:96000000n,
    left:288000000n,right:288000000n,leftDir:0,rightDir:0,t,scoreA:0,scoreB:0,seed:zeroHash,
    finished:false,mode:0,halfA:48000000n,halfB:48000000n,awaitingServe:false,resumeAt:0n};
   const result=encodeFunctionResult({abi,functionName:'getSnapshot',result:[BigInt(scenario.id),confirmed?2n:1n,2n,
    '0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222',zeroAddress,zeroAddress,
    BigInt(10000+elapsed/10),BigInt(elapsed)*1000n,0n,0n,0n,s]});
   return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{jsonrpc:'2.0',id:body.id,result}});
  });
  await context.addInitScript(()=>{
   window.bounceFrames=[];window.recordBounce=false;
   const draw=CanvasRenderingContext2D.prototype.fillRect;
   CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){
    if(window.recordBounce&&w===12&&h===12&&this.fillStyle==='#ffffff')window.bounceFrames.push({at:performance.now(),x,y});
    return draw.call(this,x,y,w,h);
   };
  });
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('https://pongit.xyz/labs/interlude');
  await page.getByRole('button',{name:'Enter muted',exact:true}).click();
  await page.getByText('Engine online',{exact:false}).waitFor();
  for(const direction of [-1,1]) {
   scenario={direction,id:9000+(direction+1)/2,started:Date.now()};
   // Use enough time for a fresh snapshot and both
   // sides of the delayed acknowledgement appear in the canvas samples.
   await page.evaluate(()=>{window.bounceFrames=[];window.recordBounce=true;});
   await page.waitForTimeout(1600);
   const frames=await page.evaluate(()=>{window.recordBounce=false;return window.bounceFrames;});
   let freeze=0,start=null,contacts=0;
   for(let i=1;i<frames.length;i++){
    const f=frames[i],p=frames[i-1];
    const near=direction<0?f.x<42:f.x>970;
    if(near)contacts++;
    if(near&&Math.abs(f.x-p.x)<0.001){start??=p.at;freeze=Math.max(freeze,f.at-start);}else start=null;
   }
   const row={width,direction,frames:frames.length,contactFrames:contacts,maxFreezeMs:Math.round(freeze)};
   report.cases.push(row);
   assert(contacts>0,'Fixture did not sample the contact');
   if(!process.env.BOUNCE_BASELINE)assert(freeze<70,`Visible pause at the paddle: ${JSON.stringify(row)}`);
   await page.screenshot({path:`${output}-${width}-${direction}.png`});
  }
  await context.close();
 }
 assert.deepEqual(report.errors,[]);
} finally {
 await browser.close();await mkdir('artifacts/interlude',{recursive:true});
 await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
