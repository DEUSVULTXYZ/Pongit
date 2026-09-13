import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
// Production physics and canvas functions, isolated from networking and wallets.
const source=`
import {initialChaosEvents} from './shared/physics-chaos-events';
import {announceEffect} from './shared/chaos-effects';
import {projectChaos,eventCanvas} from './web/lib/chaos-presentation';
import {drawChaosCourt,drawChaosPaddles,drawChaosBalls} from './web/lib/chaos-canvas';
import {projectLive} from './web/lib/presentation';
import {initial} from './shared/physics-v2';
const seed='0x'+'01'.repeat(32);
window.runBench=async function(){
 const c=document.querySelector('canvas').getContext('2d'),results=[];
 const cases=[['classic',[]],['chaos',[]],['multiball-wind',[21,17]],['portals-gravity',[14,16]],['curve-gravity',[5,16]]];
 for(const [name,ids] of cases)for(const delay of [100000,600000])for(const effects of [false,true]){
  const state=initialChaosEvents(seed);state.t=2000000n;state.nextForce=state.t;
  for(const [i,id] of ids.entries())[state.effects]=announceEffect(state.effects,id,0,0,i+1,0);
  if(ids.includes(5)){state.balls[0].curveSteps=150;state.balls[0].curveSign=1;}
  const samples=[];for(let i=0;i<160;i++){
   const at=performance.now();c.fillStyle='#050812';c.fillRect(0,0,1024,576);
   if(name==='classic'){const s=initial(seed);s.vx=192000000n;s.vy=96000000n;const p=projectLive(s,BigInt(delay));c.fillStyle='#fff';c.fillRect(Number(p.state.x)/1e6,Number(p.state.y)/1e6,12,12);}
   else{const p=projectChaos(state,state.t+BigInt(delay));const f=eventCanvas(p.state,effects,!effects);drawChaosCourt(c,f);drawChaosPaddles(c,f);drawChaosBalls(c,f);}
   if(i>=20)samples.push(performance.now()-at);if(i%20===0)await new Promise(r=>requestAnimationFrame(r));
  }samples.sort((a,b)=>a-b);results.push({name,snapshotAgeMs:delay/1000,effects,samples:samples.length,p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],p99:samples[Math.floor(samples.length*.99)]});
 }return results;
};`;
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'browser',format:'iife',minify:true});
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
const report:any={at:new Date().toISOString(),browser:browser.version(),scope:'Isolated production projection and drawing functions; CPU throttling is not a physical phone; excludes RPC and input latency',runs:[]};
try{for(const throttle of [1,4]){const page=await browser.newPage({viewport:{width:throttle===1?1440:390,height:900}}),cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:throttle});
 await page.setContent('<canvas width="1024" height="576" style="width:100%;max-width:1024px"></canvas>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 report.runs.push({cpuThrottle:throttle,results:await page.evaluate(()=>((window as any).runBench()))});await page.close();}
}finally{await browser.close();}
await mkdir('artifacts/drand',{recursive:true});await writeFile(`artifacts/drand/render-${process.env.BROWSER_CHANNEL||'chromium'}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
