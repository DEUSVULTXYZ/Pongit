// Actual public catalogue, Mera implementation, sponsor and hosted game. The
// authenticator is virtual. Recovery material never enters the public report.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {decodeFunctionData,keccak256,parseTransaction} from 'viem';
import {reusableAgentArenaAbi} from '../shared/abi-ReusableAgentArena';

assert.equal(process.env.PONG_CATALOGUE_MATCH,'authorized-testnet');
const run=process.env.PONG_CATALOGUE_RUN!,channel=process.env.BROWSER_CHANNEL??'chrome';
const mode=Number(process.env.PONG_CATALOGUE_MODE??0),name=process.env.PONG_CATALOGUE_BOT??'NOVA';
const privatePath=process.env.PONG_BROWSER_PRIVATE_PATH!;
const restorePath=process.env.PONG_CATALOGUE_RESTORE_PRIVATE_PATH;
assert(/^[a-z0-9-]+$/.test(run)&&['chrome','msedge'].includes(channel)&&[0,1].includes(mode));
assert(/^[A-Z]+$/.test(name)&&privatePath?.includes('private-backups'));
assert(!restorePath||restorePath.includes('private-backups')&&restorePath!==privatePath);
const restored=restorePath?JSON.parse(await readFile(restorePath,'utf8')):undefined;
await writeFile(privatePath,'{}',{flag:'wx',mode:0o600});
const out=`artifacts/qualification/catalogue-${run}`;await mkdir(out,{recursive:true});
const report:any={startedAt:new Date().toISOString(),origin:'https://pongit.xyz',run,channel,mode,bot:name,
 virtualPrf:true,reusedSession:!!restored,mockedNetwork:false,passed:false,checks:[],errors:[],submissions:[],receipts:[]};
const clean=(e:any)=>String(e?.shortMessage??e?.message??e).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);
const browser=await chromium.launch({channel,headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},...(restored?{storageState:restored.storage}:{})}),page=await context.newPage();
if(restored)await context.addInitScript(session=>{for(const [k,v] of Object.entries(session))sessionStorage.setItem(k,String(v));},restored.session);
page.setDefaultTimeout(60000);
const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
for(const credential of restored?.credentials?.credentials??[])await cdp.send('WebAuthn.addCredential',{authenticatorId,credential});
let assertions=0;cdp.on('WebAuthn.credentialAsserted',()=>assertions++);
const savePrivate=async()=>writeFile(privatePath,JSON.stringify({storage:await context.storageState(),
 session:await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage))),
 credentials:await cdp.send('WebAuthn.getCredentials',{authenticatorId})}),{mode:0o600});
const starts=new WeakMap<object,number>(),submitted=new Map<string,number>(),receipts=new Set<string>();
const requests=new WeakMap<object,{at:string;method:string;path:string}>();
const controls=new Map<string,{direction:number;sequence:string}>();
page.on('request',r=>{starts.set(r,performance.now());try{
 const url=new URL(r.url()),body=r.postDataJSON();
 // Timing metadata only: never retain payloads, signatures, grants or URLs
 // containing operation/account identifiers.
 if(url.origin===report.origin&&url.pathname.startsWith('/api/agents/'))requests.set(r,{at:new Date().toISOString(),method:r.method(),path:url.pathname.replace(/0x[\da-f]+/gi,':id')});
 else if(typeof body?.method==='string')requests.set(r,{at:new Date().toISOString(),method:body.method,path:'rpc'});
 }catch{/* GET requests do not have JSON bodies. */}
 try{
 const body=r.postDataJSON();if(body?.method!=='interlude_sendTransaction')return;
 const raw=body.params[0],hash=keccak256(raw),tx=parseTransaction(raw);
 const call=decodeFunctionData({abi:reusableAgentArenaAbi,data:tx.data!});
 if(call.functionName==='input')controls.set(hash,{direction:Number(call.args[2]),sequence:String(call.args[3])});
}catch{/* Decode in memory; never retain signed bytes or grants. */}});page.on('pageerror',e=>report.errors.push(clean(e)));
page.on('response',async response=>{try{
 const request=response.request(),metadata=requests.get(request);
 if(metadata&&!report.playingAt){report.admissionNetwork??=[];report.admissionNetwork.push({...metadata,ms:performance.now()-(starts.get(request)??performance.now()),http:response.status()});}
 }catch{/* Diagnostic failure cannot change gameplay. */}
 try{
 const request=response.request(),body=request.postDataJSON();if(!body||Array.isArray(body))return;
 if(!['interlude_sendTransaction','interlude_getTransactionReceipt','eth_getTransactionReceipt'].includes(body.method))return;
 const reply=await response.json();
 if(body.method==='interlude_sendTransaction'){
  const began=starts.get(request)??performance.now();report.submissions.push({ms:performance.now()-began,http:response.status(),error:!!reply.error});
  const hash=typeof reply.result==='string'?reply.result:reply.result?.transactionHash;
  if(typeof hash==='string'){
   submitted.set(hash.toLowerCase(),began);
   // Interlude returns the executed receipt in the send response. Counting only
   // later receipt polling silently omitted every ordinary successful control.
   if(reply.result?.transactionHash&&['0x1','success'].includes(reply.result.status)&&!receipts.has(hash.toLowerCase())){
    receipts.add(hash.toLowerCase());report.receipts.push({ms:performance.now()-began,status:reply.result.status,...controls.get(hash.toLowerCase())});
   }
  }
 }else if(reply.result){
  const hash=String(reply.result.transactionHash??body.params?.[0]??'').toLowerCase(),began=submitted.get(hash);
  if(began!==undefined&&!receipts.has(hash)){receipts.add(hash);report.receipts.push({ms:performance.now()-began,status:reply.result.status});}
 }
 }catch{/* No request bodies or private authorization data are logged. */}});
