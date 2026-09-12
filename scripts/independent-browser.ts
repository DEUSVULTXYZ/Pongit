// Real HTTPS-origin browser qualification against private VPS services and testnet contracts.
// Virtual PRF authenticators use the real Mera SDK. Their keys stay in /secrets.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {chromium,type Page,type BrowserContext} from '@playwright/test';
assert.equal(process.env.ROOMS_BROWSER_TEST,'isolated-vps');
const chaos=process.env.INDEPENDENT_SCENARIO==='chaos';
const run=process.env.INDEPENDENT_TEST_RUN||'';assert(!run||/^[a-z0-9]{1,16}$/.test(run));
const suffix=run?'-'+run:'';
const origin='https://pongit.xyz',out=`artifacts/independent-candidate/browser${chaos?'-chaos':''}${suffix}`,secret=`/secrets/independent-browser-v2${chaos?'-chaos':''}${suffix}.json`;
const manifest=JSON.parse(await readFile('deployments/independent.json','utf8'));
let saved:any={lobby:manifest.lobby,players:[],stage:0};
try{saved=JSON.parse(await readFile(secret,'utf8'));assert.equal(saved.lobby,manifest.lobby);}catch(e){if((e as any).code!=='ENOENT')throw e;}
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const pages:Page[]=[],contexts:BrowserContext[]=[],devices:any[]=[],counts=[0,0,0,0];
const report:any={startedAt:new Date().toISOString(),checks:[],network:[],viewports:[],authenticator:'Chromium virtual PRF, real Mera SDK; no physical-device recovery claim'};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(fn:()=>Promise<any>,label:string,ms=60000){const end=Date.now()+ms;while(Date.now()<end){if(await fn().catch(()=>false))return;await sleep(250);}throw Error('Timed out: '+label);}
async function persist(){
 for(let i=0;i<pages.length;i++)saved.players[i]={...(saved.players[i]||{}),credentials:(await devices[i].cdp.send('WebAuthn.getCredentials',{authenticatorId:devices[i].id})).credentials,storage:await contexts[i].storageState(),session:await pages[i].evaluate(()=>Object.fromEntries(Object.entries(sessionStorage)))};
 await writeFile(secret+'.next',JSON.stringify(saved),{mode:0o600});await rename(secret+'.next',secret);
}
async function init(i:number){
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write'],...(saved.players[i]?.storage?{storageState:saved.players[i].storage}:{})});contexts.push(context);
 if(saved.players[i]?.session)await context.addInitScript(values=>{for(const [k,v] of Object.entries(values))sessionStorage.setItem(k,String(v));},saved.players[i].session);
 await context.route(origin+'/**',async route=>{
  const url=new URL(route.request().url());
  let target='http://independent-web:3000'+url.pathname+url.search;
  if(url.pathname.startsWith('/api/independent/'))target='http://independent-service:4012'+url.pathname.slice(4)+url.search;
  else if(url.pathname.startsWith('/api/')){
   assert(/^\/api\/(auth\/|notebook)/.test(url.pathname),'Unexpected legacy operation: '+url.pathname);
   target='http://pongit-relayer-1:4000'+url.pathname.slice(4)+url.search;
  }
  const response=await route.fetch({url:target,timeout:30000});await route.fulfill({response});
 });
 const page=await context.newPage();pages.push(page);const cdp=await context.newCDPSession(page);
 await cdp.send('WebAuthn.enable');const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
 devices.push({id:authenticatorId,cdp});
 for(const credential of saved.players[i]?.credentials??[])await cdp.send('WebAuthn.addCredential',{authenticatorId,credential});
 cdp.on('WebAuthn.credentialAsserted',()=>counts[i]++);
 page.on('pageerror',e=>report.checks.push({pageError:e.message.replace(/0x[\da-f]{64,}/gi,'[hex omitted]').slice(0,300)}));
 page.on('response',async response=>{const request=response.request(),url=new URL(response.url());if(!request.postData()||!url.hostname.endsWith('.fly.dev'))return;let method='unknown';try{method=request.postDataJSON()?.method;}catch{}
  const row:any={player:i,at:Date.now(),method,status:response.status(),requestBytes:Buffer.byteLength(request.postData()||'')};report.network.push(row);
  try{const body=await response.json();if(body.error)row.rpcError={code:body.error.code,message:String(body.error.message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[hex omitted]').slice(0,350)};}catch{}
 });
 await page.goto(origin);const muted=page.getByRole('button',{name:'Enter muted',exact:true});if(await muted.isVisible())await muted.click();
 await page.locator('.rooms-header').waitFor();
 await until(()=>page.locator('.rooms-header-actions > button').last().isEnabled(),'configuration loaded');
 return page;
}
async function account(page:Page,i:number){
 if(!saved.players[i]?.address){
  await page.getByRole('button',{name:'Connect',exact:true}).click();await page.getByRole('button',{name:'Create a passkey',exact:true}).click();
  await until(()=>page.evaluate(()=>!!Object.keys(sessionStorage).find(k=>k.startsWith('pongit:family:')&&!k.endsWith(':operation'))),'family registered');
  await until(()=>page.getByRole('button',{name:'More',exact:true}).isEnabled(),'connection ended');
  saved.players[i]??={};saved.players[i].address=await page.evaluate(()=>JSON.parse(localStorage.getItem('pongit:remembered-passkey')!).address);
  await persist();
 }
 const header=page.locator('.rooms-header-actions > button').last();await until(()=>header.isEnabled(),'account ready');await header.click();
 await page.getByRole('dialog',{name:'Your account'}).waitFor();
 const handle='qa'+Date.now().toString(36).slice(-6)+i;saved.players[i].handle=handle;
 await page.getByLabel('Username',{exact:true}).fill(handle);await page.getByRole('button',{name:'Save profile',exact:true}).click();
 await until(async()=>await page.getByRole('dialog',{name:'Your account'}).count()===0,'profile closes after confirmed save');await persist();
}
try{
 for(let i=0;i<3;i++)await init(i);
 for(const size of [{width:360,height:640},{width:390,height:844},{width:768,height:1024},{width:1440,height:1000},{width:844,height:390}]){
  await pages[2].setViewportSize(size);await sleep(150);
  const rects=await pages[2].locator('.rooms-choice').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};}));
  assert.equal(rects.length,3);assert(rects.every(r=>r.h>=44));
  assert(await pages[2].evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
  if(size.width===360)assert(rects.every(r=>r.bottom<=640),'Three choices below mobile fold');
  report.viewports.push({size,rects});await pages[2].screenshot({path:`${out}/home-${size.width}.png`});
 }
 await pages[2].setViewportSize({width:1440,height:1000});
 if(saved.stage<1){for(let i=0;i<3;i++)await account(pages[i],i);saved.stage=1;await persist();report.checks.push('Three Mera accounts and root-signed unique profiles saved');}
 const a=pages[0],b=pages[1],spectator=pages[2];
 if(chaos&&saved.stage<2){
  if(!saved.roomUrl){
   await a.getByRole('button',{name:'Chaos',exact:true}).click();await a.getByRole('button',{name:/^Create room/}).click();
   await a.getByRole('dialog',{name:'Create room'}).getByRole('button',{name:'Create room',exact:true}).click();
   await until(()=>a.getByRole('button',{name:'Copy room link',exact:true}).isVisible(),'created Chaos room');
   await a.getByRole('button',{name:'Copy room link',exact:true}).click();saved.roomUrl=await a.evaluate(()=>navigator.clipboard.readText());assert(saved.roomUrl.startsWith(origin+'/rooms/'));await persist();
  }
  await b.goto(saved.roomUrl);await b.getByRole('button',{name:'Accept',exact:true}).click();
  await until(()=>b.getByRole('button',{name:'Members 2',exact:true}).isVisible(),'rival joined');
  await spectator.goto(saved.roomUrl);await spectator.getByRole('button',{name:'Accept',exact:true}).click();
  await until(()=>spectator.getByRole('button',{name:'Members 3',exact:true}).isVisible(),'spectator joined');
  await Promise.all([a,b].map(p=>p.getByRole('button',{name:'Accept',exact:true}).click()));await persist();
  await Promise.all([a,b,spectator].map(p=>p.locator('.rooms-canvas canvas').waitFor({timeout:720000})));
  saved.stage=2;await persist();report.checks.push('Three members in a real Chaos room, dual consent and automatic spectator');
 }
 if(saved.stage<2){
  await Promise.all([a,b].map(async p=>{
   await sleep(5000);
   const tools=p.getByRole('button',{name:'Tools',exact:true});
   if(await tools.isVisible()&&!await p.getByRole('button',{name:'Accept',exact:true}).isVisible()&&!await p.locator('.rooms-canvas canvas').isVisible()){
    await tools.click();const leave=p.getByRole('button',{name:'Leave room',exact:true});if(await leave.isVisible())await leave.click();
    await p.getByRole('button',{name:'Close Cabinet tools',exact:true}).click();
   }
   const button=p.getByRole('button',{name:/^Matchmaking/});if(await button.isVisible())await button.click();
   const rejoin=p.getByRole('button',{name:'Rejoin queue',exact:true});if(await rejoin.isVisible())await rejoin.click();
  }));
  await Promise.all([a,b].map(p=>until(async()=>await p.getByRole('button',{name:'Accept',exact:true}).isVisible()||await p.locator('.rooms-canvas canvas').isVisible(),'offer or resumed game',120000)));
  await persist();
  await Promise.all([a,b].map(async p=>{const accept=p.getByRole('button',{name:'Accept',exact:true});if(await accept.isVisible())await accept.click();}));
  await Promise.all([a,b].map(p=>p.locator('.rooms-canvas canvas').waitFor({timeout:720000})));
  saved.stage=2;await persist();report.checks.push('Contract matchmaking, two consents and automatic hosted admission');
 }
 // Controls and F5 must not trigger a root passkey request.
 const before=counts.slice();await a.reload();await a.locator('.rooms-canvas canvas').waitFor({timeout:45000});assert.equal(counts[0],before[0]);
 await until(()=>a.getByRole('button',{name:'Move up',exact:true}).isEnabled(),'restored engine control',90000);
 await a.getByRole('button',{name:'Tools',exact:true}).click();
 const ref=await a.locator('.rooms-dialog .rooms-address').textContent();assert(ref?.startsWith('10143:'));saved.matchRef=ref;await a.getByRole('button',{name:'Close Cabinet tools',exact:true}).click();
 if(chaos){
  await spectator.getByRole('button',{name:'Betting',exact:true}).click();
  await spectator.getByRole('button',{name:'Get test betting credit',exact:true}).click();
  await until(async()=>!(await spectator.getByRole('button',{name:'Get test betting credit',exact:true}).isDisabled()),'sponsored betting credit',90000);
  await spectator.getByLabel('Shares (1 winning share = 1 MON)').fill('0.006');
  await until(()=>spectator.getByRole('button',{name:'Confirm bet with passkey',exact:true}).isEnabled(),'Chaos betting window',120000);
  await spectator.getByRole('button',{name:'Confirm bet with passkey',exact:true}).click();
  await until(()=>spectator.getByRole('button',{name:'Get test betting credit',exact:true}).isEnabled(),'bet confirmed',90000);
  report.checks.push('Root-signed test MON bet accepted in a Chaos pause');
  await spectator.getByRole('button',{name:'Close Wallet and betting',exact:true}).click();
  // The beneficiary browser is disconnected while the relayer settles the payout.
  before[2]=counts[2];await spectator.goto('about:blank');
 }
 await Promise.all([a,b].map(p=>p.getByRole('button',{name:'Move up',exact:true}).waitFor()));
 for(let i=0;i<100;i++){
  const key=i%2?'s':'w';
  await Promise.all([a,b].map(async p=>{if(await p.getByRole('button',{name:'Move up',exact:true}).isEnabled())await p.keyboard.down(key);}));
  await sleep(120);await Promise.all([a,b].map(p=>p.keyboard.up(key)));await sleep(70);
 }
 assert.deepEqual(counts,before,'Gameplay unexpectedly requested a passkey');report.checks.push('F5 and direction input without a root passkey ceremony');
 await a.screenshot({path:`${out}/classic.png`});
 await until(async()=>await a.getByRole('dialog',{name:'Confirmed match result'}).isVisible()&&await b.getByRole('dialog',{name:'Confirmed match result'}).isVisible(),'seventh point on both clients',chaos?600000:180000);
 await a.getByRole('button',{name:/Skip animation/}).click().catch(()=>{});
 await b.getByRole('button',{name:/Skip animation/}).click().catch(()=>{});
 const scoreA=await a.locator('.outcome-score').textContent(),scoreB=await b.locator('.outcome-score').textContent();assert.equal(scoreA,scoreB);assert(/7/.test(scoreA!));report.checks.push({finalScore:scoreA});
 saved.stage=3;await persist();report.passed=true;
}catch(e){report.passed=false;report.error=String((e as Error).message).replace(/0x[\da-f]{64,}/gi,'[hex omitted]').slice(0,650);process.exitCode=1;
 for(let i=0;i<pages.length;i++){await pages[i].screenshot({path:`${out}/failure-${i}.png`}).catch(()=>{});report.checks.push({page:i,visible:(await pages[i].locator('body').innerText().catch(()=>'' )).slice(0,1600)});}
 await persist().catch(()=>{});
}finally{report.finishedAt=new Date().toISOString();report.passkeyAssertions=counts;await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({passed:report.passed,error:report.error,checks:report.checks}));}
