// Real HTTP queue integration, with an isolated local upstream, no blockchain
// endpoint and no host port. Run only in the temporary VPS test container.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {encodeFunctionData,multicall3Abi,zeroHash} from 'viem';
import {roomsLifecycleHubAbi} from '../shared/abi-rooms-lifecycle';
import {reusableAgentPoolAbi} from '../shared/abi-ReusableAgentPool';

assert.equal(process.env.PONG_GATEWAY_QUALIFICATION,'isolated-vps');
assert.equal(process.getuid?.(),1000);
const sent:Array<{method:string;params:unknown[];at:number}>=[];
const upstream=createServer(async(req,res)=>{
 let body='';for await(const part of req)body+=part;
 const input=JSON.parse(body);sent.push({method:input.method,params:input.params,at:performance.now()});
 res.setHeader('content-type','application/json');
 const header=input.method==='eth_getBlockByNumber';
 const number=input.params[0]==='latest'?'0x1000':input.params[0];
 res.end(JSON.stringify({jsonrpc:'2.0',id:input.id,result:header?{number,hash:`0x${String(number).slice(2).padStart(64,'0')}`}:{fixture:true,method:input.method,params:input.params}}));
});
upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
const address=upstream.address();assert(address&&typeof address==='object');
const url=`http://127.0.0.1:${address.port}`;
const gateway=spawn(process.execPath,['--import','tsx','relayer/src/rpc-gateway.ts'],{
 env:{PATH:process.env.PATH,NODE_ENV:'test',RPC_UPSTREAM:url,RPC_UPSTREAM_FALLBACK:url,RPC_PORT:'18545',RPC_SPACING_MS:'60'},
 stdio:['ignore','pipe','pipe'],
});
let stderr='';gateway.stderr.on('data',chunk=>stderr+=String(chunk));
const report:{passed:boolean;scope:string;checks:string[];sent?:typeof sent;error?:string}={passed:false,scope:'Actual isolated gateway HTTP queue with synthetic local RPC upstream; no hosted performance claim',checks:[]};
async function rpc(method:string,params:unknown[],foreground=false){
 const response=await fetch('http://127.0.0.1:18545',{method:'POST',headers:{'content-type':'application/json',...(foreground?{'x-pongit-rpc-foreground':'1'}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});
 const value=await response.json() as any;assert(!value.error);return value.result;
}
try{
 await new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Isolated gateway did not start')),10000);
  gateway.once('error',reject);gateway.once('exit',()=>reject(Error('Gateway stopped before readiness')));
  gateway.stdout.on('data',chunk=>{if(String(chunk).includes('Private RPC gateway listening')){clearTimeout(timer);resolve();}});
 });
 const old=Array.from({length:20},(_,i)=>rpc('eth_getBlockByNumber',[`0x${(1000+i).toString(16)}`,false]));
 const deadline=Date.now()+5000;
 for(;;){
  const health=await fetch('http://127.0.0.1:18545/health').then(r=>r.json()) as any;
  if(health.queued.history>=15)break;
  assert(Date.now()<deadline,'Backfill queue never became observable');await new Promise(r=>setTimeout(r,10));
 }
 const prior=sent.length;
 const current=rpc('eth_getBlockByNumber',['latest',false]);
 const recovery=rpc('eth_getTransactionByHash',['0x1234']);
 await Promise.all([...old,current,recovery]);
 const header=sent.findIndex(v=>v.params[0]==='latest'),hash=sent.findIndex(v=>v.method==='eth_getTransactionByHash');
 report.sent=sent.map(v=>({...v,at:Math.round(v.at-sent[0].at)}));
 assert(header>=prior&&header<prior+5,'Current header was held behind historical blocks');
 assert(hash>=prior&&hash<prior+5,'Uncertain transaction recovery was held behind historical blocks');
 assert.equal(sent.length,22);
 // CPU throttling can make the upstream observe buffered requests together.
 // Enforce total burst pacing here; the scheduler's fake-clock test checks
 // every dispatch interval independently of HTTP arrival timing.
 assert(sent.at(-1)!.at-sent[0].at>=(sent.length-1)*45,'Interactive requests bypassed the shared burst budget');
 assert.equal(sent.filter(v=>v.method==='eth_getBlockByNumber'&&v.params[0]!=='latest').length,20,'History was starved');
 report.checks.push('Current grant/deadline header overtakes backfill','Transaction hash reconciliation overtakes backfill','All twenty archive reads complete','Shared upstream pacing preserved');
 // Real archive readers use EIP-1898, not just historical number tags. Record
 // that header first, then reproduce the previous interactive-queue pollution.
 await rpc('eth_getBlockByNumber',['latest',false]);
 const archivedHeader=await rpc('eth_getBlockByNumber',['0x20',false]);
 const pin={blockHash:archivedHeader.hash,requireCanonical:true};
 const archived=Array.from({length:20},(_,i)=>rpc('eth_call',[{to:'0x01',data:`0x${i.toString(16).padStart(2,'0')}`},pin]));
 const hashDeadline=Date.now()+5000;
 for(;;){
  const health=await fetch('http://127.0.0.1:18545/health').then(r=>r.json()) as any;
  if(health.queued.history>=15)break;
  assert(Date.now()<hashDeadline,'Canonical archive calls still occupy the interactive queue');await new Promise(r=>setTimeout(r,10));
 }
 const hashPrior=sent.length;
 await Promise.all([...archived,rpc('eth_estimateGas',[{to:'0x01'}]),rpc('eth_getTransactionReceipt',['0x1234'])]);
 for(const method of ['eth_estimateGas','eth_getTransactionReceipt']){
  const i=sent.findIndex((v,i)=>i>=hashPrior&&v.method===method);
  assert(i>=hashPrior&&i<hashPrior+5,`${method} waited behind hash-pinned archive traffic`);
 }
 const canonical=sent.filter(v=>v.method==='eth_call');assert.equal(canonical.length,20);
 assert(canonical.every(v=>JSON.stringify(v.params[1])===JSON.stringify(pin)),'Canonical validation was changed');
 report.sent=sent.map(v=>({...v,at:Math.round(v.at-sent[0].at)}));
 report.checks.push('Hash-pinned archive calls use historical scheduling','Sponsor simulation and receipts overtake canonical history','Every archive call retains requireCanonical');
 const metadata=Array.from({length:12},(_,i)=>rpc('eth_call',[{to:'0x01',data:`0xaa${i.toString(16).padStart(2,'0')}`},'latest']));
 const foregroundDeadline=Date.now()+5000;
 for(;;){
  const health=await fetch('http://127.0.0.1:18545/health').then(r=>r.json()) as any;
  if(health.queued.interactive>=8)break;
  assert(Date.now()<foregroundDeadline,'Background metadata did not queue');await new Promise(r=>setTimeout(r,10));
 }
 const foregroundPrior=sent.length;
 await Promise.all([...metadata,rpc('eth_call',[{to:'0x01',data:'0xfade'},'latest'],true)]);
 const urgent=sent.findIndex(v=>(v.params[0] as any)?.data==='0xfade');
 assert(urgent>=foregroundPrior&&urgent<foregroundPrior+4,'A player read waited behind the catalogue');
 assert.equal(sent.filter(v=>String((v.params[0] as any)?.data).startsWith('0xaa')).length,12,'Catalogue reads starved');
 report.checks.push('Foreground player read overtakes background metadata through the real HTTP gateway','All background reads still complete');
 const hydration=Array.from({length:20},(_,i)=>rpc('eth_call',[{to:'0x01',data:`0xbb${i.toString(16).padStart(2,'0')}`},'latest'],true));
 const queueDeadline=Date.now()+5000;
 for(;;){
  const health=await fetch('http://127.0.0.1:18545/health').then(r=>r.json()) as any;
  if(health.queued.interactive>=15)break;
  assert(Date.now()<queueDeadline,'Foreground hydration did not queue');await new Promise(r=>setTimeout(r,10));
 }
 const controlPrior=sent.length,receiptHash=`0x${'ab'.repeat(32)}`;
 await Promise.all([...hydration,rpc('eth_getTransactionReceipt',[receiptHash]),rpc('eth_maxPriorityFeePerGas',[])]);
 for(const method of ['eth_getTransactionReceipt','eth_maxPriorityFeePerGas']){
  const index=sent.findIndex((v,i)=>i>=controlPrior&&v.method===method);
  assert(index>=controlPrior&&index<controlPrior+4,`${method} waited behind foreground hydration`);
 }
 assert.equal(sent.filter(v=>String((v.params[0] as any)?.data).startsWith('0xbb')).length,20);
 report.checks.push('Accepted transaction receipts and fees overtake foreground hydration without extra throughput');
 report.sent=sent.map(v=>({...v,at:Math.round(v.at-sent[0].at)}));
 // Same recent canonical headers as live readers; transaction work must
 // overtake them, not only eth_call hydration, with the rate cap unchanged.
 const headers=Array.from({length:16},(_,i)=>rpc('eth_getBlockByNumber',[`0x${(4095-i).toString(16)}`,false]));
 const headerDeadline=Date.now()+5000;
 for(;;){
  const h=await fetch('http://127.0.0.1:18545/health').then(r=>r.json()) as any;
  if(h.queued.interactive>=12)break;
  assert(Date.now()<headerDeadline,'Recent header backlog did not queue');await new Promise(r=>setTimeout(r,10));
 }
 const txPrior=sent.length,account=`0x${'12'.repeat(20)}`;
 await Promise.all([...headers,rpc('eth_getTransactionCount',[account,'pending']),rpc('eth_getTransactionReceipt',[`0x${'cd'.repeat(32)}`])]);
 for(const method of ['eth_getTransactionCount','eth_getTransactionReceipt']){
  const index=sent.findIndex((v,i)=>i>=txPrior&&v.method===method);
  assert(index>=txPrior&&index<txPrior+4,`${method} waited behind routine canonical headers`);
 }
 const last=sent.slice(txPrior);
 assert(last.at(-1)!.at-last[0].at>=(last.length-1)*45,'Transaction priority raised upstream throughput');
 report.checks.push('Nonce and receipt overtake routine recent headers with unchanged pacing');
 const hub='0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e',pool='0x1111111111111111111111111111111111111111';
 const fence=encodeFunctionData({abi:multicall3Abi,functionName:'aggregate3',args:[[
  {target:pool,allowFailure:true,callData:encodeFunctionData({abi:reusableAgentPoolAbi,functionName:'laneRecord',args:[0]})},
  {target:hub,allowFailure:true,callData:encodeFunctionData({abi:roomsLifecycleHubAbi,functionName:'delegationOf',args:[pool,zeroHash]})},
 ]]});
 const backlog=Array.from({length:20},(_,i)=>rpc('eth_call',[{to:pool,data:`0xcc${i.toString(16).padStart(2,'0')}`},'0x1000'],true));
 const readyUntil=Date.now()+5000;
 while((await fetch('http://127.0.0.1:18545/health').then(r=>r.json()) as any).queued.interactive<15){
  assert(Date.now()<readyUntil);await new Promise(r=>setTimeout(r,10));
 }
 const fencePrior=sent.length;
 await Promise.all([...backlog,rpc('eth_call',[{to:'0xcA11bde05977b3631167028862bE2a173976CA11',data:fence},'0x1000'],true)]);
 const fenceIndex=sent.findIndex((v,i)=>i>=fencePrior&&(v.params[0] as any)?.data===fence);
 assert(fenceIndex>=fencePrior&&fenceIndex<fencePrior+4,'Shared engine fence expired behind unrelated hydration');
 assert.equal(sent.filter(v=>String((v.params[0] as any)?.data).startsWith('0xcc')).length,20);
 report.checks.push('Canonical shared arena fence overtakes foreground hydration; every other read still completes');
 report.sent=sent.map(v=>({...v,at:Math.round(v.at-sent[0].at)}));
 // A UI may join the exact pending read initiated by a background service.
 // Coalescing must retain one upstream request while inheriting player priority.
 const sharedBacklog=Array.from({length:16},(_,i)=>rpc('eth_call',[{to:pool,data:`0xdd${i.toString(16).padStart(2,'0')}`},'latest']));
 const duplicateParams=[{to:pool,data:'0xfeed'},'latest'];
 const backgroundShared=rpc('eth_call',duplicateParams);
 const sharedDeadline=Date.now()+5000;
 while((await fetch('http://127.0.0.1:18545/health').then(r=>r.json()) as any).queued.interactive<14){
  assert(Date.now()<sharedDeadline);await new Promise(r=>setTimeout(r,10));
 }
 const sharedPrior=sent.length,playerShared=rpc('eth_call',duplicateParams,true);
 const [backgroundResult,playerResult]=await Promise.all([backgroundShared,playerShared]);
 await Promise.all(sharedBacklog);
 assert.deepEqual(backgroundResult,playerResult);
 const forwarded=sent.filter(v=>(v.params[0] as any)?.data==='0xfeed');assert.equal(forwarded.length,1);
 const sharedIndex=sent.findIndex(v=>(v.params[0] as any)?.data==='0xfeed');
 assert(sharedIndex>=sharedPrior&&sharedIndex<sharedPrior+4,'Coalesced player read inherited background queue delay');
 assert((await fetch('http://127.0.0.1:18545/health').then(r=>r.json()) as any).coalescedForegroundPromotions>=1);
 report.checks.push('A player promotes its identical queued read without duplicate RPC or extra throughput');
 report.sent=sent.map(v=>({...v,at:Math.round(v.at-sent[0].at)}));
 report.passed=true;
}catch(error){report.error=error instanceof Error?error.message:'Gateway integration failed';process.exitCode=1;}
finally{
 if(gateway.exitCode===null&&gateway.signalCode===null){const exited=once(gateway,'exit');gateway.kill('SIGTERM');await exited.catch(()=>{});}
 upstream.closeAllConnections();await new Promise<void>(r=>upstream.close(()=>r()));
 await mkdir('artifacts/gateway-priority',{recursive:true});await writeFile('artifacts/gateway-priority/report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,childError:stderr.slice(0,200)}));
}
