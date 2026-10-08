// Actual public catalogue, Mera implementation, sponsor and hosted game. The
// authenticator is virtual. Recovery material never enters the public report.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {decodeErrorResult,decodeEventLog,decodeFunctionData,decodeFunctionResult,keccak256,parseTransaction} from 'viem';
import {reusableAgentArenaAbi} from '../shared/abi-ReusableAgentArena';
import {synchronizedAgentArenaAbi} from '../shared/abi-SynchronizedAgentArena';
import {installSyncProbe,syncMetrics,confirmedInputMetrics,sustainedInputMetrics} from './browser-sync-probe';
import {collisionIntegrity} from './collision-integrity-metrics';
import {visibleAim} from './browser-aim';
import {receiptClockMetrics} from './receipt-clock-metrics';
import {terminalReceiptRaces} from './terminal-receipt-evidence';
import {publicationFailureDetails,publicationUnavailable} from '../shared/service-error';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {createHash} from 'node:crypto';
import {assertPrivateSyncBrowserTarget,privateSyncRotation} from './private-sync-continuation';
import {realBackgroundBrowser,recordBackgroundPage} from './real-background-browser';

assert.equal(process.env.PONG_CATALOGUE_MATCH,'authorized-testnet');
const run=process.env.PONG_CATALOGUE_RUN!,channel=process.env.BROWSER_CHANNEL??'chrome';
const mode=Number(process.env.PONG_CATALOGUE_MODE??0),name=process.env.PONG_CATALOGUE_BOT??'NOVA';
const privatePath=process.env.PONG_BROWSER_PRIVATE_PATH!;
const restorePath=process.env.PONG_CATALOGUE_RESTORE_PRIVATE_PATH;
// Opt-in, bounded cadence samples are separate from the full 100-control gate.
const naturalMatch=process.env.PONG_CATALOGUE_NATURAL==='1';
const cadenceProbe=process.env.PONG_CATALOGUE_CADENCE_PROBE==='1';
const atomicQualification=process.env.PONG_CATALOGUE_ATOMIC_QUALIFICATION==='1';
const privateV3=process.env.PONG_CATALOGUE_PRIVATE_V3==='reviewed-private';
assert(!process.env.PONG_CATALOGUE_PRIVATE_V3||privateV3);
const responsive=process.env.PONG_CATALOGUE_SYNCHRONIZATION==='rules17-public';
const integrity=process.env.PONG_CATALOGUE_INPUT_INTEGRITY==='1';
const publicSynchronized=responsive||process.env.PONG_CATALOGUE_SYNCHRONIZATION==='rules16-public';
assert(!integrity||responsive&&naturalMatch,'Integrity qualification requires natural responsive rules');
const initialIdleMs=Number(process.env.PONG_CATALOGUE_INITIAL_IDLE_MS??0);
const readDelayMs=Number(process.env.PONG_CATALOGUE_READ_DELAY_MS??0);
const networkDelayMs=Number(process.env.PONG_CATALOGUE_NETWORK_DELAY_MS??0);
const networkJitterMs=Number(process.env.PONG_CATALOGUE_NETWORK_JITTER_MS??0);
const inputHoldMs=Number(process.env.PONG_CATALOGUE_INPUT_HOLD_MS??80),inputGapMs=Number(process.env.PONG_CATALOGUE_INPUT_GAP_MS??40);
const httpOnly=process.env.PONG_CATALOGUE_HTTP_ONLY==='1';
const homeLogin=process.env.PONG_CATALOGUE_LOGIN_FROM_HOME==='1';
const touchControls=process.env.PONG_CATALOGUE_TOUCH==='1';
const viewportWidth=Number(process.env.PONG_CATALOGUE_WIDTH??1440);
assert([360,390,768,1366,1440].includes(viewportWidth));
const viewportHeight=Number(process.env.PONG_CATALOGUE_HEIGHT??(viewportWidth<768?844:900));
assert(Number.isInteger(viewportHeight)&&viewportHeight>=600&&viewportHeight<=1440);
const fault=process.env.PONG_CATALOGUE_FAULT;
const normalConditions=!fault&&networkDelayMs===0&&readDelayMs===0;
assert(!fault||['f5','disconnect','lost-reply','revoke','background','render-stall','settled-read'].includes(fault));
assert(!fault||naturalMatch&&publicSynchronized,'Faults use only the owned public natural friendly fixture');
assert(fault!=='lost-reply'||httpOnly,'Lost-reply fixture must use the observable HTTP transport');
assert(Number.isInteger(initialIdleMs)&&initialIdleMs>=0&&initialIdleMs<=20000);
assert(Number.isInteger(readDelayMs)&&readDelayMs>=0&&readDelayMs<=400);
assert(Number.isInteger(networkDelayMs)&&networkDelayMs>=0&&networkDelayMs<=200);
assert(Number.isInteger(networkJitterMs)&&networkJitterMs>=0&&networkJitterMs<=networkDelayMs&&networkJitterMs<=50);
assert(Number.isInteger(inputHoldMs)&&inputHoldMs>=80&&inputHoldMs<=2000&&Number.isInteger(inputGapMs)&&inputGapMs>=40&&inputGapMs<=300);
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
if(integrity)assert(process.env.PONG_SYNC_PROBE==='1'&&process.env.PONG_SYNC_SPECTATOR==='1'&&inputHoldMs===2000,
 'Integrity qualification needs both probes and two-second held-input samples');
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
 naturalMatch,virtualPrf:true,reusedSession:!!restored,mockedNetwork:false,privateV3,synchronized,atomicQualification,cadenceProbe,controlCount,idleMs,passed:false,checks:[],errors:[],submissions:[],receipts:[]};
