// Actual public catalogue, Mera implementation, sponsor and hosted game. The
// authenticator is virtual. Recovery material never enters the public report.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {decodeFunctionData,keccak256,parseTransaction} from 'viem';
import {reusableAgentArenaAbi} from '../shared/abi-ReusableAgentArena';
import {synchronizedAgentArenaAbi} from '../shared/abi-SynchronizedAgentArena';
import {installSyncProbe,syncMetrics,confirmedInputMetrics} from './browser-sync-probe';
import {publicationFailureDetails,publicationUnavailable} from '../shared/service-error';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {createHash} from 'node:crypto';
import {assertPrivateSyncBrowserTarget,privateSyncRotation} from './private-sync-continuation';

assert.equal(process.env.PONG_CATALOGUE_MATCH,'authorized-testnet');
const run=process.env.PONG_CATALOGUE_RUN!,channel=process.env.BROWSER_CHANNEL??'chrome';
const mode=Number(process.env.PONG_CATALOGUE_MODE??0),name=process.env.PONG_CATALOGUE_BOT??'NOVA';
const privatePath=process.env.PONG_BROWSER_PRIVATE_PATH!;
const restorePath=process.env.PONG_CATALOGUE_RESTORE_PRIVATE_PATH;
// Opt-in, bounded cadence samples are separate from the full 100-control gate.
const cadenceProbe=process.env.PONG_CATALOGUE_CADENCE_PROBE==='1';
const atomicQualification=process.env.PONG_CATALOGUE_ATOMIC_QUALIFICATION==='1';
const privateV3=process.env.PONG_CATALOGUE_PRIVATE_V3==='reviewed-private';
assert(!process.env.PONG_CATALOGUE_PRIVATE_V3||privateV3);
const publicSynchronized=process.env.PONG_CATALOGUE_SYNCHRONIZATION==='rules16-public';
const initialIdleMs=Number(process.env.PONG_CATALOGUE_INITIAL_IDLE_MS??0);
const readDelayMs=Number(process.env.PONG_CATALOGUE_READ_DELAY_MS??0);
const networkDelayMs=Number(process.env.PONG_CATALOGUE_NETWORK_DELAY_MS??0);
const inputHoldMs=Number(process.env.PONG_CATALOGUE_INPUT_HOLD_MS??80),inputGapMs=Number(process.env.PONG_CATALOGUE_INPUT_GAP_MS??40);
const httpOnly=process.env.PONG_CATALOGUE_HTTP_ONLY==='1';
assert(Number.isInteger(initialIdleMs)&&initialIdleMs>=0&&initialIdleMs<=20000);
assert(Number.isInteger(readDelayMs)&&readDelayMs>=0&&readDelayMs<=400);
assert(Number.isInteger(networkDelayMs)&&networkDelayMs>=0&&networkDelayMs<=200);
assert(Number.isInteger(inputHoldMs)&&inputHoldMs>=80&&inputHoldMs<=1500&&Number.isInteger(inputGapMs)&&inputGapMs>=40&&inputGapMs<=300);
const synchronized=process.env.PONG_CATALOGUE_SYNCHRONIZATION==='rules16-private'||publicSynchronized;
assert(!process.env.PONG_CATALOGUE_SYNCHRONIZATION||synchronized);
assert(publicSynchronized?!privateV3:!synchronized||privateV3,'Synchronization scope must match the actual public/private API');
const continuationScope=process.env.PONG_PRIVATE_SYNC_CONTINUATION;
const deploymentPath=process.env.PONG_CATALOGUE_PRIVATE_DEPLOYMENT;
assert((continuationScope===undefined)===(deploymentPath===undefined),'Private browser continuation needs its scope and pinned deployment together');
let continuationRecord:any,deploymentSha256:string|undefined;
if(continuationScope!==undefined){
 assert(synchronized&&privateV3,'Continuation cannot target the public browser flow');
 const bytes=await readFile(deploymentPath!);continuationRecord=JSON.parse(bytes.toString());
 privateSyncRotation(continuationRecord,continuationScope);
 deploymentSha256=createHash('sha256').update(bytes).digest('hex');
}
if(privateV3)assert(process.env.PONG_CATALOGUE_ASSET_ORIGIN==='http://127.0.0.1:4197'&&!atomicQualification,
 'Private v3 must use its isolated build and actual API capabilities');
