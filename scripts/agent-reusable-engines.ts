// One engine writer per reusable arena. Admissions originate only from Monad;
// a terminal result is archived before another logical match can reuse its slot.
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {createPublicClient,http,keccak256,zeroHash,type Address,type PublicClient} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {reusableAgentArenaAbi as abi} from '../shared/abi-ReusableAgentArena';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {readHubDelegation} from '../shared/rooms-hub';
import {engineTransport,engineCooldownMs} from '../shared/engine-transport';
import {measuredFetch} from '../shared/rpc-metrics';
import {pinnedEngineCodeHash} from '../shared/engine-base-code';
import {reusableAdmissionDigest,type ReusableTicket} from '../shared/reusable-admission';
import {validateReusableAgentAdmission,validateReusableAgentCancellation,type ReusableAgentBinding} from '../shared/reusable-agent-admission';
import {reusableSlotResult} from '../shared/reusable-results';
import {ChaosBeaconPump} from '../shared/chaos-beacon-pump';
import {loadReusableRuntime} from '../relayer/src/agents/reusable-runtime';
import {createPoolEngine,initializePoolOperations} from '../relayer/src/agents/pool-engine';
import {provisionPoolArena,observePoolArenaReady} from '../relayer/src/agents/pool-hosted';
import {PoolProofLane} from '../relayer/src/agents/pool-proof-lane';
import {PoolObservations,initializePoolObservations} from '../relayer/src/agents/pool-observations';
import {PoolReplays,initializePoolReplays,poolReplayRetention} from '../relayer/src/agents/pool-replays';
import {AgentPoolReader} from '../relayer/src/agents/pool-read';
import {initializeReusableResultArchive,createReusableResultArchive} from '../relayer/src/reusable-result-archive';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {BackgroundObservation} from '../shared/background-observation';

const {record:r,protectedApps}=await loadReusableRuntime('engines'),m=r.common;
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000,fetchFn:measuredFetch('monad')})});
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:8}),metrics=await agentMetrics('/diagnostics/reusable','controllers');
await initializePoolOperations(db);await initializePoolObservations(db);await initializePoolReplays(db);await initializeReusableResultArchive(db);
const archive=createReusableResultArchive(db),bridge=privateKeyToAccount(r.admissionKey);
assert.equal((await base.readContract({address:m.pool,abi:poolAbi,functionName:'admissionSigner'})).toLowerCase(),bridge.address.toLowerCase());
assert.equal((await base.readContract({address:m.pool,abi:poolAbi,functionName:'verifier'})).toLowerCase(),m.verifier.toLowerCase());
const replays=new PoolReplays(db,process.env.GRAPHQL_URL?poolReplayRetention(process.env.GRAPHQL_URL,
 process.env.HASURA_ADMIN_SECRET?{'x-hasura-admin-secret':process.env.HASURA_ADMIN_SECRET}:{}):undefined);
await replays.resumeRecorder();
const replayReader=new AgentPoolReader(base,{...m,version:4,chainId:10143,engineChainId:4242,rulesVersion:15,
 arenas:r.arenas.map((a:any)=>({...a,node:`https://il-${a.app.slice(2,18).toLowerCase()}.fly.dev`})),
 enabled:false,tournamentsEnabled:false,verifiedCapacity:0,qualificationEvidence:null,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2},protectedApps);
let stopping=false;process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const clean=(e:any)=>String(e?.shortMessage??e?.message??'Arena unavailable').split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220);
// One shared canonical observation for all arena loops, no per-tick lobby RPC.
const assignments=new BackgroundObservation(async()=>{
  const block=await base.getBlock({includeTransactions:false});
  const lanes=await Promise.all([0,1].map(lane=>base.readContract({address:m.pool,abi:poolAbi,functionName:'laneRecord',args:[lane],blockNumber:block.number})));
  return{block,lanes};
},2000,5000);
async function replayLoop(){while(!stopping){try{await replays.reconcile(async ref=>(await replayReader.match(ref)).value);}catch{console.error(JSON.stringify({service:'reusable-replays',error:'Reconciliation pending'}));}
 for(let n=0;n<60&&!stopping;n++)await delay(1000);}}

