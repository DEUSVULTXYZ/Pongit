// Isolated hosted qualification. Never enables public flags or touches human
// production slots. All keys and exact signed command journals remain private.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createPublicClient,encodeFunctionData,decodeFunctionData,decodeEventLog,encodeAbiParameters,decodeAbiParameters,getAbiItem,keccak256,parseTransaction,type Address,type Hex,type Abi} from 'viem';
import {generatePrivateKey,privateKeyToAccount,type PrivateKeyAccount} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {engineTransport} from '../shared/engine-transport';
import {readHubDelegation} from '../shared/rooms-hub';
import {PublishedResultIndex,publishedResultLeaf} from '../shared/published-result-tree';
import {reusableAdmissionDigest,validateReusableAdmission,type ReusableTicket,type ReusableBinding} from '../shared/reusable-admission';
import {DrandBeaconTransport} from '../shared/drand-beacon';
import {abi as arenaAbi} from '../shared/abi-independent-ReusableEventsArena';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';
import {abi as familyAbi} from '../shared/abi-independent-ArcadeFamily';
import {abi as ratingsAbi} from '../shared/abi-independent-PublishedRatings';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {rpcSamples} from '../shared/rpc-metrics';
import {retryOperatorContention} from '../shared/operator-contention';
import {receiptFrame} from '../shared/engine-stream';