if(process.env.PONG_REQUIRE_PERFORMANCE==='1')assert(process.env.PONG_SYNC_PROBE==='1'&&process.env.PONG_SYNC_SPECTATOR==='1',
 'Full performance qualification needs both player and spectator probes before creating a fixture');
const controlCount=cadenceProbe?20:110,idleMs=cadenceProbe?Number(process.env.PONG_CATALOGUE_PROBE_IDLE_MS??8000):45000;
assert(!cadenceProbe||Number.isInteger(idleMs)&&idleMs>=4000&&idleMs<=8000);
assert(/^[a-z0-9-]+$/.test(run)&&['chrome','msedge'].includes(channel)&&[0,1].includes(mode));
assert(/^[A-Z]+$/.test(name)&&privatePath?.includes('private-backups'));
assert(!restorePath||restorePath.includes('private-backups')&&restorePath!==privatePath);
const restored=restorePath?JSON.parse(await readFile(restorePath,'utf8')):undefined;
await writeFile(privatePath,'{}',{flag:'wx',mode:0o600});
const out=`artifacts/qualification/catalogue-${run}`;await mkdir(out,{recursive:true});
const report:any={startedAt:new Date().toISOString(),origin:'https://pongit.xyz',run,channel,mode,bot:name,
 virtualPrf:true,reusedSession:!!restored,mockedNetwork:false,privateV3,synchronized,atomicQualification,cadenceProbe,controlCount,idleMs,passed:false,checks:[],errors:[],submissions:[],receipts:[]};
report.initialIdleMs=initialIdleMs;report.injectedReadLatencyMs=readDelayMs;
report.injectedNetworkDelayEachWayMs=networkDelayMs;
report.inputHoldMs=inputHoldMs;report.inputGapMs=inputGapMs;
report.httpOnly=httpOnly;
if(continuationRecord)report.privateTarget={scope:continuationScope,pool:continuationRecord.common.pool,catalog:continuationRecord.common.catalog,deploymentSha256};
if(privateV3)report.notificationTransport='Private JSON bridge rejects SSE explicitly; actual API polling fallback. Engine WebSocket remains direct.';
const clean=(e:any)=>String(e?.shortMessage??e?.message??e).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);
const browser=await chromium.launch({channel,headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},
 ...(process.env.PONG_CATALOGUE_VIDEO==='1'?{recordVideo:{dir:out+'/video',size:{width:1440,height:1000}}}:{}),
 ...(restored?{storageState:restored.storage}:{})}),page=await context.newPage();