report.initialIdleMs=initialIdleMs;report.injectedReadLatencyMs=readDelayMs;
report.touchControls=touchControls;report.viewportWidth=viewportWidth;report.viewportHeight=viewportHeight;
report.injectedNetworkDelayEachWayMs=networkDelayMs;
report.injectedNetworkJitterEachWayMs=networkJitterMs;
report.inputHoldMs=inputHoldMs;report.inputGapMs=inputGapMs;
report.httpOnly=httpOnly;
report.fault=fault;report.faults=[];
report.acceptanceClass=fault?'fault-recovery':normalConditions?'normal-network':'degraded-network';
report.normalNetworkQualification=normalConditions;
if(continuationRecord)report.privateTarget={scope:continuationScope,pool:continuationRecord.common.pool,catalog:continuationRecord.common.catalog,deploymentSha256};
if(privateV3)report.notificationTransport='Private JSON bridge rejects SSE explicitly; actual API polling fallback. Engine WebSocket remains direct.';
const clean=(e:any)=>String(e?.shortMessage??e?.message??e).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);
const visible=process.env.PONG_CATALOGUE_VISIBLE==='1';
report.visibleBrowser=visible;
const actualBackground=fault==='background'?await realBackgroundBrowser(channel,privatePath+'-profile',restored?.storage):undefined;
const browser=actualBackground?.browser??await chromium.launch({channel,headless:!visible});
const context=actualBackground?.context??await browser.newContext({viewport:{width:viewportWidth,height:viewportHeight},hasTouch:touchControls,isMobile:touchControls,
 ...(process.env.PONG_CATALOGUE_VIDEO==='1'?{recordVideo:{dir:out+'/video',size:{width:1440,height:1000}}}:{}),
 ...(restored?{storageState:restored.storage}:{})}),page=await context.newPage();