async function arenaLoop(app:Address,runtimeHash:string){
 let engine:ReturnType<typeof createPoolEngine>|undefined,node:PublicClient|undefined;
 let d:Awaited<ReturnType<typeof readHubDelegation>>|undefined,url='',nextHub=0,lastProgress=0,lastRevision=-1n,stage='',healthAt=0;
 let observations:PoolObservations|undefined,proofTask:Promise<void>|undefined;
 let cachedTicket:{key:string;pair:readonly [ReusableTicket,ReusableAgentBinding]}|undefined,admitted=false,nextBindingCheck=0;
 const beacon=new ChaosBeaconPump(),proofLane=new PoolProofLane();
 const close=async()=>{engine?.close();engine=undefined;await proofTask;await observations?.flush();observations=undefined;lastProgress=0;lastRevision=-1n;admitted=false;nextBindingCheck=0;};
 const health=async(next:string,detail:Record<string,unknown>={})=>{
  if(stage===next&&Date.now()-healthAt<10000)return;healthAt=Date.now();
  if(stage!==next)console.log(JSON.stringify({at:new Date().toISOString(),app,stage:next,...detail}));stage=next;
  await db.query('INSERT INTO agent_pool.health(app,stage,detail) VALUES($1,$2,$3) ON CONFLICT(app) DO UPDATE SET stage=$2,detail=$3,updated_at=now()',
   [app.toLowerCase(),next,detail]);
 };
 const archiveSlot=async(ticket:ReusableTicket)=>{
  assert(node);const before=await node.readContract({address:app,abi,functionName:'resultCommitment'});
  if(before[0]!==ticket.epoch||BigInt(before[1])!==ticket.sequence)return false;
  const result=await node.readContract({address:app,abi,functionName:'publishedResult'});
  const after=await node.readContract({address:app,abi,functionName:'resultCommitment'});
  assert.deepEqual(before,after,'Result changed while recovering its body');
  const candidate=reusableSlotResult(abi,{chainId:10143n,arena:app,epoch:ticket.epoch},15,ticket.matchId,reusableAdmissionDigest(ticket),ticket.sequence,result,before);
  await archive.storeSlot(candidate);return true;
 };
 try{while(!stopping){let pause=100;
  try{
   const common=await assignments.read(),block=common.block;
   if(Date.now()>=nextHub){
    const next=await readHubDelegation(base,m.hub,app,block.number);nextHub=Date.now()+5000;
    if(!d||next.epoch!==d.epoch){await close();node=undefined;}d=next;
    if(!node&&d.status===1){
     assert.equal(keccak256((await base.getCode({address:app,blockNumber:block.number}))!).toLowerCase(),runtimeHash.toLowerCase(),'Arena bytecode changed');
    }
   }
   assert(d);
   const entry=common.lanes.find((x:any)=>x.ref.id>0n&&x.ref.arena.toLowerCase()===app.toLowerCase());
   if(d.status===0){await close();node=undefined;await health('awaiting-delegation',{epoch:String(d.epoch)});await delay(2000);continue;}
   if(!node){
    await health('provisioning',{epoch:String(d.epoch)});url=await provisionPoolArena(db,app,d.epoch,url||undefined);
    const candidate=createPublicClient({transport:engineTransport(url),pollingInterval:1000});
    try{
     const session:any=await candidate.request({method:'interlude_session',params:[]} as any);
     assert.equal(String(session.app).toLowerCase(),app.toLowerCase());assert.equal(BigInt(session.epoch),d.epoch);assert.equal(session.chainId,4242);
     assert.equal(BigInt(session.baseBlock),d.baseBlock);assert.equal(await candidate.readContract({address:app,abi,functionName:'RULES_VERSION'}),15n);
     await observePoolArenaReady(db,app,d.epoch,true);node=candidate;
    }catch(e){await observePoolArenaReady(db,app,d.epoch,false);throw e;}
   }
   if(!entry){await close();await health(d.status===2?'challenge-window':'available',{epoch:String(d.epoch),releaseAt:String(d.stakeUnlockAt)});await delay(1000);continue;}
   assert.equal(entry.ref.epoch,d.epoch,'Previous result requires historical recovery');
   const ref={epoch:entry.ref.epoch,id:entry.ref.id};
   const ticketKey=`${ref.epoch}:${ref.id}`;
   if(cachedTicket?.key!==ticketKey)cachedTicket={key:ticketKey,pair:await base.readContract({address:m.pool,abi:poolAbi,functionName:'ticketOf',args:[entry.ref],blockNumber:block.number})};
   const [ticket,binding]=cachedTicket.pair;
   if(!engine||engine.ref.epoch!==ref.epoch||engine.ref.id!==ref.id){
    await close();observations=new PoolObservations(db,app,ref);
    const observed=observations,replayRef={chainId:10143 as const,app,epoch:String(ref.epoch),id:String(ref.id)};
    engine=createPoolEngine(db,base,m.hub,app,url,r.engineKey,ref,s=>{
     // Timestamp progress when it arrives. Detecting the same revision on the
     // next loop must not impose a second 300 ms pause after every own tick.
     if(s.revision!==lastRevision){lastRevision=s.revision;lastProgress=Date.now();}
     observed.observe(s);replays.capture(replayRef,15,s);
    },{node,reusable:true,archive:archive.store});
   }
   // Expiry forbids new commands, not the reads needed to preserve a result.
   if(d.status!==1||d.expiresAt<=block.timestamp){
    await archiveSlot(ticket);await health('recovering',{epoch:String(ref.epoch),id:String(ref.id),releaseAt:String(d.stakeUnlockAt)});await delay(2000);continue;
   }
   if(!admitted||Date.now()>=nextBindingCheck){
    const current=await node.readContract({address:app,abi,functionName:'currentAdmission'});
    admitted=current[0]===ref.epoch&&current[1]===ref.id;
    if(admitted){assert.equal(current[3],reusableAdmissionDigest(ticket),'Engine admission differs from the assigned ticket');nextBindingCheck=Date.now()+10000;}
   }
   if(!admitted){
    const [engineEpoch,count]=await node.readContract({address:app,abi,functionName:'resultCommitment'});
    const session:any=await node.request({method:'interlude_session',params:[]} as any);
    const cancel=block.timestamp>ticket.expires;
    const code=async(c:ReusableAgentBinding['controlA'],player:Address)=>cancel||c.codeHash===zeroHash?zeroHash:pinnedEngineCodeHash({
     address:c.house?r.modules.HousePolicies:player,hubBaseBlock:d!.baseBlock,engineBaseBlock:session.baseBlock,hubEpoch:d!.epoch,engineEpoch:session.epoch,getCode:args=>base.getCode(args)});
    const evidence={chainId:10143,authority:m.pool,arena:app,reservedMatch:ref.id,
     issuedDigest:await base.readContract({address:m.pool,abi:poolAbi,functionName:'issuedTicket',args:[app,ref.epoch,ticket.sequence],blockNumber:block.number}),
     sourceHash:(await base.getBlock({blockNumber:ticket.sourceBlock})).hash!,hubEpoch:d.epoch,hubStatus:d.status,hubExpires:d.expiresAt,
     engineEpoch,engineCount:count,now:block.timestamp,engineCodeHashA:await code(binding.controlA,binding.a),engineCodeHashB:await code(binding.controlB,binding.b)};
    (cancel?validateReusableAgentCancellation:validateReusableAgentAdmission)(ticket,binding,evidence);
    await engine.send(cancel?'cancel-expired':'admit',cancel?'cancelAdmission':'admit',[ticket,binding,await bridge.sign({hash:reusableAdmissionDigest(ticket)})]);
    lastProgress=Date.now();continue;
   }
   const s=await engine.read();
   if(s.revision!==lastRevision){lastRevision=s.revision;lastProgress=Date.now();}
   if(s.phase===1){
    const [mask,deadline]=await node.readContract({address:app,abi,functionName:'readiness',args:[ref.id]});
    const launch=await node.readContract({address:app,abi,functionName:'launchAt',args:[ref.id]}),now=(await node.getBlock()).timestamp;
    if(mask!==3&&now>deadline)await engine.send('cancel-unready','cancelUnready',[ref.epoch,ref.id]);
    else if(mask===3&&(!launch||now>=launch)){
     const [deadline,clock]=r.countdownClock&&launch?await node.readContract({address:app,abi,functionName:'launchClock',args:[ref.id]}):[0n,0n];
     if(clock>=deadline)await engine.send(launch?'start':'launch','start',[ref.epoch,ref.id]);
    }
    await health(mask===3?'countdown':'waiting-for-player',{epoch:String(ref.epoch),id:String(ref.id),launchAt:String(launch)});pause=500;
   }else if(s.phase===2){
    await health('playing',{epoch:String(ref.epoch),id:String(ref.id),node:url,mode:s.state.mode,time:String(s.state.t),score:[s.state.scoreA,s.state.scoreB]});
    if(s.chaos&&!proofTask){const actor=engine,id=ref.id,epoch=ref.epoch;
     const state=(v:typeof s)=>({playing:v.phase===2,request:v.chaos?.request??0n,pending:v.chaos?.pending??0n});
     proofTask=beacon.offer(`${app}:${epoch}:${id}`,state(s),async()=>state(await actor.read()),async(request,proof)=>{
      await proofLane.submit({busy:actor.busy,read:actor.read,send:(op,_action,args)=>actor.send(op,'submitRandomness',[epoch,...args])},id,request,proof);lastProgress=Date.now();
     }).catch(e=>console.error(JSON.stringify({at:new Date().toISOString(),app,event:'randomness-retry',error:clean(e)}))).finally(()=>{proofTask=undefined;});
    }
    if(!proofLane.blocksTick()&&!engine.busy()&&Date.now()-lastProgress>=300){await engine.send(`tick:${s.revision}:${s.head}:${Math.floor(Date.now()/300)}`,'tick',[ref.epoch,ref.id]);lastProgress=Date.now();}
   }else if(s.phase>=3){await archiveSlot(ticket);await health('awaiting-publication',{epoch:String(ref.epoch),id:String(ref.id),score:[s.state.scoreA,s.state.scoreB]});pause=1500;}
  }catch(e){await health('synchronizing',{epoch:String(d?.epoch??0),id:String(engine?.ref.id??0),error:clean(e)});pause=Math.max(1000,engineCooldownMs(url));}
  if(!stopping)await delay(Math.min(pause,30000));
 }}finally{await close();}
}
try{await Promise.all([...r.arenas.map((a:any)=>arenaLoop(a.app,a.runtimeHash)),replayLoop()]);}finally{await replays.flush();await metrics();await db.end();}