if(httpOnly)await context.routeWebSocket(/wss:\/\/il2-eu-.*\.fly\.dev\//,socket=>socket.close());
// A degraded-network trial forwards every real RPC and exact signed payload.
// Delay every round trip (or only reads), without inventing replies or gameplay.
if(readDelayMs||networkDelayMs)await context.route('https://il2-eu-*.fly.dev/**',async route=>{
 const request=route.request();let read=false;
 try{const body=request.postDataJSON();read=!!body?.method&&!['interlude_sendTransaction','eth_sendRawTransaction'].includes(body.method);}catch{}
 if(networkDelayMs)await new Promise(resolve=>setTimeout(resolve,networkDelayMs));
 const response=await route.fetch();
 if(networkDelayMs||(read&&readDelayMs))await new Promise(resolve=>setTimeout(resolve,networkDelayMs+(read?readDelayMs:0)));
 await route.fulfill({response});
});
if(process.env.PONG_SYNC_PROBE==='1')await installSyncProbe(page);
async function candidateAssets(target:import('@playwright/test').Page){if(process.env.PONG_CATALOGUE_ASSET_ORIGIN){
 const candidate=process.env.PONG_CATALOGUE_ASSET_ORIGIN;assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(candidate));
 report.candidateAssets=candidate;
 await target.route('https://pongit.xyz/**',async route=>{
  const url=new URL(route.request().url());
  if(privateV3&&url.pathname.startsWith('/api/')){
   if(!url.pathname.startsWith('/api/agents/'))return route.abort('blockedbyclient');
   const path=url.pathname.replace(/^\/api/,'');
   const port=/^\/agents\/(transactions|operations)(\/|$)/.test(path)?4196:4194;
   try{return await route.fulfill({response:await route.fetch({url:`http://127.0.0.1:${port}`+path+url.search})});}
   catch{report.errors.push('Private API transport failed');return route.abort().catch(()=>{});}
  }
  if(url.pathname.startsWith('/api/'))return route.continue();
  try{const response=await route.fetch({url:candidate+url.pathname+url.search});await route.fulfill({response});}
  catch{report.errors.push('Candidate web transport failed');await route.abort().catch(()=>{});}
 });
}}
await candidateAssets(page);
const apiGet=(path:string)=>{assert(path.startsWith('/agents/'));return page.request.get(privateV3?'http://127.0.0.1:4194'+path:report.origin+'/api'+path);};
// Qualification-only capability rollout. All RPC, sponsorship and gameplay
// still hit the actual deployment; record this override explicitly.
if(atomicQualification)await page.route('https://pongit.xyz/api/agents/config',async route=>{
 const response=await route.fetch(),config=await response.json();assert.equal(config.version,5);
 await route.fulfill({response,json:{...config,challengeAdmission:'atomic-v1'}});
});
let spectator:import('@playwright/test').Page|undefined;
if(restored)await context.addInitScript(session=>{
 if(sessionStorage.getItem('pongit:test-restored'))return;
 for(const [k,v] of Object.entries(session))sessionStorage.setItem(k,String(v));
 sessionStorage.setItem('pongit:test-restored','1');
},restored.session);
page.setDefaultTimeout(60000);
const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
for(const credential of restored?.credentials?.credentials??[])await cdp.send('WebAuthn.addCredential',{authenticatorId,credential});
let assertions=0;cdp.on('WebAuthn.credentialAsserted',()=>assertions++);
const savePrivate=async()=>writeFile(privatePath,JSON.stringify({storage:await context.storageState(),
 session:await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage))),
 credentials:await cdp.send('WebAuthn.getCredentials',{authenticatorId})}),{mode:0o600});
const starts=new WeakMap<object,number>(),submitted=new Map<string,number>(),receipts=new Set<string>();
report.sockets=[];
page.on('websocket',ws=>{const record:any={host:new URL(ws.url()).host,openedAt:new Date().toISOString(),messages:0,applied:0,schemas:{}};report.sockets.push(record);
 const writes=new Map<string,{at:number;hash:string;action:string}>();
 ws.on('framesent',event=>{try{
  const p=JSON.parse(String(event.payload));if(p.method!=='interlude_sendTransaction')return;
  const hash=keccak256(p.params[0]),tx=parseTransaction(p.params[0]);
  const call=decodeFunctionData({abi:synchronized?synchronizedAgentArenaAbi:reusableAgentArenaAbi,data:tx.data!});
  const at=performance.now();writes.set(String(p.id),{at,hash,action:call.functionName});submitted.set(hash,at);
  if(call.functionName==='input')controls.set(hash,{direction:Number(call.args[2]),sequence:String(call.args[3])});
 }catch{/* Decode only in memory; no signed data enters the report. */}});
 ws.on('framereceived',event=>{try{const p=JSON.parse(String(event.payload));record.messages++;
  const write=writes.get(String(p.id));if(write){
   writes.delete(String(p.id));const ms=performance.now()-write.at;
   report.submissions.push({at:new Date().toISOString(),action:write.action,ms,transport:'websocket',error:!!p.error,
    ...(p.error?{rpcErrorCode:p.error.code,message:clean(p.error)}:{})});
   const receipt=p.result;
   if(receipt?.transactionHash?.toLowerCase()===write.hash.toLowerCase()&&!receipts.has(write.hash)){
    receipts.add(write.hash);report.receipts.push({ms,sentAt:performance.timeOrigin+write.at,confirmedAt:performance.timeOrigin+performance.now(),status:receipt.status,...controls.get(write.hash)});
   }
  }
  if(p.params?.result){record.applied++;
  const shape=JSON.stringify({method:p.method,keys:Object.keys(p.params.result),logKeys:Object.keys(p.params.result.logs?.[0]??{})});record.schemas[shape]=(record.schemas[shape]??0)+1;}}
 catch{/* Record shape only, never payload. */}});ws.on('close',()=>record.closedAt=new Date().toISOString());});
