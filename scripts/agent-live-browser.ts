// Private VPS browser, real Mera PRF grant and hosted game commands. Only the
// unpublished UI gate and explicitly labelled transport faults are simulated.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
assert.equal(process.env.PONG_AGENT_LIVE_BROWSER,'isolated-vps');
const stamp=process.env.PONG_AGENT_LAB_STAMP??'20260913';assert.match(stamp,/^20\d{6}(-[2-9])?$/,'The laboratory stamp is a date such as 20260918');
const origin='https://pongit.xyz',api=process.env.PONG_AGENT_API??`http://pongit-agent-service-${stamp}:4100`,web=`http://pongit-agent-ui-${stamp}:3000`;
// An override may only name another private laboratory service, never a public one.
assert.match(api,/^http:\/\/pongit-agent-service-20[0-9]{6}(-[2-9])?:4100$/,'Point at a private laboratory service');
let manifest:any;const admissionDeadline=Date.now()+1200000;
while(Date.now()<admissionDeadline){
 manifest=JSON.parse(await readFile('/secrets/manifest.json','utf8'));
 assert(/^0x[\da-fA-F]{40}$/.test(manifest.app)&&manifest.app.toLowerCase()!=='0x78d3341e3452d7ec1add9371de3008639eed8eb0','Qualify a dedicated arcade, never the human application');
 try{const health=await fetch(api+'/health',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());if(Number(manifest.epoch)>=2&&health.game.stage==='online'&&health.game.epoch===manifest.epoch)break;}catch{}
 await new Promise(r=>setTimeout(r,10000));
}
assert(Number(manifest.epoch)>=2&&Date.now()<admissionDeadline,'The real renewed service must be available before browser qualification');
const out='artifacts/agents/live-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const report:any={at:new Date().toISOString(),app:manifest.app,epoch:manifest.epoch,scope:'Private routed HTTPS browser origin, real hosted transactions and virtual Mera PRF credential; no physical-device recovery claim',checks:[],matches:[],rpc:[],faults:[],errors:[]};
let assertions=0,loseReply=false,rateLimit=false;const counts=new Map<string,number>();
async function context(player=false){
 const c=await browser.newContext({viewport:{width:1440,height:1000}});
 await c.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'})));
 if(player)await c.addInitScript(()=>{
  for(const method of ['create','get'] as const){const original=navigator.credentials[method].bind(navigator.credentials);
   (navigator.credentials as any)[method]=(...args:any[])=>{const key=`qualification:passkey:${method}`;sessionStorage.setItem(key,String(Number(sessionStorage.getItem(key)||0)+1));return original(...args);};}
 });
 await c.route(origin+'/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname.startsWith('/api/agents/')){
   const response=await route.fetch({url:api+u.pathname.slice('/api/agents'.length)+u.search,timeout:30000});
   if(u.pathname.endsWith('/config')){const body=await response.json();assert.equal(body.app,manifest.app);return route.fulfill({response,json:{...body,enabled:true,qualified:true}});}
   return route.fulfill({response});
  }
  if(u.pathname.startsWith('/api/')){assert.equal(route.request().method(),'GET','Do not submit to human services');return route.continue();}
  await route.fulfill({response:await route.fetch({url:web+u.pathname+u.search,timeout:30000})});
 });
 await c.route(manifest.node+'/**',async route=>{
  const data=route.request().postDataJSON(),method=String(data?.method||'http'),start=Date.now();counts.set(method,(counts.get(method)||0)+1);
  if(player&&rateLimit&&method==='interlude_sendTransaction'){
   rateLimit=false;report.faults.push({at:new Date().toISOString(),kind:'Injected 429, request not forwarded'});
   return route.fulfill({status:429,headers:{'Retry-After':'1'},json:{error:'Private qualification rate limit'}});
  }
  const response=await route.fetch({timeout:20000});
  report.rpc.push({method,ms:Date.now()-start,status:response.status(),bytes:Buffer.byteLength(route.request().postData()||'')});
  if(player&&loseReply&&method==='interlude_sendTransaction'){
   loseReply=false;report.faults.push({at:new Date().toISOString(),kind:'Response withheld after actual execution'});return route.abort('failed');
  }
  await route.fulfill({response});
 });
 return c;
}
const human=await context(true),spectator=await context(false),page=await human.newPage(),watch=await spectator.newPage();
page.on('pageerror',e=>report.errors.push(e.message));watch.on('pageerror',e=>report.errors.push(e.message));
const cdp=await human.newCDPSession(page);await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
cdp.on('WebAuthn.credentialAsserted',()=>assertions++);
try{
 await page.goto(origin+'/');await page.getByRole('button',{name:/Play an agent/}).waitFor({timeout:30000});
 for(const label of ['Play a person','Play an agent','Watch agents'])assert(await page.getByRole('button',{name:new RegExp(label)}).isVisible());
 report.checks.push('Three home choices are present; human matchmaking is never clicked');
 await page.getByRole('button',{name:/Play an agent/}).click();await page.getByRole('heading',{name:'NOVA',exact:true}).waitFor();
 const nova=page.locator('.agent-card').filter({has:page.getByRole('heading',{name:'NOVA',exact:true})});
 await nova.getByRole('button',{name:'Challenge this agent',exact:true}).click();await page.getByRole('button',{name:'Create a passkey',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('[role=dialog]'),undefined,{timeout:60000});
 const initialAssertions=assertions,ceremonies=()=>page.evaluate(()=>['create','get'].map(k=>Number(sessionStorage.getItem(`qualification:passkey:${k}`)||0)));
 const initialCeremonies=await ceremonies();assert(initialCeremonies[0]>=1);report.passkeyCalls=initialCeremonies;
 const account=await page.evaluate(()=>Object.entries(sessionStorage).find(([k])=>k.startsWith('pongit:agents:')&&k.endsWith(':account'))?.[1]);assert(account);report.player=account;
 for(const mode of [0,1]){
  if(mode){await page.getByRole('button',{name:'Choose another agent',exact:true}).click();await page.getByRole('button',{name:'Chaos',exact:true}).click();await nova.getByRole('button',{name:'Challenge this agent',exact:true}).click();}
  await page.getByRole('button',{name:'Accept',exact:true}).waitFor({timeout:90000});await page.getByRole('button',{name:'Accept',exact:true}).click();
  await page.getByRole('button',{name:'Move up',exact:true}).waitFor({state:'visible',timeout:60000});
  await page.waitForFunction(()=>!(document.querySelector('[aria-label="Move up"]') as HTMLButtonElement)?.disabled,undefined,{timeout:60000});
  const ref=await page.evaluate(async()=>{const copy=navigator.clipboard.writeText.bind(navigator.clipboard);let result='';navigator.clipboard.writeText=async text=>{result=text;};(document.querySelector('.agent-toolbar button') as HTMLButtonElement).click();await new Promise(r=>setTimeout(r,50));navigator.clipboard.writeText=copy;return result;});assert(ref.includes(`app=${manifest.app}`));
  await watch.goto(ref);await watch.locator('canvas').waitFor();
  for(let i=0;i<60;i++){
   if(await page.getByRole('dialog',{name:'Confirmed match result'}).count())break;
   if(i===5&&!mode)loseReply=true;if(i===12&&!mode)rateLimit=true;
   await page.keyboard.down(i%2?'s':'w');await page.waitForTimeout(65);await page.keyboard.up(i%2?'s':'w');await page.waitForTimeout(30);
   if(i===25){await page.reload();await page.waitForFunction(()=>{const b=document.querySelector('[aria-label="Move up"]') as HTMLButtonElement;return b&&!b.disabled;},undefined,{timeout:60000});assert.equal(assertions,initialAssertions,'F5 must reuse the grant');assert.deepEqual(await ceremonies(),initialCeremonies);}
  }
  await page.getByRole('dialog',{name:'Confirmed match result'}).waitFor({timeout:360000});
  await watch.locator('.spectator-result').waitFor({timeout:20000});
  const score=await page.locator('.outcome-score').innerText(),spectatorScore=await watch.locator('.spectator-result').innerText();
  const [a,b]=score.split(':').map(x=>Number(x.trim()));assert(a===7||b===7||await page.getByText('Time is up. ELO unchanged.',{exact:true}).count());
  assert(spectatorScore.includes(`${a} : ${b}`));assert.equal(assertions,initialAssertions,'Changing mode must not ask for another passkey');assert.deepEqual(await ceremonies(),initialCeremonies);
  report.matches.push({mode,ref,score,matchingSpectator:true});await page.screenshot({path:`${out}/result-${mode}.png`});
 }
 report.checks.push('Classic and Chaos human-agent results match a live spectator','F5 and a second mode reuse the same limited Mera grant','Lost response and injected 429 recover without a new passkey');
 await page.getByRole('button',{name:'Choose another agent',exact:true}).click();await page.locator('.rooms-header-actions > button').last().click();await page.getByRole('button',{name:'Disconnect Agent Arcade',exact:true}).click();
 await page.waitForFunction(()=>!Object.keys(sessionStorage).some(k=>k.startsWith('pongit:agents:')&&k.endsWith(':account')),undefined,{timeout:30000});
 report.checks.push('Disconnect clears the local account and requests limited-key revocation');report.passed=true;
}catch(e){report.passed=false;report.failure=String((e as Error).message).replace(/0x[\da-fA-F]{64,}/g,'[omitted]');await page.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1;}
finally{report.assertions=assertions;report.calls=Object.fromEntries(counts);report.finishedAt=new Date().toISOString();await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({...report,rpc:report.rpc.length+' timing samples'}));}
