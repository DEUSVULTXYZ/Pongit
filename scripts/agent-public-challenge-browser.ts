// Actual public Mera/sponsor queue check. The PRF authenticator is virtual.
// Preserve its private recovery material outside diagnostics on every exit.
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const privatePath='/secrets/public-challenge.json',out='/diagnostics/public-challenge.json';
try{await readFile(privatePath);throw Error('Preserve the previous challenge run');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const report:any={startedAt:new Date().toISOString(),passed:false,origin:'https://pongit.xyz',mockedNetwork:false,virtualPrf:true,checks:[]};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
page.setDefaultTimeout(60000);
await context.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'})));
const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
let assertions=0;cdp.on('WebAuthn.credentialAsserted',()=>assertions++);
const save=async()=>writeFile(privatePath,JSON.stringify({storage:await context.storageState(),session:await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage))),credentials:await cdp.send('WebAuthn.getCredentials',{authenticatorId})}),{mode:0o600});
try{
 await page.goto('https://pongit.xyz/agents');
 await page.getByRole('button',{name:'Challenge NOVA',exact:true}).click();
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await page.getByRole('button',{name:'Cancel challenge',exact:true}).waitFor({timeout:120000});await save();
 const before=assertions;const player=await page.evaluate(()=>{const key=Object.keys(sessionStorage).find(k=>k.startsWith('pongit:agent-family:'));if(!key)throw Error('Missing family');return JSON.parse(sessionStorage.getItem(key)!).grant.player;});
 report.player=player;report.checks.push('Actual Mera family and public sponsored challenge');
 const status=await (await page.request.get(`https://pongit.xyz/api/agents/challenges/${player}`)).json();assert(status.request?.status===1);report.challengeId=status.request.id;
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Cancel challenge',exact:true}).waitFor();assert.equal(assertions,before);report.checks.push('F5 restores queued challenge without a new ceremony');
 await page.getByRole('button',{name:'Cancel challenge',exact:true}).click();
 await page.getByRole('button',{name:'Cancel challenge',exact:true}).waitFor({state:'detached'});
 const after=await (await page.request.get(`https://pongit.xyz/api/agents/challenges/${player}`)).json();assert.equal(after.request,null);report.checks.push('Cancellation confirmed by public contract-backed API');report.passed=true;
}catch(e){report.failure=String((e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]');process.exitCode=1;}
finally{await save();report.finishedAt=new Date().toISOString();await writeFile(out,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
