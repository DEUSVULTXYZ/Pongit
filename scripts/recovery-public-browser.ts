// Read-only public smoke. It never connects a passkey, enters a queue or submits a transaction.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
assert.equal(process.env.PONG_PUBLIC_READONLY,'true');
const label=process.env.PONG_SMOKE_LABEL??'public';assert(/^[a-z0-9-]+$/.test(label));
const out=`artifacts/recovery-public-${label}`;await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.ROOMS_BROWSER_PATH,args:['--no-sandbox']});
const report:any={at:new Date().toISOString(),scope:'Read-only HTTPS public home, navigation and docs; no passkey or transaction',checks:[],errors:[]};
try{
 const context=await browser.newContext();await context.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'})));
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 for(const size of [{width:360,height:640},{width:390,height:844},{width:768,height:1024},{width:1440,height:1000}]){
  await page.setViewportSize(size);await page.goto('https://pongit.xyz/',{waitUntil:'domcontentloaded'});
  await page.locator('.rooms-choices').waitFor();
  const actions=page.locator('.rooms-choice');assert.equal(await actions.count(),3);
  const boxes=await Promise.all([0,1,2].map(i=>actions.nth(i).boundingBox()));
  assert(boxes.every(b=>b&&b.height>=44&&b.width>=44&&b.y+b.height<=size.height),'Home choices must fit the viewport');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'More arcade activities',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.screenshot({path:`${out}/home-${size.width}.png`});report.checks.push({home:size,choices:boxes});
 }
 await page.goto('https://pongit.xyz/docs');await page.getByRole('heading',{name:/Know the arcade/}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:`${out}/docs.png`});report.checks.push('Direct documentation loads without a passkey or arcade entry');
 const missing=await page.goto('https://pongit.xyz/docs/not-a-real-guide');assert.equal(missing?.status(),404);report.checks.push('Unknown documentation article returns HTTP 404');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.passed=false;report.failure=(e as Error).message;throw e;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