assert.equal(process.env.PONG_REUSABLE_QUALIFICATION,'isolated-vps');
const manifestPath=process.env.PONG_INDEPENDENT_MANIFEST!,signerPath=process.env.PONG_ADMISSION_KEY_FILE!;
assert(manifestPath.startsWith('/secrets/')&&signerPath.startsWith('/secrets/'));
const m=JSON.parse(await readFile(manifestPath,'utf8'));assert.equal(m.production,false);assert.equal(m.rulesVersion,14);assert.equal(m.status,'sealed');
const run=process.env.PONG_REUSABLE_RUN??'initial';assert(['initial','renew2'].includes(run));
const admission=privateKeyToAccount(JSON.parse(await readFile(signerPath,'utf8')).privateKey);assert.equal(admission.address.toLowerCase(),m.admissionSigner.toLowerCase());
const operator=await chainTools(m.prefix+':reuse-live'+(run==='initial'?'':':'+run));
const t={...operator,
 write:(...args:Parameters<typeof operator.write>)=>retryOperatorContention(()=>operator.write(...args)),
 submit:(...args:Parameters<typeof operator.submit>)=>retryOperatorContention(()=>operator.submit(...args)),
};
const path='/secrets/reuse-live'+(run==='initial'?'':'-'+run)+'.json',out='artifacts/reusable-candidate/hosted'+(run==='initial'?'':'-'+run)+'.json';
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2);
let state:any;try{state=JSON.parse(await readFile(path,'utf8'));assert.equal(state.lobby,m.lobby);}catch(e){if((e as any).code!=='ENOENT')throw e;state={lobby:m.lobby,app:m.arenas[0].app,createdAt:new Date().toISOString(),players:Array.from({length:4},()=>({root:generatePrivateKey(),arcade:generatePrivateKey()})),operations:{},jobs:[],matches:[],results:[]};}
let tail=Promise.resolve();const save=()=>{const text=json(state);tail=tail.then(async()=>{await writeFile(path+'.next',text,{mode:0o600});await rename(path+'.next',path);});return tail;};
const report:any={startedAt:new Date().toISOString(),scope:'Actual hosted reusable rules14 candidate; synthetic owners; no browser/physical authenticator or final soak claim',app:state.app,lobby:m.lobby,checks:[],matches:[],passed:false};
await mkdir('artifacts/reusable-candidate',{recursive:true});
try{await readFile(out);await rename(out,out.replace('.json','-prior-'+Date.now()+'.json'));}catch(e){if((e as any).code!=='ENOENT')throw e;}
const flush=async()=>{report.rpc=rpcSamples();await writeFile(out+'.next',json(report));await rename(out+'.next',out);};
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until<T>(fn:()=>Promise<T>,label:string,ms=120000):Promise<NonNullable<T>>{const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v as NonNullable<T>;await wait(1000);}throw Error('Timed out: '+label);}
const roots=state.players.map((p:any)=>privateKeyToAccount(p.root)),keys=state.players.map((p:any)=>privateKeyToAccount(p.arcade));
const read=(address:Address,abi:Abi,functionName:string,args:readonly unknown[]=[],blockNumber?:bigint)=>t.base.readContract({address,abi,functionName,args,blockNumber} as any) as Promise<any>;
const app=state.app as Address;
let node:ReturnType<typeof createPublicClient>;
async function send(operation:string,name:string,args:readonly unknown[],signer:PrivateKeyAccount){
 const data=encodeFunctionData({abi:arenaAbi,functionName:name,args} as any);
 let job=state.jobs.find((x:any)=>x.operation===operation);
 if(job){assert.equal(parseTransaction(job.raw).data,data);assert.equal(job.signer,signer.address);}else{
  assert(!state.jobs.some((x:any)=>x.signer===signer.address&&x.state==='uncertain'),'Reconcile original signed bytes before another command');
  const nonce=await node.getTransactionCount({address:signer.address,blockTag:'latest'});
  assert.equal(nonce,await node.getTransactionCount({address:signer.address,blockTag:'pending'}));
  const raw=await signer.signTransaction({type:'eip1559',chainId:4242,to:app,nonce,data,value:0n,gas:15_000_000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
  job={operation,signer:signer.address,epoch:state.epoch,nonce,raw,hash:keccak256(raw),state:'uncertain'};state.jobs.push(job);await save();
 }
 if(job.state==='reverted')throw Error('Prior operation has a confirmed revert');
 if(job.state==='confirmed')return job.hash;
 let receipt:any=await node.getTransactionReceipt({hash:job.hash}).catch(()=>null);
 if(!receipt)receipt=await node.request({method:'interlude_sendTransaction',params:[job.raw]} as any);
 assert.equal(receipt?.transactionHash?.toLowerCase(),job.hash.toLowerCase(),'Missing/mismatched receipt');
 assert(['0x0','0x1','success','reverted'].includes(String(receipt.status)),'Uncertain receipt');
 if(['0x1','success'].includes(String(receipt.status))){
  const frame=receiptFrame(receipt,app);assert(frame,'Exact receipt logs required');
  state.verifiedRandomness??=[];
  for(const log of frame.logs){if(log.address.toLowerCase()!==app.toLowerCase())continue;let event:any;
   try{event=decodeEventLog({abi:arenaAbi,topics:[...log.topics] as any,data:log.data});}catch{continue;}
   if(event.eventName==='RandomnessVerified'&&!state.verifiedRandomness.some((r:any)=>r.hash===job.hash))
    state.verifiedRandomness.push({id:String(event.args.id),index:Number(event.args.index),hash:job.hash});
  }
 }
 job.state=['0x1','success'].includes(String(receipt.status))?'confirmed':'reverted';job.block=String(receipt.blockNumber);await save();
 assert.equal(job.state,'confirmed',`Confirmed engine revert (${name})`);return job.hash;
}
async function command(player:number,name:string,method:string,args:readonly unknown[]=[]){
 let op=state.operations[name];if(!op){
  const grant=await read(m.family,familyAbi,'grantOf',[roots[player].address]),hash=await read(m.family,familyAbi,'grantDigest',[grant]);
  assert.equal(grant.key.toLowerCase(),keys[player].address.toLowerCase());
  const data=encodeFunctionData({abi:lobbyAbi,functionName:method,args} as any),nonce=await read(m.lobby,lobbyAbi,'commandNonces',[hash]),deadline=(await t.base.getBlock()).timestamp+120n;
  const digest=await read(m.lobby,lobbyAbi,'commandDigest',[hash,data,nonce,deadline]);
  op=state.operations[name]={data:encodeFunctionData({abi:lobbyAbi,functionName:'relay',args:[roots[player].address,data,nonce,deadline,await keys[player].sign({hash:digest})]})};await save();
 }return t.submit(name,op.data,m.lobby);
}
async function provision(){
 const at=Date.now();return until(async()=>{
  try{
   const create=!state.hostRequested;if(create){state.hostRequested=new Date().toISOString();await save();}
   const response=await fetch('https://control.interludelayer.xyz/sessions'+(create?'':'/'+app),{method:create?'POST':'GET',headers:{'content-type':'application/json'},...(create?{body:JSON.stringify({app})}:{}),signal:AbortSignal.timeout(15000)});
   const body:any=await response.json().catch(()=>null);
   if(!response.ok){if(create&&body?.created===false&&response.status>=400&&response.status<500){delete state.hostRequested;await save();}if(response.status===429){const retry=response.headers.get('retry-after');const delay=retry&&Number.isFinite(Number(retry))?Number(retry)*1000:retry&&Number.isFinite(Date.parse(retry))?Date.parse(retry)-Date.now():10000;await wait(Math.max(10000,Math.min(delay,60000)));}throw Error('Hosted control HTTP '+response.status);}
   const url=new URL(body?.url);assert.equal(url.protocol,'https:');assert(!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/');
   if(body.app)assert.equal(body.app.toLowerCase(),app.toLowerCase());if(state.node)assert.equal(url.origin,state.node);
   state.node=url.origin;await save();const candidate=createPublicClient({transport:engineTransport(state.node)});
   const s:any=await candidate.request({method:'interlude_session',params:[]} as any);
   assert.equal(s.app.toLowerCase(),app.toLowerCase());assert.equal(s.chainId,4242);assert.equal(BigInt(s.epoch),BigInt(state.epoch));
   assert.equal(await candidate.readContract({address:app,abi:arenaAbi,functionName:'RULES_VERSION'}),14n);node=candidate;report.provisioningMs=Date.now()-at;return true;
  }catch(e){report.lastProvisioning=String((e as any).shortMessage||(e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,200);await flush();await wait(4000);return false;}
 },'hosted reusable identity',600000);
}
const resultParameters=getAbiItem({abi:arenaAbi,name:'publishedResult'}).outputs;
const resultIndex=new PublishedResultIndex();
for(const result of state.results)resultIndex.append(result.index,result.leaf,result.root);
async function play(mode:0|1){
 const p=mode*2;let match=state.matches[mode];
 if(match?.captured){report.matches.push(match.report);return;}
 if(!match){
  await command(p,`room-${mode}`,'createRoom',[mode]);const room=await read(m.lobby,lobbyAbi,'occupancy',[roots[p].address]);
  await command(p+1,`join-${mode}`,'joinRoom',[room]);await t.write(`propose-${mode}`,m.lobby,lobbyAbi,'propose',[room]);
  const id=(await read(m.lobby,lobbyAbi,'room',[room])).proposal;match=state.matches[mode]={mode,room:String(room),id:String(id)};await save();
 }
 const id=BigInt(match.id),epoch=BigInt(state.epoch);
 await Promise.all([command(p,`accept-${mode}-a`,'acceptProposal',[id]),command(p+1,`accept-${mode}-b`,'acceptProposal',[id])]);
 await t.write(`assign-${mode}`,m.lobby,lobbyAbi,'assignNext');assert.equal((await read(m.lobby,lobbyAbi,'arenaOf',[id])).toLowerCase(),app.toLowerCase());
 // A restart after execution must retain actual confirmed commands and proof
 // evidence, even if the final Monad capture was waiting for another writer.
 const confirmed=(prefix:string)=>state.jobs.filter((job:any)=>job.state==='confirmed'&&job.operation.startsWith(prefix)).length;
 const row:any=match.report??{id,epoch,mode,startedAt:new Date().toISOString()};
 row.inputs=confirmed(`input-${id}-`);row.proofSubmissions=confirmed(`proof-${id}-`);
 row.proofs=(state.verifiedRandomness??[]).filter((x:any)=>x.id===String(id)).length;
 if(state.jobs.some((job:any)=>job.operation===`concede-${id}`&&job.state==='confirmed'))row.conceded=true;
 match.report=row;report.matches.push(row);await save();await flush();
 const [ticket,binding]=await read(m.lobby,lobbyAbi,'ticketOf',[id]) as [ReusableTicket,ReusableBinding];
 if(!match.admitted){
  const block=await t.base.getBlock(),hub=await readHubDelegation(t.base,m.hub,app,block.number);
  const [engineEpoch,count]=await node.readContract({address:app,abi:arenaAbi,functionName:'resultCommitment'});
  validateReusableAdmission(ticket,binding,{chainId:10143,authority:m.lobby,arena:app,
   issuedDigest:await read(m.lobby,lobbyAbi,'issuedTicket',[app,epoch,ticket.sequence],block.number),sourceHash:(await t.base.getBlock({blockNumber:ticket.sourceBlock})).hash!,
   reservedMatch:await read(m.lobby,lobbyAbi,'reservedMatch',[app],block.number),hubEpoch:hub.epoch,hubStatus:hub.status,hubExpires:hub.expiresAt,engineEpoch,engineCount:count,now:block.timestamp});
  const signature=await admission.sign({hash:reusableAdmissionDigest(ticket)});
  await send(`admit-${id}`,'admit',[ticket,binding,signature],admission);match.admitted=true;await save();
 }
 await send(`ready-${id}-a`,'confirmReady',[epoch,id],keys[p]);await send(`ready-${id}-b`,'confirmReady',[epoch,id],keys[p+1]);
 let snapshot=await node.readContract({address:app,abi:arenaAbi,functionName:'getSnapshot',args:[id]});
 if(snapshot.phase===1n){
  await send(`launch-${id}`,'start',[epoch,id],admission);
  const launch=await node.readContract({address:app,abi:arenaAbi,functionName:'launchAt',args:[id]});
  await until(async()=>{const b=await node.getBlock();const ticks=m.countdownClock?await node.readContract({address:app,abi:arenaAbi,functionName:'launchClock',args:[id]}):[0n,0n];return b.timestamp>=launch&&ticks[1]>=ticks[0];},'three-second countdown');
  await send(`start-${id}`,'start',[epoch,id],admission);
 }
 const began=Date.now(),beacon=new DrandBeaconTransport();
 while(Date.now()-began<25000){
  snapshot=await node.readContract({address:app,abi:arenaAbi,functionName:'getSnapshot',args:[id]});if(snapshot.phase>=3)break;
  for(let side=0;side<2;side++){
   snapshot=await node.readContract({address:app,abi:arenaAbi,functionName:'getSnapshot',args:[id]});if(snapshot.phase>=3n)break;
   const sequence=(side?snapshot.nonceB:snapshot.nonceA)+1n,dir=row.inputs%4<2?1:-1;
   await send(`input-${id}-${side}-${sequence}`,'input',[epoch,id,dir,sequence,snapshot.head+150n],keys[p+side]);row.inputs++;
  }
  snapshot=await node.readContract({address:app,abi:arenaAbi,functionName:'getSnapshot',args:[id]});
  if(mode&&snapshot.phase===2n){
   const raw=await node.readContract({address:app,abi:arenaAbi,functionName:'chaosState',args:[id]});
   const [header,words,request,pending]=decodeAbiParameters([getAbiItem({abi:arenaAbi,name:'getSnapshot'}).outputs[0],{type:'uint256[8]'},{type:'uint256'},{type:'uint256'}],raw);
   row.effectsObserved=[...new Set([...(row.effectsObserved??[]),...words.slice(4,6).map(w=>Number(w&255n)).filter(effect=>effect>0)])].sort((a:any,b:any)=>a-b);
   const round=request&((1n<<64n)-1n);
   if(round&&!pending&&BigInt(Math.floor(Date.now()/1000))>=1727521075n+(round-1n)*3n){
    // A successful catch-up transaction may leave this draw pending. Only a
    // new confirmed revision can create a new attempt; its receipt must reveal
    // RandomnessVerified before it counts as an accepted proof.
    const proof=await beacon.read(round);await send(`proof-${id}-${request}-${header.revision}`,'submitRandomness',[epoch,id,request,proof.signature],admission);
    row.proofSubmissions=confirmed(`proof-${id}-`);row.proofs=(state.verifiedRandomness??[]).filter((x:any)=>x.id===String(id)).length;
   }
  }
  await save();await flush();await wait(200);
 }
 snapshot=await node.readContract({address:app,abi:arenaAbi,functionName:'getSnapshot',args:[id]});
 if(snapshot.phase===2n){await send(`concede-${id}`,'concede',[epoch,id],keys[p+1]);row.conceded=true;}
 const complete=await node.readContract({address:app,abi:arenaAbi,functionName:'publishedResult'});assert.equal(complete.match_.id,id);assert.equal(complete.match_.status,3);
 if(mode)assert(row.proofs>0&&row.effectsObserved?.length>0,'An actually verified drand proof and active effect are required');
 const canonical=encodeAbiParameters(resultParameters,[complete]),hash=keccak256(canonical);
 const leaf=publishedResultLeaf({chainId:10143n,arena:app,epoch},id,reusableAdmissionDigest(ticket),hash);
 const [actualEpoch,count,root]=await node.readContract({address:app,abi:arenaAbi,functionName:'resultCommitment'});assert.equal(actualEpoch,epoch);assert.equal(count,Number(ticket.sequence));
 if(!state.results.find((x:any)=>x.id===String(id))){resultIndex.append(count-1,leaf,root);state.results.push({id:String(id),index:count-1,leaf,root,canonical});await save();}
 await until(async()=>{const [e,n,r]=await read(app,arenaAbi,'resultCommitment');return e===epoch&&n===count&&r===root;},'actual result root publication',180000);
 const proof=resultIndex.proof(count-1,{count,root});await t.write(`capture-${id}`,m.lobby,lobbyAbi,'captureProof',[id,complete,proof]);
 assert((await read(m.ratings,ratingsAbi,'indexOf',[id]))>0n);assert.equal(await read(m.lobby,lobbyAbi,'reservedMatch',[app]),0n);
 row.score=[complete.match_.scoreA,complete.match_.scoreB];row.resultHash=complete.match_.hash;row.publishedRoot=root;row.publishedCount=count;row.finishedAt=new Date().toISOString();row.passed=true;
 match.captured=true;match.report=row;await save();await flush();
}
try{
 await save();
 let hub=await readHubDelegation(t.base,m.hub,app);
 if(!state.epoch){
  if(!state.opening){
   assert.equal(hub.status,0,'Candidate must start with a released unused arena');
   const validator=await read(m.hub,hubAbi,'defaultValidator'),terms=await read(m.hub,hubAbi,'termsOf',[validator]);
   state.opening={fee:String(terms.delegationFee)};await save();
  }
  await t.write('open-reusable-epoch1',m.lobby,lobbyAbi,'openReusableArena',[app],BigInt(state.opening.fee));
  hub=await readHubDelegation(t.base,m.hub,app);assert.equal(hub.status,1);state.epoch=String(hub.epoch);await save();
 }
 assert.equal(hub.epoch,BigInt(state.epoch));report.epoch=state.epoch;await provision();
 for(const pending of state.jobs.filter((j:any)=>j.state==='uncertain')){
  const tx=parseTransaction(pending.raw);assert.equal(tx.to?.toLowerCase(),app.toLowerCase());assert.equal(tx.chainId,4242);assert.equal(pending.epoch,state.epoch);
  const signer=[admission,...keys].find(s=>s.address===pending.signer);assert(signer,'Original signer required');
  const decoded=decodeFunctionData({abi:arenaAbi,data:tx.data!});
  assert(['admit','confirmReady','start','input','submitRandomness','concede'].includes(decoded.functionName));
  await send(pending.operation,decoded.functionName,decoded.args??[],signer);
 }
 // New identities are registered AFTER the engine's base snapshot, proving
 // that transport, rather than accidentally preloaded grants, admits them.
 state.issuedAt??=String((await t.base.getBlock()).timestamp);await save();
 for(let i=0;i<4;i++){
  const g={player:roots[i].address,key:keys[i].address,issuedAt:BigInt(state.issuedAt),expires:BigInt(state.issuedAt)+7200n,revision:0n};
  const signature=await roots[i].sign({hash:await read(m.family,familyAbi,'grantDigest',[g])});
  await t.write(`grant-${i}`,m.family,familyAbi,'register',[g,signature]);
 }
 await play(0);await play(1);
 hub=await readHubDelegation(t.base,m.hub,app);assert.equal(hub.status,1);assert.equal(hub.epoch,BigInt(state.epoch));assert.equal(resultIndex.count,2);
 // Re-prove the historical first result against the second published prefix.
 const first=decodeAbiParameters(resultParameters,state.results[0].canonical)[0];
 await t.write('recapture-first-after-reuse',m.lobby,lobbyAbi,'captureProof',[first.match_.id,first,resultIndex.proof(0,{count:2,root:resultIndex.root})]);
 assert(!state.jobs.some((x:any)=>x.state==='uncertain'));report.checks.push('Two real published results with new post-opening players, unchanged arena and epoch; historical proof after reuse');
 if(run==='renew2'){
  assert.equal(state.epoch,'2','Actual new hub epoch required');
  const old=JSON.parse(await readFile('/secrets/reuse-live.json','utf8')),history=new PublishedResultIndex();
  assert.equal(old.app,app);assert.equal(old.epoch,'1');
  for(const entry of old.results)history.append(entry.index,entry.leaf,entry.root);
  for(const entry of old.results){
   const [ticket]=await read(m.lobby,lobbyAbi,'ticketOf',[BigInt(entry.id)]);
   assert.equal(await read(m.resultVerifier,verifierAbi,'verify',[ticket,keccak256(entry.canonical),entry.index,history.proof(entry.index,{count:history.count,root:history.root})]),true);
  }
  report.checks.push('Both epoch1 historical results remain verifiable as final after actual epoch2 gameplay and publication');
 }
 await t.write('close-after-reusable-qualification',m.lobby,lobbyAbi,'closeReusableArena',[app]);
 hub=await readHubDelegation(t.base,m.hub,app);assert.equal(hub.status,2);report.releaseAt=String(hub.stakeUnlockAt);report.batches=String(hub.batchIndex);report.passed=true;
}catch(e){report.error=String((e as any).shortMessage||(e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,400);process.exitCode=1;}
finally{await save();report.finishedAt=new Date().toISOString();await flush();await t.close();console.log(json({passed:report.passed,error:report.error,app:report.app,releaseAt:report.releaseAt,checks:report.checks}));}