if(actualBackground)await page.setViewportSize({width:viewportWidth,height:viewportHeight});
report.nativeTabVisibility=!!actualBackground;
const stopBackgroundVideo=actualBackground?await recordBackgroundPage(page,out):undefined;
let backgroundObserver:import('@playwright/test').Browser|undefined;
// Independent contexts have separate accounts/storage, but both video clocks
// share this computer's UTC clock. The test-only overlay is outside layout flow.
const videoClock=async(target:import('@playwright/test').Page)=>{
 if(process.env.PONG_CATALOGUE_VIDEO!=='1')return;
 await target.addInitScript(()=>{window.addEventListener('DOMContentLoaded',()=>{
  const stamp=document.createElement('output');stamp.setAttribute('aria-hidden','true');
  stamp.style.cssText='position:fixed;left:0;bottom:0;z-index:2147483647;pointer-events:none;font:10px monospace;color:white;background:black';
  document.body.appendChild(stamp);setInterval(()=>stamp.textContent=new Date().toISOString(),100);
 });});
};
await videoClock(page);
const alignClock=async(target:import('@playwright/test').Page)=>{
 const readings=[];
 for(let i=0;i<5;i++){
  const before=performance.timeOrigin+performance.now();
  const remote=await target.evaluate(()=>performance.timeOrigin+performance.now());
  const after=performance.timeOrigin+performance.now();
  readings.push({offsetMs:(before+after)/2-remote,uncertaintyMs:(after-before)/2});
 }
 return readings.sort((a,b)=>a.uncertaintyMs-b.uncertaintyMs)[0];
};
if(httpOnly)await context.routeWebSocket(/wss:\/\/il2-eu-.*\.fly\.dev\//,socket=>socket.close());
const faultSockets:import('@playwright/test').WebSocketRoute[]=[];
if(fault==='disconnect')await context.routeWebSocket(/wss:\/\/il2-eu-.*\.fly\.dev\//,socket=>{
 socket.connectToServer();faultSockets.push(socket);
});
let dropReply=false;
let settledDelayUntil=0;
const delayedSettledReads:{startedAt:number;finishedAt:number;method:string}[]=[];
if(fault==='settled-read')await context.route('https://testnet-rpc.monad.xyz/**',async route=>{
 const body=route.request().postDataJSON(),calls=Array.isArray(body)?body:[body];
 const reads=calls.every(v=>['eth_call','eth_getBlockByNumber','eth_blockNumber','eth_getTransactionReceipt','eth_getBalance','eth_getCode'].includes(v?.method));
 if(Date.now()<settledDelayUntil&&reads){
  const startedAt=Date.now(),response=await route.fetch();
  await new Promise(resolve=>setTimeout(resolve,1500));await route.fulfill({response});
  delayedSettledReads.push({startedAt,finishedAt:Date.now(),method:calls.map(v=>v.method).join(',')});return;
 }
 return route.continue();
});
if(fault==='lost-reply')await context.route('https://il2-eu-*.fly.dev/**',async route=>{
 const body=route.request().postDataJSON();
 if(dropReply&&body?.method==='interlude_sendTransaction'){
  const tx=parseTransaction(body.params[0]);let action='';try{action=decodeFunctionData({abi:synchronizedAgentArenaAbi,data:tx.data!}).functionName;}catch{}
  if(action==='input'){dropReply=false;const response=await route.fetch(),reply=await response.json();
   assert(response.ok()&&reply.result?.status==='0x1','Lost reply must follow actual successful execution');
   report.faults.push({kind:'lost-reply-after-execution',at:new Date().toISOString(),nonce:tx.nonce,hash:reply.result.transactionHash});
   return route.abort('failed');
  }
 }
 return route.continue();
});
// A degraded-network trial forwards every real RPC and exact signed payload.
// Delay every round trip (or only reads), without inventing replies or gameplay.
let delaySample=0;
const networkDelay=()=>networkDelayMs+(networkJitterMs?(((++delaySample*37)%101)/50-1)*networkJitterMs:0);
if(readDelayMs||networkDelayMs)await context.route('https://il2-eu-*.fly.dev/**',async route=>{
 const request=route.request();let read=false;
 try{const body=request.postDataJSON();read=!!body?.method&&!['interlude_sendTransaction','eth_sendRawTransaction'].includes(body.method);}catch{}
 if(networkDelayMs)await new Promise(resolve=>setTimeout(resolve,networkDelay()));
 const response=await route.fetch();
 if(networkDelayMs||(read&&readDelayMs))await new Promise(resolve=>setTimeout(resolve,networkDelay()+(read?readDelayMs:0)));
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
let healthTimer:ReturnType<typeof setInterval>|undefined;
let healthBusy=false;
let spectator:import('@playwright/test').Page|undefined;
let spectatorContext:import('@playwright/test').BrowserContext|undefined;
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
const receiptMeta=(receipt:any)=>{
 let revertName:string|undefined;
 if(typeof receipt?.output==='string')try{revertName=decodeErrorResult({abi:synchronizedAgentArenaAbi,data:receipt.output}).errorName;}catch{}
 return {hash:receipt?.transactionHash,block:receipt?.blockNumber,...(revertName?{revertName}:{})};
};
const starts=new WeakMap<object,number>(),submitted=new Map<string,number>(),receipts=new Set<string>();
report.sockets=[];report.peerEvents=[];
const peerSeen=new Set<string>();
const observePeer=(peer:import('@playwright/test').Page)=>peer.on('websocket',ws=>ws.on('framereceived',event=>{try{
 const frame=JSON.parse(String(event.payload)).params?.result;
 for(const log of frame?.logs??[]){
  const decoded=decodeEventLog({abi:synchronizedAgentArenaAbi,data:log.data,topics:log.topics}) as any;
  if(decoded.eventName!=='ControlQueued')continue;
  const key=`${decoded.args.id}:${decoded.args.side}:${decoded.args.sequence}`;if(peerSeen.has(key))continue;peerSeen.add(key);
  report.peerEvents.push({receivedAt:performance.timeOrigin+performance.now(),id:String(decoded.args.id),side:Number(decoded.args.side),sequence:String(decoded.args.sequence),direction:Number(decoded.args.action)-2});
 }
}catch{/* Only decoded game identifiers/times, never event payloads. */}}));
page.on('websocket',ws=>{const record:any={host:new URL(ws.url()).host,openedAt:new Date().toISOString(),messages:0,applied:0,schemas:{}};report.sockets.push(record);
 const writes=new Map<string,{at:number;hash:string;action:string}>();
 ws.on('framesent',async event=>{try{
  const p=JSON.parse(String(event.payload));if(p.method!=='interlude_sendTransaction')return;
  const hash=keccak256(p.params[0]),tx=parseTransaction(p.params[0]);
  const call=decodeFunctionData({abi:synchronized?synchronizedAgentArenaAbi:reusableAgentArenaAbi,data:tx.data!});
  const at=performance.now();writes.set(String(p.id),{at,hash,action:call.functionName});submitted.set(hash,at);
  if(call.functionName==='input')controls.set(hash,{direction:Number(call.args[2]),sequence:String(call.args[3])});
 }catch{/* Decode only in memory; no signed data enters the report. */}});
 ws.on('framereceived',event=>{try{const p=JSON.parse(String(event.payload));record.messages++;
  const write=writes.get(String(p.id));if(write){
   writes.delete(String(p.id));const ms=performance.now()-write.at;
   report.submissions.push({at:new Date().toISOString(),action:write.action,hash:write.hash,ms,transport:'websocket',error:!!p.error,
    ...(p.error?{rpcErrorCode:p.error.code,message:clean(p.error)}:{})});
   const receipt=p.result;
   if(receipt?.transactionHash?.toLowerCase()===write.hash.toLowerCase()&&!receipts.has(write.hash)){
    receipts.add(write.hash);report.receipts.push({ms,sentAt:performance.timeOrigin+write.at,confirmedAt:performance.timeOrigin+performance.now(),status:receipt.status,action:write.action,...receiptMeta(receipt),side:receiptSide(receipt),...controls.get(write.hash)});
   }
  }
  if(p.params?.result){record.applied++;
  const shape=JSON.stringify({method:p.method,keys:Object.keys(p.params.result),logKeys:Object.keys(p.params.result.logs?.[0]??{})});record.schemas[shape]=(record.schemas[shape]??0)+1;}}
 catch{/* Record shape only, never payload. */}});ws.on('close',()=>record.closedAt=new Date().toISOString());});
const receiptSide=(receipt:any)=>{
 for(const log of receipt?.logs??[]){try{
  const e=decodeEventLog({abi:synchronizedAgentArenaAbi,data:log.data,topics:log.topics}) as any;
  if(e.eventName==='ControlQueued')return Number(e.args.side);
 }catch{}}
 return undefined;
};
const measurePeer=()=>{
 const paired=report.receipts.filter((r:any)=>r.sequence).map((r:any)=>{
  const event=report.peerEvents.find((e:any)=>e.sequence===r.sequence&&e.id===report.ref?.id&&e.direction===r.direction&&e.side===r.side);
  const acknowledgement=commandTimings.find(t=>t.stage==='acknowledged'&&t.hash?.toLowerCase()===r.hash?.toLowerCase());
  const began=integrity?acknowledgement?.timeOrigin+acknowledgement?.startedAt+report.clockAlignment?.player.offsetMs:r.sentAt;
  return event?event.receivedAt-began:undefined;
 }).filter((n:any)=>Number.isFinite(n));
 paired.sort((a:number,b:number)=>a-b);report.peerReception={samples:paired.length,p95Ms:paired[Math.floor((paired.length-1)*.95)],clock:'same computer epoch clocks: browser performance.timeOrigin and Playwright performance.timeOrigin',basis:integrity?'compact send entry to independent observer ControlQueued live event':'wire send to independent observer ControlQueued live event'};
};
const commandTimings:any[]=[];
const retainCommandTimings=async()=>{
 commandTimings.push(...await page.evaluate(()=>{const timings=(window as any).__commandTimings??[];(window as any).__commandTimings=[];return timings;}).catch(()=>[]));
 report.commandTimings=commandTimings;
 const confirmed=new Set(report.receipts.filter((r:any)=>r.sequence).map((r:any)=>r.hash?.toLowerCase()));
 const values=commandTimings.filter(t=>t.stage==='acknowledged'&&t.command==='input'&&confirmed.has(t.hash?.toLowerCase())).map(t=>t.ms).sort((a,b)=>a-b);
 report.sendLatency={samples:values.length,p95Ms:values[Math.floor((values.length-1)*.95)],basis:'compact sender latencyMs: send entry, signing and verified execution receipt; excludes queue and hydration'};
};
const requests=new WeakMap<object,{at:string;method:string;path:string}>();
const controls=new Map<string,{direction:number;sequence:string}>();
const actions=new WeakMap<object,string>();
const inputIntents:{at:number;direction:number}[]=[];
const retainInputIntents=async()=>{inputIntents.push(...await page.evaluate(()=>(window as any).__intents??[]));};
page.on('request',async r=>{starts.set(r,performance.now());try{
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
  const value=await response.json();if(value.error){
   let method='unknown';try{method=decodeFunctionData({abi:synchronizedAgentArenaAbi,data:body.params[0].data}).functionName;}catch{}
   report.engineReadErrors??=[];report.engineReadErrors.push({at:new Date().toISOString(),method,message:clean(value.error)});
  }
  try{const call=decodeFunctionData({abi:synchronizedAgentArenaAbi,data:body.params[0].data});if(call.functionName==='launchClock'&&value.result){
   const [deadline,clock]=decodeFunctionResult({abi:synchronizedAgentArenaAbi,functionName:'launchClock',data:value.result});
   (report.launchReads??=[]).push({at:new Date().toISOString(),deadline:String(deadline),clock:String(clock)});
  }}catch{/* Retain only the public launch clock, never other call data. */}
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
    receipts.add(hash.toLowerCase());report.receipts.push({ms:performance.now()-began,sentAt:performance.timeOrigin+began,confirmedAt:performance.timeOrigin+performance.now(),status:reply.result.status,...receiptMeta(reply.result),side:receiptSide(reply.result),...controls.get(hash.toLowerCase())});
   }
  }
 }else if(reply.result){
  const hash=String(reply.result.transactionHash??body.params?.[0]??'').toLowerCase(),began=submitted.get(hash);
  if(began!==undefined&&!receipts.has(hash)){receipts.add(hash);report.receipts.push({ms:performance.now()-began,sentAt:performance.timeOrigin+began,confirmedAt:performance.timeOrigin+performance.now(),status:reply.result.status,...receiptMeta(reply.result),side:receiptSide(reply.result),...controls.get(hash)});}
 }
 }catch{/* No request bodies or private authorization data are logged. */}});