const requests=new WeakMap<object,{at:string;method:string;path:string}>();
const controls=new Map<string,{direction:number;sequence:string}>();
const actions=new WeakMap<object,string>();
const inputIntents:{at:number;direction:number}[]=[];
const retainInputIntents=async()=>{inputIntents.push(...await page.evaluate(()=>(window as any).__intents??[]));};
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
 const call=decodeFunctionData({abi:synchronized?synchronizedAgentArenaAbi:reusableAgentArenaAbi,data:tx.data!});
 actions.set(r,call.functionName);
 if(call.functionName==='input')controls.set(hash,{direction:Number(call.args[2]),sequence:String(call.args[3])});
}catch{/* Decode in memory; never retain signed bytes or grants. */}});page.on('pageerror',e=>report.errors.push(clean(e)));
page.on('response',async response=>{try{
 const request=response.request(),metadata=requests.get(request);
 if(metadata&&!report.playingAt){report.admissionNetwork??=[];report.admissionNetwork.push({...metadata,ms:performance.now()-(starts.get(request)??performance.now()),http:response.status()});}
 }catch{/* Diagnostic failure cannot change gameplay. */}
 try{
  const u=new URL(response.url());if(u.origin===report.origin&&(/^\/api\/agents\/operations\/0x[\da-f]{64}$/i.test(u.pathname)||u.pathname==='/api/agents/transactions')){
   const v=await response.json();if(typeof v?.id==='string'&&typeof v.status==='string'){
    report.sponsorOperations??=[];report.sponsorOperations.push({at:new Date().toISOString(),id:v.id,status:v.status,...(typeof v.hash==='string'?{hash:v.hash}:{})});
   }
  }
 }catch{/* Only public transaction identifiers; never request bodies. */}
 try{
 const request=response.request(),body=request.postDataJSON();if(!body||Array.isArray(body))return;
 if(body.method==='eth_call'&&new URL(response.url()).hostname.endsWith('.fly.dev')){
  const value=await response.json();if(value.error){report.engineReadErrors??=[];report.engineReadErrors.push({at:new Date().toISOString(),message:clean(value.error)});}
 }
 if(!['interlude_sendTransaction','interlude_getTransactionReceipt','eth_getTransactionReceipt'].includes(body.method))return;
 const reply=await response.json();
 if(body.method==='interlude_sendTransaction'){
  const began=starts.get(request)??performance.now();report.submissions.push({at:new Date().toISOString(),action:actions.get(request)??'unknown',
   ms:performance.now()-began,http:response.status(),error:!!reply.error,
   ...(Number.isSafeInteger(reply.error?.code)?{rpcErrorCode:reply.error.code}:{}),
   ...(publicationUnavailable(reply.error)?{publication:publicationFailureDetails(reply.error)}:{})});
  const hash=typeof reply.result==='string'?reply.result:reply.result?.transactionHash;
  if(typeof hash==='string'){
   submitted.set(hash.toLowerCase(),began);
   // Interlude returns the executed receipt in the send response. Counting only
   // later receipt polling silently omitted every ordinary successful control.
   if(reply.result?.transactionHash&&['0x1','success'].includes(reply.result.status)&&!receipts.has(hash.toLowerCase())){
    receipts.add(hash.toLowerCase());report.receipts.push({ms:performance.now()-began,sentAt:performance.timeOrigin+began,confirmedAt:performance.timeOrigin+performance.now(),status:reply.result.status,...controls.get(hash.toLowerCase())});
   }
  }
 }else if(reply.result){
  const hash=String(reply.result.transactionHash??body.params?.[0]??'').toLowerCase(),began=submitted.get(hash);
  if(began!==undefined&&!receipts.has(hash)){receipts.add(hash);report.receipts.push({ms:performance.now()-began,sentAt:performance.timeOrigin+began,confirmedAt:performance.timeOrigin+performance.now(),status:reply.result.status,...controls.get(hash)});}
 }
 }catch{/* No request bodies or private authorization data are logged. */}});
