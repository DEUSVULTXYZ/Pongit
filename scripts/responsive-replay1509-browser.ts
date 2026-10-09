// Read-only playback of the actual reported game. No replacement frames or writes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';

const ref='0x776f35918Da25F0b594FeA72911DDe5eFc93e48e/1/1509';
const run=process.env.PONG_REPLAY1509_RUN??'replay1509-web69';assert(/^replay1509-web69(?:-attempt[2-9])?$/.test(run));
const out='artifacts/qualification/'+run;
await mkdir(out,{recursive:true});
const report:any={startedAt:new Date().toISOString(),ref,readOnly:true,passed:false,checks:[],
 limitation:'Recorded authoritative playback only. Not original local prediction, live multiball qualification, or physical mobile evidence.'};
await writeFile(out+'/report.json',JSON.stringify(report),{flag:'wx'});
try{
 const response=await fetch('https://pongit.xyz/api/agents/replay?app='+ref.split('/')[0]+'&epoch=1&id=1509',{signal:AbortSignal.timeout(15000)});
 assert(response.ok);const bytes=await response.text(),replay=JSON.parse(bytes);
 assert.equal(replay.availability,'available');assert.equal(replay.rulesVersion,17);
 report.replaySha256=createHash('sha256').update(bytes).digest('hex');report.frameCount=replay.frameCount;
 const indices=[replay.frames.findLastIndex((f:any)=>BigInt(f.state.t)<=13_000_000n),
  ...['13630000','13750000'].map(t=>replay.frames.findIndex((f:any)=>f.state.t===t))];
 assert(indices.every(i=>i>=0),'Required original frames remain retained');
 for(const [channel,width] of [['chrome',1440],['msedge',390]] as const){
  const browser=await chromium.launch({channel,headless:false});
  const context=await browser.newContext({viewport:{width,height:width===390?844:900},hasTouch:width===390,
   recordVideo:{dir:out+'/'+channel+'-video',size:{width,height:width===390?844:900}}});
  let writes=0;const errors:string[]=[];
  await context.route('**/*',async route=>{
   const r=route.request();if(r.method()==='GET')return route.continue();
   let method='';try{method=r.postDataJSON()?.method??'';}catch{}
   if(['eth_chainId','eth_call','eth_getCode','eth_getBalance','eth_getStorageAt','eth_blockNumber','eth_getBlockByNumber','eth_getTransactionReceipt','eth_getLogs'].includes(method))return route.continue();
   writes++;await route.abort();
  });
  await context.addInitScript(()=>{
   localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,background:false}));
   sessionStorage.setItem('pongit:measure-controls','1');
   (window as any).__replayPoses=[];
   window.addEventListener('pongit:court-frame',(e:any)=>{
    if(e.detail.ref.startsWith('replay:'))(window as any).__replayPoses.push(e.detail);
   });
  });
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('https://pongit.xyz/agents/arenas/'+ref,{waitUntil:'domcontentloaded'});
   await page.getByRole('button',{name:'Watch replay',exact:true}).first().click();
   const dialog=page.getByRole('dialog',{name:'Match replay',exact:true});await dialog.locator('canvas').waitFor();
   const slider=dialog.getByRole('slider',{name:'Replay position'});
   for(const index of indices.slice(1)){
    await slider.fill(String(index));const frame=replay.frames[index];
    await page.waitForFunction(t=>(window as any).__replayPoses.at(-1)?.sourceUs===t,frame.state.t);
    const pose=await page.evaluate(()=>(window as any).__replayPoses.at(-1));
    assert.equal(pose.balls.length,2);assert.equal(pose.paddles[0],Number(frame.state.left)/1e6);
    for(const ball of pose.balls){const live=frame.chaos.physics.balls[ball.id-1];
     assert(Math.abs(ball.x-Number(live.x)/1e12)<.0001);assert(Math.abs(ball.y-Number(live.y)/1e12)<.0001);
    }
    await page.screenshot({path:`${out}/${channel}-${frame.state.t}.png`});
   }
   await slider.fill(String(indices[0]));await page.evaluate(()=>(window as any).__replayPoses=[]);
   await dialog.getByRole('button',{name:'Play replay',exact:true}).click();await page.waitForTimeout(2500);
   await dialog.getByRole('button',{name:'Pause',exact:true}).click();
   const poses:any[]=await page.evaluate(()=>(window as any).__replayPoses);
   await writeFile(`${out}/${channel}-poses.json`,JSON.stringify(poses));
   assert(poses.filter(p=>p.balls.length===2).length>=60,'Two actual recorded balls must be painted');
   const before=poses.find(p=>BigInt(p.sourceUs)<13_689_311n&&p.balls.length===2);
   const after=poses.find(p=>BigInt(p.sourceUs)>=13_750_000n&&p.balls.length===2);
   assert(before&&after);assert(after.balls[0].x<40&&after.balls[1].x>40,'Recorded first miss and second return remain distinct');
   const box=await dialog.locator('canvas').boundingBox();assert(box&&box.width>300);
   if(width===1440)assert(box.width>=1100);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   assert.equal(writes,0);assert.deepEqual(errors,[]);
   report.checks.push({channel,width,canvas:box,multiballPaints:poses.filter(p=>p.balls.length===2).length,
    authoritativePositionsMatch:true,firstMissSecondReturn:true,writes,video:await page.video()?.path()});
  }finally{await context.unrouteAll({behavior:'ignoreErrors'});await context.close();await browser.close();}
 }
 report.passed=true;
}catch(e){report.error=String(e);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
