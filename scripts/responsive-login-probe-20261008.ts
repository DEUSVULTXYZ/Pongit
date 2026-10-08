/** Real public login only. No matchmaking, game input or contract lifecycle call. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
assert.equal(process.env.PONG_LOGIN_PROBE,'public-login-only');
const run=process.env.PONG_LOGIN_RUN!;assert(/^login26-[a-z0-9]+$/.test(run));
const out=`artifacts/responsive-20261008-r2/${run}`;
await mkdir(out,{recursive:false});
const report:any={startedAt:new Date().toISOString(),passed:false,scope:'Six public home logins; virtual PRF; no games',clients:[]};
const browsers=await Promise.all(['chrome','msedge'].map(channel=>chromium.launch({channel,headless:false})));
const clean=(s:unknown)=>String(s??'').split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[hex omitted]').slice(0,220);
try{
 await Promise.all(Array.from({length:6},async(_,i)=>{
  const row:any={client:i,channel:i%2?'msedge':'chrome',network:[],passed:false};report.clients.push(row);
  const context=await browsers[i%2].newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
  await context.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:0,effects:0,background:false,intensity:'off'})));
  const starts=new WeakMap<object,number>();
  page.on('request',r=>starts.set(r,Date.now()));
  page.on('requestfailed',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))row.network.push({path:new URL(r.url()).pathname.replace(/operations\/[^/]+/,'operations/:id'),at:Date.now(),ms:Date.now()-(starts.get(r)??Date.now()),failure:r.failure()?.errorText});});
  page.on('response',async r=>{
   const req=r.request(),path=new URL(r.url()).pathname;if(!path.startsWith('/api/'))return;
   const item:any={path:path.replace(/operations\/[^/]+/,'operations/:id'),at:Date.now(),ms:Date.now()-(starts.get(req)??Date.now()),http:r.status()};
   try{const q=req.postDataJSON();item.method=q?.method??req.method();}catch{item.method=req.method();}
   row.network.push(item);
   try{const b=await r.json();if(b.error)item.error=typeof b.error==='object'?{code:b.error.code,message:clean(b.error.message)}:clean(b.error);if(/\/operations\//.test(path)||path.endsWith('/transactions'))item.operation={id:b.id,status:b.status,hash:b.hash};}catch{item.bodyUnavailable=true;}
  });
  try{
   await page.goto('https://pongit.xyz/');await page.getByRole('button',{name:'Connect',exact:true}).waitFor();
   await page.getByRole('button',{name:'Connect',exact:true}).click();
   row.clickedAt=new Date().toISOString();await page.getByRole('button',{name:'Create a passkey',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('[role="dialog"]')&&Array.from(document.querySelectorAll('button')).some(b=>b.textContent?.trim()==='More'&&!b.disabled),{},{timeout:60000});
   row.passed=true;
  }catch(e){row.error=clean((e as Error).message);}
  row.finishedAt=new Date().toISOString();row.text=(await page.locator('body').innerText()).slice(-2400);
  row.savedFamilies=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.includes('family')&&!k.endsWith(':operation')).map(k=>({kind:k.startsWith('pongit:agent-family:')?'agents':'human'})));
  row.uiLoginPassed=row.passed;
  row.passed=row.passed&&['/api/independent/','/api/agents/'].every(prefix=>row.network.some((n:any)=>n.path.startsWith(prefix)&&n.operation?.status==='confirmed'));
  const secret={credentials:(await cdp.send('WebAuthn.getCredentials',{authenticatorId})).credentials,storage:await context.storageState(),session:await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage)))};
  await writeFile(`C:/Users/wwwle/.codex/private-backups/pongit/${run}-${i}.json`,JSON.stringify(secret),{flag:'wx',mode:0o600});
  await page.screenshot({path:`${out}/${i}.png`});await context.close();
 }));report.passed=report.clients.every((r:any)=>r.passed);
}finally{
 await Promise.all(browsers.map(b=>b.close()));report.finishedAt=new Date().toISOString();
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,clients:report.clients.map((r:any)=>({client:r.client,passed:r.passed,error:r.error,savedFamilies:r.savedFamilies,errors:r.network.filter((v:any)=>v.error||v.failure)}))}));
}