await context.addInitScript(()=>{
 localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'}));
 (window as any).__paddle=[];(window as any).__keys=[];(window as any).__digits=[];(window as any).__intents=[];
 window.addEventListener('click',e=>{if((e.target as Element)?.closest('button')?.getAttribute('aria-label')?.startsWith('Challenge '))
  (window as any).__challengeClickedAt=new Date().toISOString();},true);
 const fill=CanvasRenderingContext2D.prototype.fillRect;
 CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){fill.call(this,x,y,w,h);if(x===22&&w===12&&h>40&&this.canvas.closest('.pool-canvas-slot')){const a=(window as any).__paddle;if(a.length<30000)a.push({at:performance.now(),y});}};
 window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown'].includes(e.code)){
  (window as any).__keys.push({at:performance.now(),dir:e.code});
  (window as any).__intents.push({at:performance.timeOrigin+performance.now(),direction:e.code==='ArrowUp'?-1:1});
 }});
 window.addEventListener('keyup',e=>{if(['ArrowUp','ArrowDown'].includes(e.code))(window as any).__intents.push({at:performance.timeOrigin+performance.now(),direction:0});});
 setInterval(()=>{const digit=document.querySelector('.match-countdown-digit')?.textContent;if(digit){(window as any).__digits.push(digit);
  (window as any).__firstCountdownAt??=new Date().toISOString();}},30);
});
try{
 const config=await (await apiGet('/agents/config')).json();
 if(publicSynchronized)assert(config.rulesVersion===16&&config.friendlyPause==='heartbeat-v1'&&config.hub.toLowerCase()===NO_LEASE_HUB.toLowerCase()&&config.enabled,'Actual public rules-16 migration required');
 if(continuationRecord)assertPrivateSyncBrowserTarget(config,continuationRecord,continuationScope);
 else if(privateV3)assert(config.pool.toLowerCase()===(synchronized?'0xd47bc7fece722a237c6547f85b4dd91c2601a4c8':'0x550ff3c22e20fc760af9afd68fba2cb531140dc6')&&config.rulesVersion===(synchronized?16:15)&&config.hub.toLowerCase()===NO_LEASE_HUB.toLowerCase()&&config.enabled&&config.challengeAdmission==='atomic-v1');
 assert(config.version===5&&config.houseInstances==='official-v1'&&config.maxMatches===5,'Public five-lane migration is not active');
 report.pool=config.pool;report.rulesVersion=config.rulesVersion;
 await page.goto(report.origin+'/agents',{waitUntil:'domcontentloaded'});
 // Server-rendered buttons can be visible before their React handlers exist.
 // A loaded actionable catalogue proves hydration; verify the selection too.
 await expect(page.getByRole('button',{name:`Challenge ${name}`,exact:true})).toBeEnabled({timeout:60000});
 await page.getByRole('button',{name:mode?'Chaos':'Classic',exact:true}).click();
 await expect(page.getByRole('button',{name:mode?'Chaos':'Classic',exact:true})).toHaveAttribute('aria-pressed','true');
 report.clickedAt=new Date().toISOString();
 await page.getByRole('button',{name:`Challenge ${name}`,exact:true}).click();
 report.challengeClickedAt=await page.evaluate(()=>(window as any).__challengeClickedAt);
 report.requestedAt=new Date().toISOString();
 const admissionDeadline=Date.now()+180000;
 if(!restored)await page.getByRole('button',{name:'Create account',exact:true}).click();
 else{
  const connect=page.getByRole('dialog',{name:'Connect to challenge an agent',exact:true});
  // Capacity and authorization checks precede this dialog. Wait for either
  // real outcome, within the original admission deadline, without guessing how
  // long those checks take. Both promises have rejection handlers via race.
  const outcome=await Promise.race([
   connect.waitFor({state:'visible',timeout:180000}).then(()=>'connect'),
   page.waitForURL(/\/agents\/arenas\//,{timeout:180000}).then(()=>'arena')]);
  if(outcome==='connect'){
   report.initialReauthorization=true;
   console.log(JSON.stringify({run,event:'reauthorizing-test-session'}));
   await connect.getByRole('button',{name:/^(Connect & play|Continue)$/}).click();
  }
 }
 await page.waitForURL(/\/agents\/arenas\//,{timeout:Math.max(1,admissionDeadline-Date.now())});await savePrivate();
 const parts=new URL(page.url()).pathname.split('/');report.ref={app:parts[3],epoch:parts[4],id:parts[5]};
 const admitted=await (await apiGet(`/agents/matches/${report.ref.app}/${report.ref.epoch}/${report.ref.id}`)).json();
 report.actualMode=admitted.mode;assert.equal(report.actualMode,mode,'The actual contract match must use the selected mode');
 console.log(JSON.stringify({run,event:'admitted',ref:report.ref}));
 if(process.env.PONG_SYNC_SPECTATOR==='1'){
  spectator=await browser.newPage({viewport:{width:1440,height:1000}});await candidateAssets(spectator);await installSyncProbe(spectator);
  await spectator.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'})));
  await spectator.goto(page.url(),{waitUntil:'domcontentloaded'});
 }
 await page.waitForFunction(()=>{const b=document.querySelector<HTMLButtonElement>('button[aria-label="Move up"]');return b&&!b.disabled&&!document.querySelector('.match-countdown');},{},{timeout:60000});
 report.playingAt=new Date().toISOString();report.digits=await page.evaluate(()=>(window as any).__digits);
 report.countdownAt=await page.evaluate(()=>(window as any).__firstCountdownAt);
 if(report.challengeClickedAt&&report.countdownAt)report.admissionMs=Date.parse(report.countdownAt)-Date.parse(report.challengeClickedAt);
 if(initialIdleMs){
  const before=report.submissions.length;await page.waitForTimeout(initialIdleMs);
  report.initialIdleHeartbeats=report.submissions.slice(before).filter((s:any)=>s.action==='heartbeat'&&!s.error).length;
  report.startupResumes=report.submissions.filter((s:any)=>s.action==='resumeReady'&&!s.error).length;
  assert(report.initialIdleHeartbeats>=Math.floor(initialIdleMs/1000),'Idle player lost liveness before any movement');
  const trace=await page.evaluate(()=>(window as any).__syncProbe);
  if(trace){report.initialIdleTrace=syncMetrics(trace);await writeFile(out+'/initial-idle-trace.json',JSON.stringify(trace));}
  assert(!await page.getByText('Match paused',{exact:true}).isVisible(),'Stationary player became paused on a responsive connection');
  if(process.env.PONG_REQUIRE_NO_STARTUP_PAUSE==='1')assert.equal(report.startupResumes,0,'Initial countdown unnecessarily became a recovery countdown');
 }
 assert(report.digits.includes('3')&&report.digits.includes('2')&&report.digits.includes('1'),'Real launch countdown incomplete');
 const before=assertions;
 for(let i=0;i<controlCount;i++){
  const key=i%2?'ArrowDown':'ArrowUp';await page.keyboard.down(key);await page.waitForTimeout(inputHoldMs);await page.keyboard.up(key);await page.waitForTimeout(inputGapMs);
  if(i===34){await retainInputIntents();await savePrivate();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>{const b=document.querySelector<HTMLButtonElement>('button[aria-label="Move up"]');return b&&!b.disabled;},{},{timeout:30000});assert.equal(assertions,before);report.checks.push('F5 reused the Mera grant');}
 }
 report.controlsEndedAt=new Date().toISOString();
 const trace=await page.evaluate(()=>({paddle:(window as any).__paddle,keys:(window as any).__keys}));
 await writeFile(out+'/input-trace.json',JSON.stringify(trace));
 const local:number[]=[];for(const key of trace.keys){const p=[...trace.paddle].reverse().find((p:any)=>p.at<=key.at);if(!p)continue;const q=trace.paddle.find((q:any)=>q.at>key.at&&q.at-key.at<300&&Math.abs(q.y-p.y)>.2);if(q)local.push(q.at-key.at);}
 const p95=(a:number[])=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*.95)];
 report.input={samples:local.length,p95Ms:p95(local)};report.submissionP95Ms=p95(report.submissions.filter((s:any)=>!s.error).map((s:any)=>s.ms));
 if(report.receipts.length)report.receiptP95Ms=p95(report.receipts.map((r:any)=>r.ms));
 await retainInputIntents();report.confirmedInput=confirmedInputMetrics(inputIntents,report.receipts);
 await writeFile(out+'/intent-trace.json',JSON.stringify(inputIntents));
 await page.screenshot({path:out+'/court.png',fullPage:true});
 if(spectator)await spectator.screenshot({path:out+'/spectator.png',fullPage:true});
 if(process.env.PONG_SYNC_PROBE==='1'){
  // Observe ordinary rallies after the burst of controls, instead of treating
  // a fast command acknowledgement as proof of smooth rendered trajectories.
  report.idleStartedAt=new Date().toISOString();await page.waitForTimeout(idleMs);report.idleEndedAt=new Date().toISOString();
  const data=await page.evaluate(()=>(window as any).__syncProbe);
  await writeFile(out+'/sync-trace.json',JSON.stringify(data));report.sync=syncMetrics(data);
  if(spectator){const observed=await spectator.evaluate(()=>(window as any).__syncProbe);
   await writeFile(out+'/spectator-trace.json',JSON.stringify(observed));report.spectatorSync=syncMetrics(observed);}
 }
 // Explicitly concede this synthetic friendly fixture through the same UI.
 const current=await (await apiGet(`/agents/matches/${report.ref.app}/${report.ref.epoch}/${report.ref.id}`)).json();
 assert.equal(current.mode,mode,'Mode changed after reconnection');
 const resultDialog=page.getByRole('dialog',{name:'Confirmed match result',exact:true});
 if(!current.result&&!await resultDialog.isVisible()){
  // A natural seventh point can open the result while the slower publication
  // API still has no result. Never click through that modal or wait a minute
  // trying to concede a match that has already finished.
  try{
   await page.getByRole('button',{name:'Tools',exact:true}).first().click({timeout:5000});
   if(!await resultDialog.isVisible()){
    const concede=page.getByRole('button',{name:'Concede match',exact:true});
    if(await concede.isEnabled())await concede.click({timeout:5000});
   }
  }catch(error){if(!await resultDialog.isVisible())throw error;}
 }
 const until=Date.now()+90000;
 while(Date.now()<until){
  const response=await apiGet(`/agents/matches/${report.ref.app}/${report.ref.epoch}/${report.ref.id}`);
  if(response.ok()){const value=await response.json();if(value.result?.status===3){report.result=value.result;break;}}
  await page.waitForTimeout(1000);
 }
 assert(report.result,'Conceded fixture must have a published result');
 await page.getByRole('dialog',{name:'Confirmed match result',exact:true}).waitFor({timeout:10000});
 assert.match(await page.locator('.outcome-score').innerText(),new RegExp(`${report.result.scoreA}\\s*:\\s*${report.result.scoreB}`));
 report.checks.push('Final score and result window survived the delayed terminal frame');
 // Retain every measured gate even when another assertion fails. Diagnostics
 // never turn a failed run into a pass or discard a rejected command.
 report.performance={admission:report.admissionMs<=8000,localInput:report.input.p95Ms<=50,confirmedInput:report.confirmedInput.samples>=(cadenceProbe?20:100)&&report.confirmedInput.p95Ms<=300&&report.confirmedInput.mismatches.length===0,
  player:report.sync?report.sync.p95FrameMs<=20&&report.sync.maxHoldMs<=500&&report.sync.frameGaps.length===0&&report.sync.snapshotJumps.length===0&&report.sync.paddleSamples>100&&report.sync.paddleJumps.length===0:null,
  spectator:report.spectatorSync?report.spectatorSync.p95FrameMs<=20&&report.spectatorSync.maxHoldMs<=500&&report.spectatorSync.frameGaps.length===0:null};
 const requiredControls=cadenceProbe?20:100;
 assert(report.submissions.length>=requiredControls,'Insufficient command submissions');
 assert(report.submissions.every((s:any)=>!s.error),'At least one command submission was rejected; inspect action and error metadata');
 assert(local.length>=(cadenceProbe?15:50)&&report.input.p95Ms<=50,'Local movement latency exceeded 50 ms');
 assert(report.submissionP95Ms<=300,'Submission response p95 exceeded 300 ms');
 assert(report.receipts.filter((r:any)=>r.sequence).length>=requiredControls&&report.receiptP95Ms<=300,'Executed input receipt p95 exceeded 300 ms or insufficient evidence');
 assert(report.receipts.every((r:any)=>['0x1','success'].includes(String(r.status))),'A game command reverted');
 if(synchronized){
  report.liveness={heartbeats:report.submissions.filter((s:any)=>s.action==='heartbeat'&&!s.error).length,resumes:report.submissions.filter((s:any)=>s.action==='resumeReady'&&!s.error).length};
  assert(report.liveness.heartbeats>=10,'The actually painted player court must renew liveness while idle');
  if(process.env.PONG_REQUIRE_NO_STARTUP_PAUSE==='1')assert(report.liveness.resumes<=1,'Only the intentional F5 may require a resume countdown');
 }
 report.checks.push(`At least ${requiredControls} public command submissions and local input latency`);
 if(process.env.PONG_REQUIRE_PERFORMANCE==='1')assert(Object.values(report.performance).every(value=>value===true),'A required performance gate failed; inspect admission/render measurements');
 if(process.env.PONG_REQUIRE_RECONCILIATION==='1')assert(report.sync?.paddleSamples>100&&report.sync.paddleJumps.length===0&&report.sync.snapshotJumps.length===0,'Visible reconciliation discontinuities remain');
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.error=clean(e);process.exitCode=1;
 if(process.env.PONG_SYNC_PROBE==='1'){
  const trace=await page.evaluate(()=>(window as any).__syncProbe).catch(()=>undefined);
  if(trace){await writeFile(out+'/failed-sync-trace.json',JSON.stringify(trace));report.failedSync=syncMetrics(trace);}
 }
 report.failureState=await page.evaluate(()=>({hidden:document.hidden,text:document.body.innerText.slice(-1600),controlsDisabled:document.querySelector<HTMLButtonElement>('[aria-label="Move up"]')?.disabled})).catch(()=>undefined);
 await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});}
finally{
 try{await savePrivate();}catch{report.passed=false;report.error??='Private browser recovery state could not be saved';process.exitCode=1;}
 report.finishedAt=new Date().toISOString();
 if(page.video())report.video=await page.video()!.path();
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));await context.close();await browser.close();
 console.log(JSON.stringify({out,passed:report.passed,error:report.error,ref:report.ref,input:report.input,submissionP95Ms:report.submissionP95Ms,receiptP95Ms:report.receiptP95Ms}));
}
