// Private opt-in series runner. Never touches the existing one-match trial.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {seriesAgentArenaAbi as abi} from '../shared/abi-SeriesAgentArena';
import {agentSeriesPoolAbi as poolAbi} from '../shared/abi-AgentSeriesPool';
import {readHubDelegation} from '../shared/rooms-hub';
import {measuredFetch} from '../shared/rpc-metrics';
import {ChaosBeaconPump} from '../shared/chaos-beacon-pump';
import {engineCooldownMs,engineTransport} from '../shared/engine-transport';
import {createPoolEngine,initializePoolOperations} from '../relayer/src/agents/pool-engine';
import {provisionPoolArena,observePoolArenaReady} from '../relayer/src/agents/pool-hosted';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {initializePoolObservations,PoolObservations} from '../relayer/src/agents/pool-observations';
assert.equal(process.env.PONG_AGENT_SERIES_ENGINES,'private-qualification');assert.equal(process.getuid?.(),1000);
const prefix=process.env.PONG_AGENT_SERIES_PREFIX!;assert(/^agent-series-candidate-\d{8}(-[2-9])?$/.test(prefix));
const r=JSON.parse(await readFile(`/secrets/${prefix}.json`,'utf8'));assert.equal(r.phase,'deployed-closed');
const protectedApps=(process.env.PONG_HUMAN_APPS??'').toLowerCase().split(',').filter(Boolean);assert(protectedApps.length>0);
for(const a of r.arenas)assert(!protectedApps.includes(a.app.toLowerCase()));
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:8000,fetchFn:measuredFetch('monad')})});
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:6}),metrics=await agentMetrics('/diagnostics/series','controllers');
await initializePoolOperations(db);await initializePoolObservations(db);let stopping=false;
process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
const delay=(n:number)=>new Promise(resolve=>setTimeout(resolve,n));
async function arenaLoop(app:Address){
 let engine:ReturnType<typeof createPoolEngine>|undefined,binding:any,delegation:any,url='',nextBase=0,lastTick=0,stage='',healthAt=0;
 let proofTask:Promise<void>|undefined,observation:PoolObservations|undefined;
 const beacon=new ChaosBeaconPump();
 const flush=async()=>{try{await observation?.flush();}catch{console.error(JSON.stringify({app,event:'observation-incomplete'}));}observation=undefined;};
 const health=async(value:string,detail:Record<string,unknown>={})=>{
  if(stage===value&&Date.now()-healthAt<10000)return;healthAt=Date.now();
  if(stage!==value)console.log(JSON.stringify({at:new Date().toISOString(),app,stage:value,...detail}));stage=value;
  await db.query('INSERT INTO agent_pool.health(app,stage,detail) VALUES($1,$2,$3) ON CONFLICT(app) DO UPDATE SET stage=$2,detail=$3,updated_at=now()',
   [app.toLowerCase(),value,detail]);
 };
 try{while(!stopping){let pause=100;
  try{
   if(Date.now()>=nextBase){
    const block=await base.getBlock();delegation=await readHubDelegation(base,r.common.hub,app,block.number);nextBase=Date.now()+5000;
    if(delegation.status!==1||delegation.expiresAt<=block.timestamp){
     engine?.close();engine=undefined;await proofTask;await flush();binding=undefined;
     await health(delegation.status===2?'challenge-window':delegation.status===0?'awaiting-admission':'recovering',
      {epoch:String(delegation.epoch),releaseAt:String(delegation.stakeUnlockAt),batches:String(delegation.batchIndex)});
     await delay(3000);continue;
    }
    if(engine&&engine.ref.epoch!==delegation.epoch){engine.close();engine=undefined;await proofTask;await flush();}
   }
   if(delegation.status!==1){await delay(1000);continue;}
   if(!engine){
    await health('provisioning',{epoch:String(delegation.epoch)});url=await provisionPoolArena(db,app,delegation.epoch,url||undefined);
    const node=createPublicClient({transport:engineTransport(url),pollingInterval:1000});
    try{
     const session:any=await node.request({method:'interlude_session',params:[]} as any);
     assert.equal(String(session.app).toLowerCase(),app.toLowerCase());assert.equal(BigInt(session.epoch),delegation.epoch);assert.equal(session.chainId,4242);
     assert.equal(await node.readContract({address:app,abi,functionName:'RULES_VERSION'}),11n);
     binding=await node.readContract({address:app,abi,functionName:'boundMatch'});assert.equal(binding.epoch,delegation.epoch);assert(binding.id>0n);
     await observePoolArenaReady(db,app,delegation.epoch,true);
     const observations=new PoolObservations(db,app,{epoch:binding.epoch,id:binding.id});observation=observations;
     engine=createPoolEngine(db,base,r.common.hub,app,url,r.engineKey,{epoch:binding.epoch,id:binding.id},s=>observations.observe(s),{node,series:true});
    }catch(error){await observePoolArenaReady(db,app,delegation.epoch,false);throw error;}
   }
   let s=await engine.read();
   if(s.phase===1){s=await engine.send('start','start');lastTick=Date.now();}
   if(s.phase===2){
    await health('playing',{epoch:String(binding.epoch),id:String(binding.id),node:url,mode:s.state.mode,time:String(s.state.t),score:[s.state.scoreA,s.state.scoreB]});
    if(s.chaos&&!proofTask){
     const actor=engine,id=actor.ref.id,epoch=actor.ref.epoch;
     const state=(v:typeof s)=>({playing:v.phase===2,request:v.chaos?.request??0n,pending:v.chaos?.pending??0n});
     proofTask=beacon.offer(`${app}:${epoch}:${id}`,state(s),async()=>state(await actor.read()),async(request,proof)=>{
      const current=await actor.read();await actor.send(`proof:${request}:${current.revision}`,'submitRandomness',[id,request,proof]);lastTick=Date.now();
     }).catch(()=>console.log(JSON.stringify({at:new Date().toISOString(),app,id:String(id),event:'randomness-retry'}))).finally(()=>{proofTask=undefined;});
    }
    if(!engine.busy()&&Date.now()-lastTick>=300){await engine.send(`tick:${s.revision}:${s.head}:${Math.floor(Date.now()/300)}`,'tick',[binding.id]);lastTick=Date.now();}
   }else if(s.phase>=3){
    await health('awaiting-publication',{epoch:String(binding.epoch),id:String(binding.id),phase:s.phase,score:[s.state.scoreA,s.state.scoreB]});pause=1500;
    if(!proofTask&&!engine.busy()){
     const entry=await base.readContract({address:r.common.pool,abi:poolAbi,functionName:'record',args:[binding.id]});
     if(entry.captured){
      const current=await engine.node.readContract({address:app,abi,functionName:'boundMatch'});
      if(current.id!==binding.id){engine.close();engine=undefined;await flush();lastTick=0;continue;}
      if(await engine.node.readContract({address:app,abi,functionName:'canAdvance'})){
       await engine.send('advance','advanceSeries',[binding.id]);engine.close();engine=undefined;await flush();lastTick=0;
      }else{
       const next=await engine.node.readContract({address:app,abi,functionName:'nextUnstarted'});
       if(next||!await engine.node.readContract({address:app,abi,functionName:'seriesDrained'}))await engine.send(`drain:${next}`,'drainSeries',[binding.id]);
       else await health('awaiting-close',{epoch:String(binding.epoch),id:String(binding.id)});
      }
     }
    }
   }
  }catch(error){
   const e=error as {shortMessage?:string;message?:string;code?:string;retryAt?:number};
   await health('synchronizing',{epoch:String(binding?.epoch??0),id:String(binding?.id??0),code:e.code,
    error:(e.shortMessage??e.message??'Arena unavailable').split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220)});
   pause=Math.max(1000,engineCooldownMs(url),Number.isFinite(e.retryAt)?e.retryAt!-Date.now():0);
  }
  if(!stopping)await delay(Math.min(pause,30000));
 }}finally{engine?.close();await proofTask;await flush();}
}
try{await Promise.all(r.arenas.map((a:{app:Address})=>arenaLoop(a.app)));}finally{await metrics();await db.end();}
