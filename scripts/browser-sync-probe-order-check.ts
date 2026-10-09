import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {installSyncProbe} from './browser-sync-probe';

const output=process.argv[2];
if(!output)throw new Error('A new evidence path is required');
const browser=await chromium.launch({channel:'chrome',headless:false});
let report:any;
try{
 const page=await browser.newPage();
 await installSyncProbe(page);
 await page.goto('data:text/html,<main id="root"><button aria-label="Move up">Up</button></main>');
 await page.evaluate(()=>{
  const w=window as any;w.__syncProbe.snapshots.push({controllable:true,side:0});w.__order=[];
  for(const type of ['pointerdown','pointerup','keydown','keyup'])document.getElementById('root')!.addEventListener(type,()=>{
   const releasing=type.endsWith('up'),entries=releasing?w.__syncProbe.releases:w.__syncProbe.keys;
   // React's delegated root handler must see a probe captured already. Its
   // local-intent microtask can paint before a window bubble listener runs.
   w.__order.push({type,handlerAt:performance.now(),probeAt:entries.at(-1)?.at??null,count:entries.length});
   const until=performance.now()+3;while(performance.now()<until){}
   queueMicrotask(()=>w.__order.push({type:`${type}-paint`,at:performance.now()}));
  });
 });
 await page.getByRole('button',{name:'Move up'}).click();
 await page.keyboard.press('ArrowUp');
 const events=await page.evaluate(()=>(window as any).__order);
 const handlers=events.filter((e:any)=>!e.type.endsWith('-paint'));
 const passed=handlers.length===4&&handlers.every((e:any,i:number)=>e.count===Math.floor(i/2)+1&&e.probeAt!==null&&e.probeAt<=e.handlerAt);
 report={at:new Date().toISOString(),passed,events,scope:'Native browser input ordering only; no game or server'};
 if(!passed)process.exitCode=1;
}finally{
 await browser.close();
 if(report){writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));}
}