await context.addInitScript(()=>{
 localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'}));
 (window as any).__paddle=[];(window as any).__keys=[];(window as any).__digits=[];
 window.addEventListener('click',e=>{if((e.target as Element)?.closest('button')?.getAttribute('aria-label')?.startsWith('Challenge '))
  (window as any).__challengeClickedAt=new Date().toISOString();},true);
 const fill=CanvasRenderingContext2D.prototype.fillRect;
 CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){fill.call(this,x,y,w,h);if(x===22&&w===12&&h>40&&this.canvas.closest('.pool-canvas-slot')){const a=(window as any).__paddle;if(a.length<30000)a.push({at:performance.now(),y});}};
 window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown'].includes(e.code))(window as any).__keys.push({at:performance.now(),dir:e.code});});
 setInterval(()=>{const digit=document.querySelector('.match-countdown-digit')?.textContent;if(digit){(window as any).__digits.push(digit);
  (window as any).__firstCountdownAt??=new Date().toISOString();}},30);
});
try{
 const config=await (await page.request.get(report.origin+'/api/agents/config')).json();
 assert(config.version===5&&config.houseInstances==='official-v1'&&config.maxMatches===5,'Public five-lane migration is not active');
 report.pool=config.pool;
 await page.goto(report.origin+'/agents',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:mode?'Chaos':'Classic',exact:true}).click();
 report.clickedAt=new Date().toISOString();
 await page.getByRole('button',{name:`Challenge ${name}`,exact:true}).click();
 report.challengeClickedAt=await page.evaluate(()=>(window as any).__challengeClickedAt);
 report.requestedAt=new Date().toISOString();
 if(!restored)await page.getByRole('button',{name:'Create account',exact:true}).click();
 await page.waitForURL(/\/agents\/arenas\//,{timeout:180000});await savePrivate();
 const parts=new URL(page.url()).pathname.split('/');report.ref={app:parts[3],epoch:parts[4],id:parts[5]};
 await page.waitForFunction(()=>{const b=document.querySelector<HTMLButtonElement>('button[aria-label="Move up"]');return b&&!b.disabled&&!document.querySelector('.match-countdown');},{},{timeout:60000});
 report.playingAt=new Date().toISOString();report.digits=await page.evaluate(()=>(window as any).__digits);
 report.countdownAt=await page.evaluate(()=>(window as any).__firstCountdownAt);
 if(report.challengeClickedAt&&report.countdownAt)report.admissionMs=Date.parse(report.countdownAt)-Date.parse(report.challengeClickedAt);
 assert(report.digits.includes('3')&&report.digits.includes('2')&&report.digits.includes('1'),'Real launch countdown incomplete');
 const before=assertions;
 for(let i=0;i<110;i++){
  const key=i%2?'ArrowDown':'ArrowUp';await page.keyboard.down(key);await page.waitForTimeout(80);await page.keyboard.up(key);await page.waitForTimeout(40);
  if(i===34){await savePrivate();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>{const b=document.querySelector<HTMLButtonElement>('button[aria-label="Move up"]');return b&&!b.disabled;},{},{timeout:30000});assert.equal(assertions,before);report.checks.push('F5 reused the Mera grant');}
 }
 const trace=await page.evaluate(()=>({paddle:(window as any).__paddle,keys:(window as any).__keys}));
 await writeFile(out+'/input-trace.json',JSON.stringify(trace));
 const local:number[]=[];for(const key of trace.keys){const p=[...trace.paddle].reverse().find((p:any)=>p.at<=key.at);if(!p)continue;const q=trace.paddle.find((q:any)=>q.at>key.at&&q.at-key.at<300&&Math.abs(q.y-p.y)>.2);if(q)local.push(q.at-key.at);}
 const p95=(a:number[])=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*.95)];
 report.input={samples:local.length,p95Ms:p95(local)};report.submissionP95Ms=p95(report.submissions.filter((s:any)=>!s.error).map((s:any)=>s.ms));
 if(report.receipts.length)report.receiptP95Ms=p95(report.receipts.map((r:any)=>r.ms));
 await page.screenshot({path:out+'/court.png',fullPage:true});
 assert(report.submissions.length>=100&&report.submissions.every((s:any)=>!s.error),'At least 100 successful command submissions required');
 assert(local.length>=50&&report.input.p95Ms<=50,'Local movement latency exceeded 50 ms');
 assert(report.submissionP95Ms<=300,'Submission response p95 exceeded 300 ms');
 assert(report.receipts.filter((r:any)=>r.sequence).length>=100&&report.receiptP95Ms<=300,'Executed input receipt p95 exceeded 300 ms or insufficient evidence');
 report.checks.push('At least 100 public command submissions and local input latency');
 // Explicitly concede this synthetic friendly fixture through the same UI.
 await page.getByRole('button',{name:'Tools',exact:true}).first().click();
 await page.getByRole('button',{name:'Concede match',exact:true}).click();
 const until=Date.now()+90000;
 while(Date.now()<until){
  const response=await page.request.get(`${report.origin}/api/agents/matches/${report.ref.app}/${report.ref.epoch}/${report.ref.id}`);
  if(response.ok()){const value=await response.json();if(value.result?.status===3){report.result=value.result;break;}}
  await page.waitForTimeout(1000);
 }
 assert(report.result,'Conceded fixture must have a published result');
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.error=clean(e);process.exitCode=1;await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});}
finally{await savePrivate();report.finishedAt=new Date().toISOString();await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({out,passed:report.passed,error:report.error,ref:report.ref,input:report.input,submissionP95Ms:report.submissionP95Ms,receiptP95Ms:report.receiptP95Ms}));}