await context.addInitScript(()=>{
 const get=navigator.credentials.get.bind(navigator.credentials);
 (window as any).__passkeyTimings=[];
 navigator.credentials.get=async(...args)=>{const sample:any={startedAt:performance.now()};(window as any).__passkeyTimings.push(sample);try{return await get(...args);}catch(e){sample.error=(e as Error).name;throw e;}finally{sample.finishedAt=performance.now();}};
 localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'}));
 sessionStorage.setItem('pongit:measure-controls','1');
 (window as any).__commandTimings=[];window.addEventListener('pongit:command-timing',(e:any)=>{const a=(window as any).__commandTimings;if(a.length<20000)a.push({...e.detail,timeOrigin:performance.timeOrigin});});
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
 window.addEventListener('pointerdown',e=>{const label=(e.target as Element)?.closest('button')?.getAttribute('aria-label');
  if(label!=='Move up'&&label!=='Move down')return;
  (window as any).__keys.push({at:performance.now(),dir:label==='Move up'?'ArrowUp':'ArrowDown'});
  (window as any).__intents.push({at:performance.timeOrigin+performance.now(),direction:label==='Move up'?-1:1});
 },true);
 // Keep injected callbacks anonymous: tsx's named-function helper is not part
 // of the browser init-script closure.
 window.addEventListener('pointerup',e=>{if((e.target as Element)?.closest('button[aria-label="Move up"],button[aria-label="Move down"]'))
  (window as any).__intents.push({at:performance.timeOrigin+performance.now(),direction:0});},true);
 window.addEventListener('pointercancel',e=>{if((e.target as Element)?.closest('button[aria-label="Move up"],button[aria-label="Move down"]'))
  (window as any).__intents.push({at:performance.timeOrigin+performance.now(),direction:0});},true);
 setInterval(()=>{const digit=document.querySelector('.match-countdown-digit')?.textContent;if(digit){(window as any).__digits.push(digit);
  (window as any).__firstCountdownAt??=new Date().toISOString();}},30);
});
try{
 const config=await (await apiGet('/agents/config')).json();
 if(publicSynchronized)assert(config.rulesVersion===(responsive?17:16)&&config.friendlyPause==='heartbeat-v1'&&config.hub.toLowerCase()===NO_LEASE_HUB.toLowerCase()&&config.enabled,'Actual public synchronized migration required');
 if(continuationRecord)assertPrivateSyncBrowserTarget(config,continuationRecord,continuationScope);
 else if(privateV3)assert(config.pool.toLowerCase()===(synchronized?'0xd47bc7fece722a237c6547f85b4dd91c2601a4c8':'0x550ff3c22e20fc760af9afd68fba2cb531140dc6')&&config.rulesVersion===(synchronized?16:15)&&config.hub.toLowerCase()===NO_LEASE_HUB.toLowerCase()&&config.enabled&&config.challengeAdmission==='atomic-v1');
 assert(config.version===5&&config.houseInstances==='official-v1'&&config.maxMatches===5,'Public five-lane migration is not active');
 report.pool=config.pool;report.rulesVersion=config.rulesVersion;
 if(homeLogin){
  assert(!restored&&!privateV3,'Unified login starts with a fresh public passkey');
  await page.goto(report.origin,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByRole('button',{name:'Create a passkey',exact:true}).click();
  await page.getByRole('dialog',{name:'Connect to play',exact:true}).waitFor({state:'hidden',timeout:60000});
  report.homeLoginAssertions=assertions;
  const stored=await page.evaluate(()=>({human:Object.keys(sessionStorage).filter(k=>/^pongit:family:0x[\da-f]{40}$/.test(k)).length,
   agents:Object.keys(sessionStorage).filter(k=>k.startsWith('pongit:agent-family:')).length}));
  assert.equal(stored.human,1);assert.equal(stored.agents,1);report.unifiedArcadeKeys=stored;
 }
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
 if(!restored&&!homeLogin)await page.getByRole('button',{name:'Create account',exact:true}).click();
 else if(!homeLogin){
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
 report.matchPlayers=[admitted.a.toLowerCase(),admitted.b.toLowerCase()];report.actualMode=admitted.mode;assert.equal(report.actualMode,mode,'The actual contract match must use the selected mode');
 console.log(JSON.stringify({run,event:'admitted',ref:report.ref}));
 report.health=[];
 const nodeOrigin='https://il2-eu-'+report.ref.app.slice(2,18).toLowerCase()+'.fly.dev';
 healthTimer=setInterval(()=>{if(healthBusy)return;healthBusy=true;void (async()=>{
  const started=performance.timeOrigin+performance.now(),response=await page.request.get(nodeOrigin+'/health',{timeout:3000});
  const h=await response.json();assert.equal(h.app.toLowerCase(),report.ref.app.toLowerCase());assert.equal(String(h.epoch),report.ref.epoch);
  report.health.push({at:started,receivedAt:performance.timeOrigin+performance.now(),block:h.ephemeralBlock,timestamp:h.execTimestamp,
   batches:h.committedBatches,pendingDiffs:h.pendingDiffs,ok:h.ok,sendGated:h.sendGated});
 })().catch(()=>{report.healthReadErrors=(report.healthReadErrors??0)+1;}).finally(()=>healthBusy=false);},1000);

 if(process.env.PONG_SYNC_SPECTATOR==='1'){
  if(actualBackground)backgroundObserver=await chromium.launch({channel,headless:true});
  spectatorContext=await (backgroundObserver??browser).newContext({viewport:{width:1440,height:900},
   ...(process.env.PONG_CATALOGUE_VIDEO==='1'?{recordVideo:{dir:out+'/observer-video',size:{width:1440,height:900}}}:{})});
  spectator=await spectatorContext.newPage();observePeer(spectator);await candidateAssets(spectator);await installSyncProbe(spectator);await videoClock(spectator);
  await spectator.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'})));
  await spectator.goto(page.url(),{waitUntil:'domcontentloaded'});
  await page.bringToFront();
 }
 if(integrity){
  report.clockAlignment={player:await alignClock(page),observer:await alignClock(spectator!)};
  assert(Object.values(report.clockAlignment).every((v:any)=>v.uncertaintyMs<=5),'Client clock measurement uncertainty exceeds 5 ms');
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
 report.countdownComplete=report.digits.includes('3')&&report.digits.includes('2')&&report.digits.includes('1');
 const before=assertions;
 if(restored){report.existingSessionAssertions=assertions;assert.equal(assertions,0,'A still-valid arcade session must not request another passkey');}
 if(homeLogin){assert.equal(before,report.homeLoginAssertions,'Agent challenge must reuse the human login');report.checks.push('Human login and agent challenge used one passkey ceremony');}
 const naturalDeadline=Date.now()+420000;
 let naturalEnded=false;
 report.inputScenarios=[];
 for(let i=0;naturalMatch?Date.now()<naturalDeadline:i<controlCount;i++){
  if(naturalMatch&&await page.getByRole('dialog',{name:'Confirmed match result',exact:true}).isVisible()){naturalEnded=true;break;}
  if(fault&&i===4){
   if(fault==='f5'){
    const trace=await page.evaluate(()=>(window as any).__syncProbe);
    await writeFile(out+'/before-reload-sync-trace.json',JSON.stringify(trace));
    report.beforeReloadSync=syncMetrics(trace);
    await retainInputIntents();await retainCommandTimings();await savePrivate();await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('button[aria-label="Move up"]')?.disabled&&!!document.querySelector('button[aria-label="Move up"]'),{},{timeout:30000});
    assert.equal(assertions,before);report.faults.push({kind:'f5-grant-reused',at:new Date().toISOString()});
   }else if(fault==='disconnect'){
    assert(spectator);await context.setOffline(true);for(const socket of faultSockets)await socket.close();
    await spectator.waitForFunction(()=>(window as any).__syncProbe?.snapshots.at(-1)?.pause?.status>=2,{},{timeout:10000});
    const paused=await spectator.evaluate(()=>{const s=(window as any).__syncProbe.snapshots.at(-1);return {t:s.state.t,a:s.state.scoreA,b:s.state.scoreB};});
    await spectator.waitForTimeout(1000);
    const held=await spectator.evaluate(()=>{const s=(window as any).__syncProbe.snapshots.at(-1);return {t:s.state.t,a:s.state.scoreA,b:s.state.scoreB};});
    assert.deepEqual(held,paused,'Real disconnect must pause physics and scoring');
    await context.setOffline(false);
    await page.waitForFunction(()=>{const b=document.querySelector<HTMLButtonElement>('button[aria-label="Move up"]');return b&&!b.disabled&&!document.querySelector('.match-countdown');},{},{timeout:45000});
    report.faults.push({kind:'disconnect-pauses-clock-and-resumes',at:new Date().toISOString(),paused});
   }else if(fault==='background'){
    assert(spectator);
    const tab=await context.newPage();await tab.goto('about:blank');await tab.bringToFront();
    await page.waitForFunction(()=>document.hidden,{},{timeout:5000});
    await spectator.waitForFunction(()=>(window as any).__syncProbe?.snapshots.at(-1)?.pause?.status>=2,{},{timeout:10000});
    const paused=await spectator.evaluate(()=>{const s=(window as any).__syncProbe.snapshots.at(-1);return {t:s.state.t,a:s.state.scoreA,b:s.state.scoreB};});
    await spectator.waitForTimeout(1000);
    assert.deepEqual(await spectator.evaluate(()=>{const s=(window as any).__syncProbe.snapshots.at(-1);return {t:s.state.t,a:s.state.scoreA,b:s.state.scoreB};}),paused);
    await tab.close();await page.bringToFront();
    await page.waitForFunction(()=>{const b=document.querySelector<HTMLButtonElement>('button[aria-label="Move up"]');return !document.hidden&&b&&!b.disabled&&!document.querySelector('.match-countdown');},{},{timeout:45000});
    report.faults.push({kind:'real-background-pauses-clock-and-resumes',at:new Date().toISOString(),paused});
   }else if(fault==='render-stall'){
    const frames=await page.evaluate(async()=>{
     const data=(window as any).__syncProbe,start=performance.now();
     while(performance.now()-start<2000){const until=performance.now()+80;while(performance.now()<until){};await new Promise(r=>setTimeout(r,20));}
     return data.frames.filter((f:any)=>f.at>=start).map((f:any)=>f.at) as number[];
    });
    const gaps=frames.slice(1).map((at,i)=>at-frames[i]);
    assert(gaps.filter(ms=>ms>=65).length>=5,'Actual visible frame slowdown was not reproduced');
    await page.waitForFunction(()=>{const b=document.querySelector<HTMLButtonElement>('button[aria-label="Move up"]');return b&&!b.disabled&&!document.querySelector('.match-countdown');},{},{timeout:45000});
    report.faults.push({kind:'measured-main-thread-render-stall-recovered',at:new Date().toISOString(),frameGapsMs:gaps});
   }else if(fault==='settled-read'){
    settledDelayUntil=Date.now()+20000;
    report.faults.push({kind:'delayed-client-settled-observation',startedAt:Date.now(),until:settledDelayUntil,delayMs:1500,providerPublicationUnchanged:true});
   }else if(fault==='lost-reply')dropReply=true;
   else{
    await page.bringToFront();
    report.faultStep='opening-tools';await page.getByRole('button',{name:'Tools',exact:true}).first().click();
    report.faultStep='revoking';await page.getByRole('button',{name:'Sign out of this match',exact:true}).click();
    try{await page.getByRole('dialog',{name:'Arena tools',exact:true}).waitFor({state:'hidden',timeout:15000});}
    catch(e){report.passkeyDiagnostic=await page.evaluate(()=>(window as any).__passkeyTimings??[]);report.assertionCount=assertions;
     report.permissionDiagnostic=await page.getByRole('dialog',{name:'Arena tools',exact:true}).getByRole('alert').allTextContents();throw e;}
    assert(await page.getByRole('button',{name:'Move up',exact:true}).isDisabled(),'Revoked control must be disabled');
    report.faultStep='reauthorizing';
    await page.getByRole('button',{name:'Tools',exact:true}).first().click();await page.getByRole('button',{name:'Sign in again',exact:true}).click();
    await page.waitForFunction(()=>{const b=document.querySelector<HTMLButtonElement>('button[aria-label="Move up"]');return b&&!b.disabled&&!document.querySelector('.match-countdown');},{},{timeout:45000});
    report.faults.push({kind:'own-match-revoked-and-reauthorized',at:new Date().toISOString()});
   }
  }
  let desired:-1|0|1=i%2?1:-1,hold=inputHoldMs,gap=inputGapMs,scenario='held';
  if(integrity){
   const segment=i%80;
   if(segment>=4&&segment<8){hold=80;gap=40;scenario='rapid-reversal';}
   else if(segment>=8){
    const picture=await page.evaluate(()=>{const d=(window as any).__syncProbe,s=d?.snapshots.at(-1),side=s?.side;
     return{previous:d?.poses.at(-4),current:d?.poses.at(-1),side,half:d?.paddles.filter((p:any)=>p.side===side).at(-1)?.height/2};});
    const aim=visibleAim(picture.previous,picture.current,picture.side===1?1:0,picture.half||48,i%2===0);
    desired=aim.direction;hold=80;gap=40;scenario=aim.nearContact?'release-at-contact':i%2===0?'aim-edge':'aim-centre';
   }
   report.inputScenarios.push({at:Date.now(),scenario,direction:desired,holdMs:hold});
  }
  const key=desired>0?'ArrowDown':'ArrowUp';
  if(touchControls){
   const button=page.getByRole('button',{name:desired>0?'Move down':'Move up',exact:true});
   if(await button.isDisabled()){await page.waitForTimeout(100);continue;}
   await button.scrollIntoViewIfNeeded();const bounds=(await button.boundingBox())!;
   if(desired)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}]});
   await page.waitForTimeout(hold);if(desired)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{if(desired)await page.keyboard.down(key);await page.waitForTimeout(hold);if(desired)await page.keyboard.up(key);}
  await page.waitForTimeout(gap);
  if(!naturalMatch&&i===34){await retainInputIntents();await retainCommandTimings();await savePrivate();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>{const b=document.querySelector<HTMLButtonElement>('button[aria-label="Move up"]');return b&&!b.disabled;},{},{timeout:30000});assert.equal(assertions,before);report.checks.push('F5 reused the Mera grant');}
 }
 if(naturalMatch){report.naturalEnded=naturalEnded;assert(naturalEnded,'Natural match exceeded its fixed seven-minute observation window');}
 if(fault)assert.equal(report.faults.length,1,'The requested fault must be injected and its recovery verified');
 if(fault==='settled-read'){
  report.delayedSettledReads=delayedSettledReads;
  assert(delayedSettledReads.length>0,'No actual settled read was delayed; this is not a passing injection');
  report.liveReceiptsDuringDelayedRead=report.receipts.filter((r:any)=>delayedSettledReads.some(w=>r.confirmedAt>=w.startedAt&&r.confirmedAt<=w.finishedAt)).length;
  assert(report.liveReceiptsDuringDelayedRead>=5,'Live commands stopped while a settled read was delayed');
 }
 report.controlsEndedAt=new Date().toISOString();
 const trace=await page.evaluate(()=>({paddle:(window as any).__paddle,keys:(window as any).__keys}));
 await writeFile(out+'/input-trace.json',JSON.stringify(trace));
 const local:number[]=[];for(const key of trace.keys){const p=[...trace.paddle].reverse().find((p:any)=>p.at<=key.at);if(!p)continue;const q=trace.paddle.find((q:any)=>q.at>key.at&&q.at-key.at<300&&Math.abs(q.y-p.y)>.2);if(q)local.push(q.at-key.at);}
 const p95=(a:number[])=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*.95)];
 report.input={samples:local.length,p95Ms:p95(local)};report.submissionP95Ms=p95(report.submissions.filter((s:any)=>!s.error).map((s:any)=>s.ms));
 if(report.receipts.length)report.receiptP95Ms=p95(report.receipts.map((r:any)=>r.ms));
 await retainInputIntents();await retainCommandTimings();report.confirmedInput=confirmedInputMetrics(inputIntents,report.receipts,commandTimings);
 await writeFile(out+'/intent-trace.json',JSON.stringify(inputIntents));
 await page.screenshot({path:out+'/court.png',fullPage:true});
 if(spectator)await spectator.screenshot({path:out+'/spectator.png',fullPage:true});
 if(process.env.PONG_SYNC_PROBE==='1'){
  // Observe ordinary rallies after the burst of controls, instead of treating
  // a fast command acknowledgement as proof of smooth rendered trajectories.
  report.idleStartedAt=new Date().toISOString();await page.waitForTimeout(naturalMatch?0:idleMs);report.idleEndedAt=new Date().toISOString();
  const data=await page.evaluate(()=>(window as any).__syncProbe);
  await writeFile(out+'/sync-trace.json',JSON.stringify(data));report.sync=syncMetrics(data);report.sustained=sustainedInputMetrics(data);report.collisions=collisionIntegrity(data.poses??[],data.snapshots??[]);report.layout=data.layout;
  if(spectator){const observed=await spectator.evaluate(()=>(window as any).__syncProbe);
   await writeFile(out+'/spectator-trace.json',JSON.stringify(observed));report.spectatorSync=syncMetrics(observed);}
 }
 // Explicitly concede this synthetic friendly fixture through the same UI.
 const current=await (await apiGet(`/agents/matches/${report.ref.app}/${report.ref.epoch}/${report.ref.id}`)).json();
 assert.equal(current.mode,mode,'Mode changed after reconnection');
 const resultDialog=page.getByRole('dialog',{name:'Confirmed match result',exact:true});
 if(!naturalMatch&&!current.result&&!await resultDialog.isVisible()){
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
 assert(report.result,'Completed fixture must have a published result');
 if(naturalMatch)assert(!report.submissions.some((s:any)=>s.action==='concede'),'A concession is never a natural-match proof');
 await page.getByRole('dialog',{name:'Confirmed match result',exact:true}).waitFor({timeout:10000});
 assert.match(await page.locator('.outcome-score').innerText(),new RegExp(`${report.result.scoreA}\\s*:\\s*${report.result.scoreB}`));
 report.checks.push('Final score and result window survived the delayed terminal frame');
 // Finish the owned fixture and retain movement evidence even if admission or
 // countdown failed. This never turns that failed gate into a passing trial.
 // Retain every measured gate even when another assertion fails. Diagnostics
 // never turn a failed run into a pass or discard a rejected command.
 await retainCommandTimings();
 measurePeer();
 report.executionClock=receiptClockMetrics(report.receipts);
 report.performance={admission:report.admissionMs<=8000,localInput:report.input.p95Ms<=50,confirmedInput:report.confirmedInput.samples>=(naturalMatch||cadenceProbe?20:100)&&report.confirmedInput.p95Ms<=300&&report.confirmedInput.mismatches.length===0,
  player:report.sync?report.sync.p95FrameMs<=20&&report.sync.maxHoldMs<=500&&report.sync.frameGaps.length===0&&report.sync.snapshotJumps.length===0&&report.sync.paddleSamples>100&&report.sync.paddleJumps.length===0:null,
  spectator:report.spectatorSync?report.spectatorSync.p95FrameMs<=20&&report.spectatorSync.maxHoldMs<=500&&report.spectatorSync.frameGaps.length===0:null};
 assert(report.countdownComplete,'Real launch countdown incomplete');
 const requiredControls=naturalMatch||cadenceProbe?20:100;
 assert(report.submissions.length>=requiredControls,'Insufficient command submissions');
 assert(report.submissions.every((s:any)=>!s.error),'At least one command submission was rejected; inspect action and error metadata');
 assert(local.length>=(naturalMatch||cadenceProbe?15:50)&&report.input.p95Ms<=50,'Local movement latency exceeded 50 ms');
 assert(report.submissionP95Ms<=300,'Submission response p95 exceeded 300 ms');
 assert(report.receipts.filter((r:any)=>r.sequence).length>=requiredControls&&report.receiptP95Ms<=300,'Executed input receipt p95 exceeded 300 ms or insufficient evidence');
 report.terminalRaces=terminalReceiptRaces(report.receipts,commandTimings);
 assert(report.receipts.every((r:any)=>['0x1','success'].includes(String(r.status))||report.terminalRaces.includes(r)),
  'An in-game command reverted without verified terminal recovery');
 if(synchronized){
  report.liveness={heartbeats:report.submissions.filter((s:any)=>s.action==='heartbeat'&&!s.error).length,resumes:report.submissions.filter((s:any)=>s.action==='resumeReady'&&!s.error).length};
  assert(report.liveness.heartbeats>=10,'The actually painted player court must renew liveness while idle');
  // Startup is checked before fault injection above. Recovery from an explicit
  // disconnection/revocation is a distinct trial, never a normal-network pass.
  if(process.env.PONG_REQUIRE_NO_STARTUP_PAUSE==='1'&&normalConditions)assert(report.liveness.resumes<=(naturalMatch?0:1),'Unexpected protective resume countdown');
 }
 report.checks.push(`At least ${requiredControls} public command submissions and local input latency`);
 if(process.env.PONG_REQUIRE_RECONCILIATION==='1')assert(report.sync?.paddleSamples>100&&report.sync.paddleJumps.length===0&&report.sync.snapshotJumps.length===0,'Visible reconciliation discontinuities remain');
 if(naturalMatch&&normalConditions){
  const sendP95=integrity?report.sendLatency?.p95Ms:report.submissionP95Ms;
  report.naturalGates={noPause:report.sync?.contractPauseMs===0,noResume:report.liveness?.resumes===0,noResync:report.sync?.visibleResyncs===0&&report.spectatorSync?.visibleResyncs===0,peer:report.peerReception.samples>=20&&(!integrity||report.sendLatency?.samples>=20)&&report.peerReception.p95Ms<=sendP95+50,player:report.performance.player,spectator:report.performance.spectator,executionClock:report.executionClock.samples>=20&&report.executionClock.stalls.length===0&&report.executionClock.rewinds.length===0};
  assert(Object.values(report.naturalGates).every(v=>v===true),'Natural-match synchronization gate failed');
 }
 if(integrity){
  const counts:Record<string,number>={};for(const s of report.inputScenarios)counts[s.scenario]=(counts[s.scenario]??0)+1;
  report.scenarioCounts=counts;
  assert(counts.held>=4&&counts['rapid-reversal']>=4&&counts['aim-centre']>=5&&counts['aim-edge']>=5&&counts['release-at-contact']>=1,'Required visible keyboard scenarios did not all execute');
  assert(report.sustained.held.samples>=20&&report.sustained.held.outsideTarget===0,'Held movement differs from contractual speed');
  assert(report.sustained.stopping.samples>=3&&report.sustained.stopping.p95Drift<=2&&report.sustained.stopping.maxDrift<=6,'Release drift exceeds limits');
  assert(report.collisions.samples>=100&&report.collisions.visiblePaddleBounces>=1&&report.collisions.unconfirmed.length===0,'Visible paddle contact lacks live confirmation');
  assert(report.layout?.length>0,'Visible court geometry was not recorded');
  const layouts=report.layout as {width:number;height:number;x:number;y:number;scrollWidth:number;scrollHeight:number;scrollY:number}[];
  assert(layouts.every(v=>Math.abs(v.width/v.height-16/9)<.02&&v.x>=-1&&v.x+v.width<=viewportWidth+1&&v.scrollWidth<=viewportWidth+1),'Court aspect ratio or horizontal overflow failed');
  if(viewportWidth>=1366){
   const minimum=viewportWidth===1440?1100:900;
   assert(layouts.every(v=>v.width>=minimum&&v.y>=0&&v.y+v.height<=viewportHeight+1&&v.scrollHeight<=viewportHeight+1&&v.scrollY===0),'Desktop court is too small or requires scrolling');
   assert(Math.max(...layouts.map(v=>v.y))-Math.min(...layouts.map(v=>v.y))<=1,'Court shifted during play');
  }
 }
 if(process.env.PONG_REQUIRE_PERFORMANCE==='1')assert(Object.values(report.performance).every(value=>value===true),'A required performance gate failed; inspect admission/render measurements');
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.error=clean(e);process.exitCode=1;
 if(process.env.PONG_SYNC_PROBE==='1'){
  const trace=await page.evaluate(()=>(window as any).__syncProbe).catch(()=>undefined);
  if(trace){await writeFile(out+'/failed-sync-trace.json',JSON.stringify(trace));report.failedSync=syncMetrics(trace);}
 }
 report.failureState=await page.evaluate(()=>({hidden:document.hidden,text:document.body.innerText.slice(-1600),controlsDisabled:document.querySelector<HTMLButtonElement>('[aria-label="Move up"]')?.disabled})).catch(()=>undefined);
 await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});}
finally{
 if(healthTimer)clearInterval(healthTimer);
 try{await savePrivate();}catch{report.passed=false;report.error??='Private browser recovery state could not be saved';process.exitCode=1;}
 await retainCommandTimings();
 measurePeer();
 report.executionClock=receiptClockMetrics(report.receipts);
 report.finishedAt=new Date().toISOString();
 if(page.video())report.video=await page.video()!.path();
 if(stopBackgroundVideo)try{report.video=await stopBackgroundVideo();}catch{report.passed=false;report.error??='Actual background video recording failed';process.exitCode=1;}
 if(actualBackground)report.observerVisibility='headless independent observer; native visible player with focus emulation disabled';
 if(spectator?.video())report.observerVideo=await spectator.video()!.path();
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));await context.close();await spectatorContext?.close();await browser.close();await backgroundObserver?.close();actualBackground?.child.kill();
 console.log(JSON.stringify({out,passed:report.passed,error:report.error,ref:report.ref,input:report.input,submissionP95Ms:report.submissionP95Ms,receiptP95Ms:report.receiptP95Ms}));
}
