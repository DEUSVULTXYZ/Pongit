// Browser pixel comparison: both modes must use the same cabinet materials.
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const compiled=await build({stdin:{contents:`
 import {courtSprites} from './web/lib/court-sprites';
 import {drawChaosPaddles,drawChaosBalls} from './web/lib/chaos-canvas';
 (window as any).courtTest={courtSprites,drawChaosPaddles,drawChaosBalls};
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'browser'});
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
try{
 const page=await browser.newPage();await page.addScriptTag({content:'window.__name=(fn)=>fn;'+compiled.outputFiles[0].text});
 const report=await page.evaluate(()=>{
  const {courtSprites,drawChaosPaddles,drawChaosBalls}=(window as any).courtTest;
  const canvas=()=>{const c=document.createElement('canvas');c.width=1024;c.height=576;return c.getContext('2d')!;};
  const results=[];
  for(const height of [64,96,120]){
   const classic=canvas(),chaos=canvas(),sprites=courtSprites(classic);
   sprites.paddle(0,240-height/2,height);sprites.paddle(1,310-height/2,height);sprites.ball(512,288);
   const f={effects:[],gameMs:0,effectsEnabled:false,reducedMotion:true,paddles:[{y:240,height,split:false},{y:310,height,split:false}],balls:[{id:1,x:512,y:288,vx:300,vy:50,power:false,curving:false}]};
   drawChaosPaddles(chaos,f);drawChaosBalls(chaos,f);
   const a=classic.getImageData(0,0,1024,576).data,b=chaos.getImageData(0,0,1024,576).data;
   results.push({height,differentChannels:a.reduce((n,v,i)=>n+(v!==b[i]?1:0),0),squareCornerAlpha:chaos.getImageData(506,282,1,1).data[3]});
  }
  return results;
 });
 for(const result of report){assert.equal(result.differentChannels,0);assert.equal(result.squareCornerAlpha,255);}
 await mkdir('artifacts/court-sprites',{recursive:true});
 await writeFile('artifacts/court-sprites/report.json',JSON.stringify({passed:true,report},null,2));
 console.log(JSON.stringify({passed:true,report}));
}finally{await browser.close();}
