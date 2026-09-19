// Read the actual completed browser matches after their engine has closed.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {decodeSession,encodeSession,storageKey,sessionGrantTypedData} from '@interludelayer-sdk/sdk';
import {privateKeyToAccount} from 'viem/accounts';
import {chaosQualificationRecord} from './chaos-qualification-record';
assert.equal(process.env.PONG_CHAOS_QUALIFY,'isolated-hosted-testnet');
const {prefix,record}=await chaosQualificationRecord();
const secret=JSON.parse(await readFile(`/secrets/${prefix}-browser-1.json`,'utf8'));
const prior=JSON.parse(await readFile('artifacts/drand/real-browser-1/report.json','utf8'));
assert(prior.passed);assert.equal(prior.app,record.app);
const origin='https://pongit.xyz',report:any={at:new Date().toISOString(),app:record.app,scope:'Actual indexed match records and cached frames after engine closure',matches:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
try{for(const mode of [0,1]){
 const person=secret.people[mode*3],match=prior.matches[mode];
 // Same fixture owner, freshly signed limited grant. No node write is needed
 // to authenticate read-only history after the old engine has stopped.
 const stored=decodeSession(person.stored)!;assert(stored);stored.grant.expiry=BigInt(Math.floor(Date.now()/1000)+1800);
 stored.signature=await privateKeyToAccount(person.key).signTypedData(sessionGrantTypedData(stored.grant,{app:stored.app,baseChainId:10143}));
 person.session[storageKey(stored.app,10143,stored.grant.granter)]=encodeSession(stored);
 const context=await browser.newContext({viewport:{width:mode?390:1440,height:900}});
 await context.addInitScript(session=>{for(const [k,v]of Object.entries(session))sessionStorage.setItem(k,String(v));localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false}));},person.session);
 await context.route(origin+'/**',async route=>{const u=new URL(route.request().url());await route.fulfill({response:await route.fetch({url:u.pathname.startsWith('/api/')?'http://chaos-api:4013'+u.pathname.slice(4)+u.search:'http://countdown-web:3000'+u.pathname+u.search,maxRetries:1})});});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 const replies:any[]=[];page.on('response',async r=>{if(/\/api\/interlude\/(recent-matches|replay)/.test(r.url()))replies.push({url:r.url(),status:r.status(),value:await r.json()});});
 await page.goto(origin+'/rooms?history='+encodeURIComponent(`10143:${prior.app}:1:${match.id}`));
 try{await page.getByLabel('Replay position').waitFor({timeout:30000});}catch(e){report.body=(await page.locator('body').innerText()).slice(0,5000);throw e;}
 const slider=page.getByLabel('Replay position');const max=Number(await slider.getAttribute('max'));assert(max>20);await slider.fill(String(max));
 await page.getByText(`${match.score[0]} : ${match.score[1]}`,{exact:true}).last().waitFor();
 await page.getByRole('button',{name:'Play replay',exact:true}).click();await page.waitForTimeout(1000);const progressed=Number(await slider.inputValue());assert(progressed>0&&progressed<max);
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 const court=await page.locator('[role="dialog"] canvas').boundingBox();assert(court&&court.height>100&&Math.abs(court.width/court.height-16/9)<.02,'The replay court must be visible at its actual aspect ratio');
 await page.screenshot({path:`artifacts/drand/replay-${mode}.png`});
 assert(replies.filter(r=>r.status===401).length<=1,'Only the absent initial cookie can require authentication');assert(replies.every(r=>r.status===200||r.status===401&&r.url.endsWith('/recent-matches')));report.matches.push({mode,id:match.id,frames:max+1,progressed,score:match.score,pages:replies.filter(r=>r.url.includes('/replay?')).map(r=>r.value.frames.length)});await context.close();
}assert.equal(report.errors.length,0);report.passed=true;}catch(e){report.passed=false;report.error=(e as Error).message;process.exitCode=1;}finally{await browser.close();await writeFile('artifacts/drand/replay-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
