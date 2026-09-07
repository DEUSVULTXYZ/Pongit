// Dedicated-lab QA only. This creates test identities and friendly games, never V4 jobs.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import assert from 'node:assert/strict';
import {installMotionProbe,measureMotion} from './interlude-motion.mjs';
const manifest=JSON.parse(await readFile('deployments/interlude-lab.json','utf8'));
const abi=JSON.parse(await readFile(process.env.LAB_ABI_FILE||'contracts/out/PongInterlude.sol/PongInterlude.json','utf8')).abi;
const node=createPublicClient({transport:http(manifest.node,{retryCount:0,timeout:8000})});
const snap=()=>node.readContract({address:manifest.app,abi,functionName:'getSnapshot'});
assert([0n,3n,4n].includes((await snap())[2]),'The lab is occupied. Do not interrupt another player.');
await mkdir('artifacts/interlude/browser',{recursive:true});
const stage=process.env.PONG_LAB_STAGE_URL,origin='https://pongit.xyz',url=origin+'/labs/interlude';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const contexts=[],pages=[],errors=[],requests=[],assertions=[0,0],report={app:manifest.app,startedAt:new Date().toISOString(),checks:[],viewports:[]};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=30000){const start=Date.now();while(Date.now()-start<timeout){try{if(await fn())return;}catch{}await wait(150);}throw Error('Timed out: '+label);}
async function init(i){
 const context=await browser.newContext({viewport:i===1?{width:390,height:844}:{width:1440,height:1000}});contexts.push(context);
 await installMotionProbe(context);
 if(stage)await context.route(origin+'/**',async route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/api/')||u.pathname==='/ws')return route.continue();const response=await route.fetch({url:stage+u.pathname+u.search});await route.fulfill({response});});
 const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.url());});
 if(i<2){const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});cdp.on('WebAuthn.credentialAsserted',()=>assertions[i]++);}
 await page.goto(url);await page.getByRole('button',{name:'Enter muted',exact:true}).click();await until(()=>page.locator('.lab-status').textContent().then(t=>t.includes('Engine online')),'engine online');return page;
}
async function createPlayer(page){await page.getByRole('button',{name:'Connect passkey',exact:true}).click();await page.getByRole('button',{name:'Create a passkey',exact:true}).click();await until(()=>page.getByRole('button',{name:'Disconnect lab',exact:true}).isVisible(),'Mera session');return page.locator('.lab-account small[title]').getAttribute('title');}
async function start(a,b,bAddress){await a.getByLabel('Rival address (optional)').fill(bAddress);await a.getByRole('button',{name:'Create friendly match',exact:true}).dblclick();await until(async()=>(await snap())[2]===1n,'invitation');const id=(await snap())[0];await b.getByRole('button',{name:'Accept & play',exact:true}).click();await until(async()=>(await snap())[2]===2n,'accepted game');return id;}
async function finish(a){if((await snap())[2]===2n){await a.getByRole('button',{name:'Concede',exact:true}).click();await until(async()=>(await snap())[2]===3n,'concede');}await until(()=>a.locator('.lab-commit').textContent().then(t=>t.includes('Result hash matches')),'Monad result hash',30000);}
async function closeResults(...players){for(const p of players){const close=p.getByRole('button',{name:'Close result',exact:true});if(await close.isVisible())await close.click();}}
try{
 const a=await init(0),b=await init(1),spectator=await init(2);
 const addresses=[await createPlayer(a),await createPlayer(b)];report.addresses=addresses;report.assertionsAfterConnect=[...assertions];
 assert.notEqual(addresses[0],addresses[1]);
 const id=await start(a,b,addresses[1]);report.firstMatch=id.toString();
 await until(()=>spectator.locator('.court-topline').textContent().then(t=>t.includes('IN PLAY')),'spectator live');
 report.motion={left:await measureMotion(a,0),right:await measureMotion(b,1)};
 report.checks.push('Canvas owner movement measured on both players across four holds and reversals each');
 for(let i=0;i<6;i++){await a.keyboard.down(i%2?'s':'w');await wait(80);await a.keyboard.up(i%2?'s':'w');await wait(100);}
 await until(async()=>{const s=await snap();return s[9]>0n&&s[12].leftDir===0;},'key release');
 const up=b.getByRole('button',{name:'Move up',exact:true});await up.scrollIntoViewIfNeeded();const box=await up.boundingBox(),touch=await contexts[1].newCDPSession(b);
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await wait(200);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await until(async()=>{const s=await snap();return s[10]>0n&&s[12].rightDir===0;},'touch release');
 await a.reload();await until(()=>a.getByRole('button',{name:'Disconnect lab',exact:true}).isVisible(),'F5 without passkey');assert.deepEqual(assertions,report.assertionsAfterConnect);
 const popupPromise=contexts[0].waitForEvent('page');await a.evaluate(()=>window.open('/labs/interlude','_blank'));const duplicate=await popupPromise;
 await duplicate.waitForLoadState('domcontentloaded');
 await until(()=>duplicate.locator('body').innerText().then(t=>t.includes('another tab')),'single controlling tab',10000);await duplicate.close();
 await finish(a);report.checks.push('Targeted Mera invitation, duplicate create click, two participants and spectator','Keyboard/touch release acknowledged by engine','F5 with no additional passkey ceremony','Duplicate-tab controller lock','Result hash committed on Monad');
 await a.screenshot({path:'artifacts/interlude/browser/desktop-result.png'});await b.screenshot({path:'artifacts/interlude/browser/mobile-result.png'});
 await closeResults(a,b);
 const id2=await start(a,b,addresses[1]);report.secondMatch=id2.toString();assert.equal(id2,id+1n);
 await contexts[0].route(manifest.node+'/**',route=>route.abort());await a.keyboard.down('w');await wait(600);await a.keyboard.up('w');
 await until(()=>a.getByRole('button',{name:'Reconnect lab session',exact:true}).isVisible(),'paused after engine loss');
 await contexts[0].unroute(manifest.node+'/**');await until(()=>a.locator('.lab-status').textContent().then(t=>t.includes('Engine online')),'engine restored',20000);
 await a.getByRole('button',{name:'Reconnect lab session',exact:true}).click();await until(()=>a.getByRole('button',{name:'Disconnect lab',exact:true}).isVisible(),'session restored after uncertain call');
 await until(async()=>(await snap())[12].leftDir===0,'reconnect clears direction');assert.deepEqual(assertions,report.assertionsAfterConnect);
 await finish(a);report.checks.push('Second game keeps the same sessions','Engine connection interruption freezes writes','Reconnect refreshes the nonce without another passkey','Second result matches Monad');
 await closeResults(a,b);
 const natural=await start(a,b,addresses[1]);
 await until(()=>a.locator('.court-topline').textContent().then(t=>t.includes('IN PLAY')),'natural match visible');
 await a.keyboard.down('w');await b.keyboard.down('w');
 await until(async()=>(await snap())[2]===3n,'natural seventh point',65000);
 await a.keyboard.up('w');await b.keyboard.up('w');
 const terminal=await snap();assert(terminal[12].scoreA===7||terminal[12].scoreB===7);assert(terminal[12].finished);
 report.naturalResult={id:String(natural),score:[terminal[12].scoreA,terminal[12].scoreB],winner:terminal[6]};
 for(const [index,p] of [a,b].entries()){
  const dialog=p.getByRole('dialog',{name:'Confirmed match result'});await dialog.waitFor();
  const expected=terminal[6].toLowerCase()===addresses[index].toLowerCase()?'VICTORY':'DEFEAT';
  assert.equal(await dialog.locator('h2').textContent(),expected);
  assert(await dialog.getByText('RESULT CONFIRMED ON INTERLUDE',{exact:true}).isVisible());
  assert.equal(await dialog.getByRole('button',{name:'Watch replay',exact:true}).count(),0);
  assert.equal(await p.evaluate(()=>getComputedStyle(document.body).position),'fixed');
  // Check and dispatch atomically: a screenshot/automation round trip can
  // cross the four-second boundary, where Escape legitimately closes instead.
  await p.evaluate(()=>{if(document.querySelector('.outcome.celebrate'))document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));});
  await until(()=>dialog.getByRole('button',{name:'Rematch ↗',exact:true}).evaluate(e=>e===document.activeElement),'result action focus');
  await p.screenshot({path:`artifacts/interlude/browser/natural-result-${index}.png`});
 }
 await until(()=>spectator.locator('.spectator-result').isVisible(),'neutral spectator result');
 assert.equal(await spectator.getByRole('dialog').count(),0);
 await a.reload();await until(()=>a.getByRole('button',{name:'Disconnect lab',exact:true}).isVisible(),'terminal F5');
 assert.equal(await a.getByRole('dialog').count(),0,'An old result must not celebrate after F5');
 await a.getByRole('button',{name:'View result',exact:true}).click();await a.getByRole('dialog').waitFor();
 assert.equal(await a.locator('.outcome.celebrate').count(),0,'Manual result reopening is static');
 await closeResults(b);
 await a.getByRole('button',{name:'Rematch ↗',exact:true}).dblclick();
 await until(async()=>{const s=await snap();return s[0]===natural+1n&&s[2]===1n&&s[5].toLowerCase()===addresses[1].toLowerCase();},'direct rematch');
 await b.getByRole('button',{name:'Accept & play',exact:true}).click();await until(async()=>(await snap())[2]===2n,'rematch accepted');
 assert.deepEqual(assertions,report.assertionsAfterConnect);
 await finish(a);await closeResults(a,b);
 report.checks.push('Natural seventh point triggers VICTORY and DEFEAT on both players','Spectator sees a neutral winner','Result locks background, supports skipping and focuses actions','F5 does not replay celebration; View result reopens statically','Rematch targets the same rival, preserves sessions and deduplicates double clicks');
 await a.evaluate(()=>{for(const key of Object.keys(sessionStorage))if(key.startsWith('interlude.session.')){const value=JSON.parse(sessionStorage.getItem(key));value.grant.expiry='0';sessionStorage.setItem(key,JSON.stringify(value));}});
 await a.reload();await until(()=>a.getByRole('button',{name:'Reconnect lab session',exact:true}).isVisible(),'expired session');await a.getByRole('button',{name:'Reconnect lab session',exact:true}).click();
 await a.getByRole('dialog',{name:'Connect to Interlude lab'}).getByRole('button',{name:/Continue as/}).click();await until(()=>a.getByRole('button',{name:'Disconnect lab',exact:true}).isVisible(),'explicit passkey renewal');assert.equal(assertions[0],report.assertionsAfterConnect[0]+1);
 await a.getByRole('button',{name:'Disconnect lab',exact:true}).click();assert.equal(await a.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('interlude.session.')).length),0);report.checks.push('Expiry requests explicit renewal','Disconnect removes the lab key');
 for(const viewport of [{width:360,height:640},{width:390,height:844},{width:768,height:1024},{width:1440,height:1000},{width:844,height:390}]){
  await spectator.setViewportSize(viewport);await wait(200);assert(await spectator.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await spectator.getByRole('button',{name:'Arcade settings',exact:true}).click();await spectator.keyboard.press('Escape');assert.equal(await spectator.getByRole('dialog').count(),0);
  await spectator.screenshot({path:`artifacts/interlude/browser/lab-${viewport.width}.png`});report.viewports.push(viewport);
 }
 assert.equal(requests.length,0,'The lab must not submit V4 jobs or query its business API');assert.deepEqual(errors,[]);
 report.checkedAt=new Date().toISOString();report.assertions=assertions;report.errors=errors;report.authenticator='Chromium virtual PRF using the real Mera SDK. Physical devices were not tested.';
 console.log(JSON.stringify(report,null,2));
}catch(e){report.failure=e.message;report.errors=errors;let i=0;report.pages=[];for(const context of contexts)for(const page of context.pages()){await page.screenshot({path:`artifacts/interlude/browser/failure-${i++}.png`}).catch(()=>{});report.pages.push({url:page.url(),text:await page.locator('body').innerText().catch(()=>''),locks:await page.evaluate(()=>navigator.locks.query()).catch(()=>null),storageNames:await page.evaluate(()=>Object.keys(sessionStorage)).catch(()=>[])});}console.error(e);process.exitCode=1;}
finally{await writeFile('artifacts/interlude/browser/report.json',JSON.stringify(report,null,2));for(const c of contexts)await c.close();await browser.close();}
