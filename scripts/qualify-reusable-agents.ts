// Real, private same-epoch qualification. Never opens public admissions or uses
// a human arena. This is not the final 24-hour service/capacity qualification.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createPublicClient,encodeFunctionData,decodeFunctionData,decodeEventLog,encodeAbiParameters,decodeAbiParameters,getAbiItem,keccak256,parseTransaction,type Address,type Abi} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {engineTransport,engineCooldownMs} from '../shared/engine-transport';
import {readHubDelegation} from '../shared/rooms-hub';
import {pinnedEngineCodeHash} from '../shared/engine-base-code';
import {DrandBeaconTransport} from '../shared/drand-beacon';
import {PublishedResultIndex,publishedResultLeaf} from '../shared/published-result-tree';
import {reusableAdmissionDigest,type ReusableTicket} from '../shared/reusable-admission';
import {validateReusableAgentAdmission,type ReusableAgentBinding} from '../shared/reusable-agent-admission';
import {reusableAgentArenaAbi as abi} from '../shared/abi-ReusableAgentArena';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {receiptFrame} from '../shared/engine-stream';
import {reusableResults} from '../shared/reusable-results';

assert.equal(process.env.PONG_REUSABLE_AGENT_QUALIFICATION,'isolated-vps');
assert.equal(process.getuid?.(),1000);
const m=JSON.parse(await readFile('/secrets/deployment.json','utf8')),common=m.common;
assert.equal(m.rulesVersion,15);assert.equal(m.phase,'deployed-closed');
const protectedApps=(process.env.PONG_HUMAN_APPS??'').toLowerCase().split(',').filter(Boolean);assert(protectedApps.length);
const app=m.arenas[0].app as Address;assert(!protectedApps.includes(app.toLowerCase()));
const bridge=privateKeyToAccount(m.admissionKey),signer=privateKeyToAccount(m.engineKey);
const run=process.env.PONG_AGENT_QUALIFICATION_RUN??'';assert(/^(?:|[a-z0-9-]{1,30})$/.test(run));
const suffix=run?'-'+run:'';
const metrics=await agentMetrics('/diagnostics/reusable','qualification');
const tools=await chainTools(m.prefix+':reuse-live'+suffix,measuredFetch('monad'));
const write=(...args:Parameters<typeof tools.write>)=>retryOperatorContention(()=>tools.write(...args));
const read=(address:Address,abi:Abi,functionName:string,args:readonly unknown[]=[],blockNumber?:bigint)=>tools.base.readContract({address,abi,functionName,args,blockNumber} as any) as Promise<any>;
const stringify=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2);
const file='/secrets/qualification'+suffix+'.json',out='artifacts/reusable-candidate/agents-hosted'+suffix+'.json';
let state:any;try{state=JSON.parse(await readFile(file,'utf8'));assert.equal(state.app,app);assert.equal(state.pool,common.pool);}
catch(e){if((e as any).code!=='ENOENT')throw e;state={app,pool:common.pool,jobs:[],matches:[],results:[],createdAt:new Date().toISOString()};}
let saveTail=Promise.resolve();const save=()=>{const text=stringify(state);saveTail=saveTail.then(async()=>{await writeFile(file+'.next',text,{mode:0o600});await rename(file+'.next',file);});return saveTail;};
await mkdir('artifacts/reusable-candidate',{recursive:true});
try{await rename(out,out.replace('.json','-prior-'+Date.now()+'.json'));}catch(e){if((e as any).code!=='ENOENT')throw e;}
const report:any={startedAt:new Date().toISOString(),app,pool:common.pool,passed:false,scope:'Private actual natural agent matches and same-epoch reuse, not public release or 24h capacity proof',matches:[]};
const flush=async()=>{await writeFile(out+'.next',stringify(report));await rename(out+'.next',out);};
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(fn:()=>Promise<boolean>,label:string,budget=120000){const end=Date.now()+budget;while(Date.now()<end){if(await fn())return;await delay(1000);}throw Error('Timed out: '+label);}
let node:ReturnType<typeof createPublicClient>;
async function provision(){
 await until(async()=>{try{
  const create=!state.hostRequested;if(create){state.hostRequested=new Date().toISOString();await save();}
  const response=await fetch('https://control.interludelayer.xyz/sessions'+(create?'':'/'+app),{method:create?'POST':'GET',headers:{'content-type':'application/json'},...(create?{body:JSON.stringify({app})}:{}),signal:AbortSignal.timeout(15000)});
  const body:any=await response.json().catch(()=>null);
  if(!response.ok){
   if(create&&body?.created===false&&response.status>=400&&response.status<500){delete state.hostRequested;await save();}
   if(response.status===429){const h=response.headers.get('retry-after'),ms=h&&Number.isFinite(Number(h))?Number(h)*1000:h?Date.parse(h)-Date.now():10000;await delay(Math.max(10000,Math.min(Number.isFinite(ms)?ms:10000,60000)));}
   throw Error('Hosted control HTTP '+response.status);
  }
  const url=new URL(body.url);assert(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/');
  if(body.app)assert.equal(body.app.toLowerCase(),app.toLowerCase());if(state.node)assert.equal(state.node,url.origin);
  state.node=url.origin;await save();node=createPublicClient({transport:engineTransport(state.node)});
  const s:any=await node.request({method:'interlude_session',params:[]} as any);
  assert.equal(s.app.toLowerCase(),app.toLowerCase());assert.equal(BigInt(s.epoch),BigInt(state.epoch));assert.equal(s.chainId,4242);
  assert.equal(await node.readContract({address:app,abi,functionName:'RULES_VERSION'}),15n);return true;
 }catch(e){report.lastProvisioning=clean(e);await flush();await delay(4000);return false;}},'hosted agent identity',600000);
}
function clean(e:any){return String(e?.shortMessage||e?.message||'Unavailable').split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,220);}
async function send(operation:string,method:string,args:readonly unknown[]){
 const data=encodeFunctionData({abi,functionName:method,args} as any);let job=state.jobs.find((j:any)=>j.operation===operation);
 if(job){assert.equal(parseTransaction(job.raw).data,data);assert.equal(job.epoch,state.epoch);}
 else{
  assert(!state.jobs.some((j:any)=>j.state==='uncertain'),'Reconcile original signed bytes first');
  const nonce=await node.getTransactionCount({address:signer.address,blockTag:'latest'});assert.equal(nonce,await node.getTransactionCount({address:signer.address,blockTag:'pending'}));
  const raw=await signer.signTransaction({type:'eip1559',chainId:4242,to:app,nonce,data,value:0n,gas:14_800_000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
  job={operation,epoch:state.epoch,nonce,raw,hash:keccak256(raw),state:'uncertain'};state.jobs.push(job);await save();
 }
 if(job.state==='confirmed')return;assert.notEqual(job.state,'reverted','Prior confirmed revert requires review');
 const untilAt=Date.now()+90000;
 for(;;){
  try{
   let receipt:any=await node.getTransactionReceipt({hash:job.hash}).catch(()=>null);
   if(!receipt)receipt=await node.request({method:'interlude_sendTransaction',params:[job.raw]} as any);
   assert.equal(receipt?.transactionHash?.toLowerCase(),job.hash.toLowerCase(),'Missing exact receipt');
   assert(['0x0','0x1','success','reverted'].includes(String(receipt.status)),'Unknown receipt');
   const confirmed=['0x1','success'].includes(String(receipt.status));
   if(confirmed){
    const frame=receiptFrame(receipt,app);assert(frame,'Exact receipt logs required');
    const results=reusableResults(abi,app,15,frame);
    state.receipted??=[];
    for(const result of results)if(!state.receipted.some((r:any)=>r.transactionHash===result.transactionHash&&r.leaf===result.leaf))state.receipted.push(result);
    state.verifiedRandomness??=[];
    for(const log of frame.logs){if(log.address.toLowerCase()!==app.toLowerCase())continue;let event:any;
     try{event=decodeEventLog({abi,topics:[...log.topics] as any,data:log.data});}catch{continue;}
     if(event.eventName==='RandomnessVerified'&&!state.verifiedRandomness.some((r:any)=>r.hash===job.hash))
      state.verifiedRandomness.push({id:String(event.args.id),index:Number(event.args.index),hash:job.hash});
    }
   }
   job.state=confirmed?'confirmed':'reverted';await save();
   assert.equal(job.state,'confirmed','Confirmed engine revert');return;
  }catch(e){
   if(job.state==='reverted'||Date.now()>=untilAt)throw e;
   report.lastRetry={at:new Date().toISOString(),operation,error:clean(e)};await flush();
   await delay(Math.min(30000,Math.max(1000,engineCooldownMs(state.node))));
  }
 }
}
const parameters=getAbiItem({abi,name:'publishedResult'}).outputs,index=new PublishedResultIndex();
for(const r of state.results)index.append(r.index,r.leaf,r.root);
async function expiredAdmission(){
 if(state.expiryTest?.captured){report.expiredAdmission=state.expiryTest.report;return;}
 if(!state.expiryTest){
  await write('expiry-qualification',common.pool,poolAbi,'admitQualification');
  const entry=await read(common.pool,poolAbi,'laneRecord',[1]);
  assert.equal(entry.ref.arena.toLowerCase(),app.toLowerCase());assert.equal(entry.ref.epoch,BigInt(state.epoch));
  state.expiryTest={id:String(entry.ref.id),startedAt:new Date().toISOString()};await save();
 }
 const id=BigInt(state.expiryTest.id),epoch=BigInt(state.epoch),ref={chainId:10143n,arena:app,epoch,id};
 const [ticket,binding]=await read(common.pool,poolAbi,'ticketOf',[ref]) as [ReusableTicket,ReusableAgentBinding];
 const before=await Promise.all([binding.a,binding.b].map(a=>read(common.catalog,catalogAbi,'identity',[a])));
 await until(async()=>(await node.getBlock()).timestamp>ticket.expires,'actual admission expiry',150000);
 await send('cancel-expired-'+id,'cancelAdmission',[ticket,binding,await bridge.sign({hash:reusableAdmissionDigest(ticket)})]);
 const result=await node.readContract({address:app,abi,functionName:'publishedResult'});
 assert.equal(result.match_.ref.id,id);assert.equal(result.match_.status,4);assert.equal(result.match_.scoreA+result.match_.scoreB,0);
 const canonical=encodeAbiParameters(parameters,[result]);
 const leaf=publishedResultLeaf({chainId:10143n,arena:app,epoch},id,reusableAdmissionDigest(ticket),keccak256(canonical));
 const [actualEpoch,count,root]=await node.readContract({address:app,abi,functionName:'resultCommitment'});assert.equal(actualEpoch,epoch);
 if(!state.results.some((r:any)=>r.id===String(id))){index.append(count-1,leaf,root);state.results.push({id:String(id),index:count-1,leaf,root,canonical});await save();}
 await until(async()=>{const [e,n,r]=await read(app,abi,'resultCommitment');return e===epoch&&n===count&&r===root;},'published cancellation',180000);
 await write('capture-expired-'+id,common.pool,poolAbi,'captureProof',[ref,result,index.proof(count-1,{count,root})]);
 assert((await read(common.pool,poolAbi,'record',[ref])).captured);
 assert.equal((await readHubDelegation(tools.base,common.hub,app)).status,1,'Cancellation must not close the arena');
 for(let i=0;i<2;i++){
  const owner=[binding.a,binding.b][i];assert.equal(await read(common.pool,poolAbi,'playing',[owner]),'0x'+'00'.repeat(32));
  assert.equal((await read(common.catalog,catalogAbi,'identity',[owner])).qualified,before[i].qualified,'Cancellation cannot qualify a bot');
 }
 state.expiryTest.captured=true;state.expiryTest.report={passed:true,id:String(id),epoch:String(epoch),publishedCount:count,root,
  startedAt:state.expiryTest.startedAt,finishedAt:new Date().toISOString()};report.expiredAdmission=state.expiryTest.report;await save();await flush();
}
async function play(serial:number){
 let match=state.matches[serial];
 if(match?.captured){report.matches.push(match.report);return;}
 if(!match){
  await write(`qualify-${serial}`,common.pool,poolAbi,'admitQualification');
  const key=await read(common.pool,poolAbi,'laneMatch',[1n]);assert(BigInt(key)>0n,'Qualification must select a compatible pair');
  const id=await read(common.pool,poolAbi,'nonce');
  const ref={chainId:10143n,arena:app,epoch:BigInt(state.epoch),id};
  const entry=await read(common.pool,poolAbi,'record',[ref]);assert.equal(entry.ref.id,id);assert.equal(entry.lane,1);
  match=state.matches[serial]={ref:{...ref,chainId:String(ref.chainId),epoch:String(ref.epoch),id:String(id)},key};await save();
 }
 const ref={...match.ref,chainId:10143n,epoch:BigInt(match.ref.epoch),id:BigInt(match.ref.id)},id=ref.id,epoch=ref.epoch;
 const row=match.report??{id:String(id),epoch:String(epoch),startedAt:new Date().toISOString(),proofs:0,ticks:0};match.report=row;report.matches.push(row);
 row.ticks=state.jobs.filter((j:any)=>j.state==='confirmed'&&j.operation.startsWith(`tick-${id}-`)).length;
 row.proofSubmissions=state.jobs.filter((j:any)=>j.state==='confirmed'&&j.operation.startsWith(`proof-${id}-`)).length;
 row.proofs=(state.verifiedRandomness??[]).filter((p:any)=>p.id===String(id)).length;
 if(state.jobs.some((j:any)=>j.operation===`admit-${id}`&&j.state==='confirmed'))match.admitted=true;
 const [ticket,binding]=await read(common.pool,poolAbi,'ticketOf',[ref]) as [ReusableTicket,ReusableAgentBinding];row.mode=binding.mode;
 if(!match.admitted){
  const block=await tools.base.getBlock(),hub=await readHubDelegation(tools.base,common.hub,app,block.number);
  const [engineEpoch,count]=await node.readContract({address:app,abi,functionName:'resultCommitment'});
  const session:any=await node.request({method:'interlude_session',params:[]} as any);
  const code=async(c:typeof binding.controlA,player:Address)=>c.codeHash==='0x'+'00'.repeat(32)?c.codeHash:pinnedEngineCodeHash({
   address:c.house?m.modules.HousePolicies:player,hubBaseBlock:hub.baseBlock,engineBaseBlock:session.baseBlock,hubEpoch:hub.epoch,engineEpoch:session.epoch,
   getCode:args=>tools.base.getCode(args)});
  assert.equal(await read(common.pool,poolAbi,'arenaMatch',[app],block.number),match.key);
  validateReusableAgentAdmission(ticket,binding,{chainId:10143,authority:common.pool,arena:app,reservedMatch:id,
   issuedDigest:await read(common.pool,poolAbi,'issuedTicket',[app,epoch,ticket.sequence],block.number),sourceHash:(await tools.base.getBlock({blockNumber:ticket.sourceBlock})).hash!,
   hubEpoch:hub.epoch,hubStatus:hub.status,hubExpires:hub.expiresAt,engineEpoch,engineCount:count,now:block.timestamp,
   engineCodeHashA:await code(binding.controlA,binding.a),engineCodeHashB:await code(binding.controlB,binding.b)});
  await send(`admit-${id}`,'admit',[ticket,binding,await bridge.sign({hash:reusableAdmissionDigest(ticket)})]);match.admitted=true;await save();
 }
 let s=await node.readContract({address:app,abi,functionName:'getSnapshot',args:[id]});
 if(s.phase===1n){
  await send(`launch-${id}`,'start',[epoch,id]);const launch=await node.readContract({address:app,abi,functionName:'launchAt',args:[id]});
  await until(async()=>(await node.getBlock()).timestamp>=launch,'contract countdown');await send(`start-${id}`,'start',[epoch,id]);
 }
 const beacon=new DrandBeaconTransport(),deadline=Date.now()+12*60_000;
 for(;;){
  s=await node.readContract({address:app,abi,functionName:'getSnapshot',args:[id]});if(s.phase>=3n)break;
  assert(Date.now()<deadline,'Actual natural match exceeded qualification budget');
  if(binding.mode===1){
   const raw=await node.readContract({address:app,abi,functionName:'chaosState',args:[id]});
   const [,words,request,pending]=decodeAbiParameters([getAbiItem({abi,name:'getSnapshot'}).outputs[0],{type:'uint256[8]'},{type:'uint256'},{type:'uint256'}],raw);
   row.effectsObserved=[...new Set([...(row.effectsObserved??[]),...words.slice(4,6).map(w=>Number(w&255n)).filter(id=>id>0)])].sort((a:any,b:any)=>a-b);
   const round=request&((1n<<64n)-1n);
   if(round&&!pending&&BigInt(Math.floor(Date.now()/1000))>=1727521075n+(round-1n)*3n){
    // A proof call can only advance bounded physics and leave the same draw
    // pending. The next confirmed revision is a NEW intention; replaying the
    // old operation would only return its prior receipt without applying it.
    const proof=await beacon.read(round);await send(`proof-${id}-${request}-${s.revision}`,'submitRandomness',[epoch,id,request,proof.signature]);
    row.proofSubmissions=state.jobs.filter((j:any)=>j.state==='confirmed'&&j.operation.startsWith(`proof-${id}-`)).length;
    row.proofs=(state.verifiedRandomness??[]).filter((p:any)=>p.id===String(id)).length;
    s=await node.readContract({address:app,abi,functionName:'getSnapshot',args:[id]});if(s.phase>=3n)break;
   }
  }
  await send(`tick-${id}-${s.revision}-${s.head}`,'tick',[epoch,id]);row.ticks++;await save();
  if(row.ticks%20===0)await flush();await delay(300);
 }
 const result=await node.readContract({address:app,abi,functionName:'publishedResult'});assert.equal(result.match_.ref.id,id);assert.equal(result.match_.status,3);
 assert(result.match_.scoreA===7||result.match_.scoreB===7||result.match_.elapsedUs===300_000_000n,'Natural point/time limit required');
 const canonical=encodeAbiParameters(parameters,[result]);
 const leaf=publishedResultLeaf({chainId:10143n,arena:app,epoch},id,reusableAdmissionDigest(ticket),keccak256(canonical));
 const [actualEpoch,count,root]=await node.readContract({address:app,abi,functionName:'resultCommitment'});assert.equal(actualEpoch,epoch);assert.equal(count,Number(ticket.sequence));
 if(!state.results.find((r:any)=>r.id===String(id))){index.append(count-1,leaf,root);state.results.push({id:String(id),index:count-1,leaf,root,canonical});await save();}
 await until(async()=>{const [e,n,r]=await read(app,abi,'resultCommitment');return e===epoch&&n===count&&r===root;},'published agent root',180000);
 await write(`capture-${id}`,common.pool,poolAbi,'captureProof',[ref,result,index.proof(count-1,{count,root})]);
 assert((await read(common.pool,poolAbi,'record',[ref])).captured);
 assert.equal(await read(common.pool,poolAbi,'playing',[binding.a]),'0x'+'00'.repeat(32));
 row.score=[result.match_.scoreA,result.match_.scoreB];row.elapsedUs=String(result.match_.elapsedUs);row.resultHash=result.match_.hash;
 row.publishedCount=count;row.publishedRoot=root;row.finishedAt=new Date().toISOString();row.passed=binding.mode!==1||row.proofs>0&&row.effectsObserved?.length>0;
 match.captured=true;await save();await flush();
 assert(row.passed,'Chaos needs an actually verified proof and active effect, not just successful proof calls');
}
try{
 await save();assert.equal(await read(common.pool,poolAbi,'publicAdmissions'),false);
 if(!state.epoch){
  const hub=await readHubDelegation(tools.base,common.hub,app);
  if(!state.opening){assert.equal(hub.status,0);const validator=await read(common.hub,hubAbi,'defaultValidator'),terms=await read(common.hub,hubAbi,'termsOf',[validator]);state.opening={fee:String(terms.delegationFee),epoch:String(hub.epoch+1n)};await save();}
  const intended=state.opening.epoch??'1';
  await write('open-epoch'+intended,common.pool,poolAbi,'openReusableArena',[app],BigInt(state.opening.fee));
  const opened=await readHubDelegation(tools.base,common.hub,app);assert.equal(opened.status,1);assert.equal(String(opened.epoch),intended);state.epoch=String(opened.epoch);await save();
 }
 await provision();
 // A restart resumes exact journaled bytes before deriving a new tick/proof.
 // Missing receipt never authorizes a replacement at the same nonce.
 for(const pending of state.jobs.filter((j:any)=>j.state==='uncertain')){
  const tx=parseTransaction(pending.raw);assert.equal(tx.to?.toLowerCase(),app.toLowerCase());assert.equal(tx.chainId,4242);
  const decoded=decodeFunctionData({abi,data:tx.data!});
  assert(['admit','cancelAdmission','start','tick','submitRandomness'].includes(decoded.functionName));
  await send(pending.operation,decoded.functionName,decoded.args??[]);
 }
 await write('private-admissions',common.pool,poolAbi,'setAdmissions',[true]);
 if(process.env.PONG_AGENT_TEST_EXPIRED_ADMISSION==='1')await expiredAdmission();
 for(let serial=0;serial<16;serial++){
  const identities=await Promise.all(m.bots.map((b:any)=>read(common.catalog,catalogAbi,'identity',[b.agent])));
  if(identities.every((i:any)=>i.qualified===3))break;
  await play(serial);
 }
 const qualified=await Promise.all(m.bots.map(async(b:any)=>({agent:b.agent,name:b.name,modes:(await read(common.catalog,catalogAbi,'identity',[b.agent])).qualified})));
 report.qualified=qualified;assert(qualified.every(x=>x.modes===3),'All eight bots must qualify in both modes');
 assert(state.results.length>=2,'Actual same-epoch reuse required');
 const first=decodeAbiParameters(parameters,state.results[0].canonical)[0];
 await write('recapture-first-after-reuse',common.pool,poolAbi,'captureProof',[first.match_.ref,first,index.proof(0,{count:index.count,root:index.root})]);
 assert(!state.jobs.some((j:any)=>j.state==='uncertain'));await write('close-after-qualification',common.pool,poolAbi,'closeReusableArena',[app]);
 const hub=await readHubDelegation(tools.base,common.hub,app);assert.equal(hub.status,2);report.releaseAt=String(hub.stakeUnlockAt);report.batches=String(hub.batchIndex);report.passed=true;
}catch(e){report.error=clean(e);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await flush();await metrics();await tools.close();console.log(stringify({passed:report.passed,error:report.error,matches:report.matches.length,app}));}
