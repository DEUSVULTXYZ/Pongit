// Fresh disposable virtual PRF account, real encrypted writes, no gameplay admissions.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
assert.equal(process.env.ROOMS_BROWSER_TEST,'isolated-vps');
const out='artifacts/independent-candidate/private-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const report:any={at:new Date().toISOString(),checks:[],scope:'One disposable virtual PRF credential on real Monad; no physical-device recovery claim'};
let page:Awaited<ReturnType<typeof browser.newPage>>;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();
 await context.route('https://pongit.xyz/**',async route=>{
  const url=new URL(route.request().url());let target='http://independent-web:3000'+url.pathname+url.search;
  if(url.pathname.startsWith('/api/independent/'))target='http://independent-service:4012'+url.pathname.slice(4)+url.search;
  else if(url.pathname.startsWith('/api/')){assert(/^\/api\/(auth\/|notebook)/.test(url.pathname));target='http://pongit-relayer-1:4000'+url.pathname.slice(4)+url.search;}
  await route.fulfill({response:await route.fetch({url:target,timeout:30000})});
 });
 const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
 await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
 await page.goto('https://pongit.xyz');await page.getByRole('button',{name:'Enter muted',exact:true}).click();
 await page.getByRole('button',{name:'Connect',exact:true}).click();await page.getByRole('button',{name:'Create a passkey',exact:true}).click();
 const header=page.locator('.rooms-header-actions > button').last();
 await page.waitForFunction(()=>!!Object.keys(sessionStorage).find(k=>k.startsWith('pongit:family:')&&!k.endsWith(':operation')),{},{timeout:60000});
 await page.waitForFunction(()=>!document.querySelector('[aria-modal=true]'),{},{timeout:60000});await header.click();
 await page.getByRole('button',{name:'Private notebook',exact:true}).click();
 await page.getByRole('button',{name:'Unlock notebook ↗',exact:true}).click();
 await page.getByRole('button',{name:'Save encrypted',exact:true}).waitFor({timeout:60000});
 const sentinel='private-qualification-'+Date.now();
 await page.getByLabel('Username or address',{exact:true}).fill('0x1111111111111111111111111111111111111111');
 await page.getByLabel('Private nickname',{exact:true}).fill(sentinel);await page.getByRole('button',{name:'Add rival',exact:true}).click();
 await page.getByText(sentinel,{exact:true}).waitFor();
 await page.getByRole('button',{name:'Save encrypted',exact:true}).click();await page.getByText('Encrypted copy saved on Monad.',{exact:true}).waitFor({timeout:90000});
 assert(await page.evaluate(text=>!JSON.stringify([localStorage,sessionStorage]).includes(text),sentinel),'Private plaintext leaked into persistent storage');
 report.checks.push('Real owner-authorized encrypted notebook commit; private nickname absent from localStorage/sessionStorage');
 await page.getByRole('button',{name:'Lock',exact:true}).click();assert.equal(await page.getByText(sentinel,{exact:true}).count(),0);
 await page.reload();
 await page.waitForFunction(()=>{const b=document.querySelector('.rooms-header-actions > button:last-child');return b&&!/Connect|Continue as|Renew/.test(b.textContent||'');},{},{timeout:60000});
 await header.click();await page.getByRole('button',{name:'Private notebook',exact:true}).click();await page.getByRole('button',{name:'Unlock notebook ↗',exact:true}).click();
 await page.getByText(sentinel,{exact:true}).waitFor({timeout:60000});report.checks.push('Lock and F5 clear plaintext; the same passkey decrypts the saved Monad backup');
 await page.keyboard.press('Escape');await header.click();await page.getByRole('button',{name:'Disconnect',exact:true}).click();
 await page.waitForFunction(()=>!Object.keys(sessionStorage).some(k=>k.startsWith('pongit:family:')),{},{timeout:60000});
 assert(await page.evaluate(text=>!JSON.stringify([localStorage,sessionStorage]).includes(text),sentinel));
 report.checks.push('Disconnect clears the limited session and closes the private notebook');report.passed=true;
}catch(e){report.passed=false;report.failure=String((e as Error).message).replace(/0x[\da-f]{64,}/gi,'[hex omitted]');throw e;}
finally{report.finishedAt=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
