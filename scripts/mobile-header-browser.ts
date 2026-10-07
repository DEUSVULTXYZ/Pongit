import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const run=process.env.PONG_HEADER_RUN!;assert(/^[a-z0-9-]+$/.test(run));
const out=`artifacts/qualification/${run}`;await mkdir(out,{recursive:true});
const report:any={startedAt:new Date().toISOString(),origin:'https://pongit.xyz',checks:[],passed:false,physicalMobile:false};
for(const channel of ['chrome','msedge']){
 const browser=await chromium.launch({channel,headless:true});
 try{for(const [width,height] of [[360,844],[390,844],[768,1024],[1440,1000],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<800});const page=await context.newPage();
  await page.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false})));
  for(const [index,path] of ['/','/agents','/agents/tournaments'].entries()){
   await page.goto(report.origin+path,{waitUntil:'domcontentloaded'});
   await page.getByRole('button',{name:'Arcade settings',exact:true}).waitFor();await page.waitForTimeout(750);
   const layout=await page.evaluate(()=>{
    const header=document.querySelector('header')!,bounds=header.getBoundingClientRect();
    const items=[...header.querySelectorAll<HTMLElement>('a,button')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{
     const r=e.getBoundingClientRect(),brokenWords:string[]=[],walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);
     while(walker.nextNode()){const text=walker.currentNode;for(const match of (text.textContent??'').matchAll(/\S+/g)){
      const range=document.createRange();range.setStart(text,match.index!);range.setEnd(text,match.index!+match[0].length);
      if(range.getClientRects().length>1)brokenWords.push(match[0]);
     }}
     return {label:e.getAttribute('aria-label')??e.textContent,rect:r.toJSON(),radius:getComputedStyle(e).borderRadius,brokenWords,
      fits:e.scrollWidth<=e.clientWidth+1,contained:r.left>=bounds.left&&r.right<=bounds.right+1&&r.top>=bounds.top&&r.bottom<=bounds.bottom+1};
    });
    const overlaps=items.flatMap((a,i)=>items.slice(i+1).filter(b=>Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left)>1&&Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top)>1).map(b=>[a.label,b.label]));
    return {overflow:document.documentElement.scrollWidth>innerWidth,header:bounds.toJSON(),items,overlaps};
   });
   const passed=!layout.overflow&&!layout.overlaps.length&&layout.items.every(e=>e.contained&&e.fits&&!e.brokenWords.length&&e.rect.width>=44&&e.rect.height>=44);
   const screenshot=`${channel}-${width}x${height}-${index}.png`;await page.screenshot({path:out+'/'+screenshot});
   report.checks.push({channel,width,height,path,passed,screenshot,...layout});
  }
  await context.close();
 }}finally{await browser.close();}
}
report.passed=report.checks.every((c:any)=>c.passed);report.finishedAt=new Date().toISOString();
await writeFile(out+'/report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({out,passed:report.passed,checks:report.checks.length,failures:report.checks.filter((x:any)=>!x.passed).map((x:any)=>({channel:x.channel,width:x.width,path:x.path,overlaps:x.overlaps,items:x.items.filter((i:any)=>!i.fits||!i.contained||i.rect.width<44||i.rect.height<44)}))}));
assert(report.passed,'Mobile headers must fit without overlaps or clipped controls');
