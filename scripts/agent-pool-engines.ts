// Private candidate runner. Each arena has its own loop, transport and nonce.
// No operator key or Monad writer is loaded in this process.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {pooledAgentArenaAbi as abi} from '../shared/abi-PooledAgentArena';
import {readHubDelegation} from '../shared/rooms-hub';
import {measuredFetch} from '../shared/rpc-metrics';
import {ChaosBeaconPump} from '../shared/chaos-beacon-pump';
import {engineCooldownMs} from '../shared/engine-transport';
import {createPoolEngine,initializePoolOperations} from '../relayer/src/agents/pool-engine';
import {provisionPoolArena,observePoolArenaReady} from '../relayer/src/agents/pool-hosted';
import {agentMetrics} from '../relayer/src/agents/metrics';

assert.equal(process.env.PONG_AGENT_POOL_ENGINES,'private-qualification');
assert.equal(process.getuid?.(),1000,'Run private pool services as uid 1000 to preserve metric ownership');
const prefix=process.env.PONG_AGENT_POOL_PREFIX!;assert(/^agent-pool-candidate-\d{8}(-[2-9])?$/.test(prefix));
const r=JSON.parse(await readFile(`/secrets/${prefix}.json`,'utf8'));assert.equal(r.phase,'deployed-closed');
const human=(process.env.PONG_HUMAN_APPS??'').toLowerCase().split(',').filter(Boolean);assert(human.length>0);
for(const a of r.arenas)assert(!human.includes(a.app.toLowerCase()));
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:8000,fetchFn:measuredFetch('monad')})});
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:6}),metrics=await agentMetrics('/diagnostics/pool','controllers');
await initializePoolOperations(db);let stopping=false;process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
const delay=(n:number)=>new Promise(resolve=>setTimeout(resolve,n));
async function arenaLoop(app:Address){
 let engine:ReturnType<typeof createPoolEngine>|undefined,nextBase=0,binding:any,delegation:any,stage='',url='',lastTick=0,healthAt=0;
 let proofTask:Promise<void>|undefined;
 const beacon=new ChaosBeaconPump();
 const health=async(value:string,detail:Record<string,unknown>={})=>{
  if(stage===value&&Date.now()-healthAt<10000)return;healthAt=Date.now();
  if(stage!==value)console.log(JSON.stringify({at:new Date().toISOString(),app,stage:value,...detail}));stage=value;
  await db.query('INSERT INTO agent_pool.health(app,stage,detail) VALUES($1,$2,$3) ON CONFLICT(app) DO UPDATE SET stage=$2,detail=$3,updated_at=now()',
   [app.toLowerCase(),stage,detail]);
 };
 try{while(!stopping){let pause=100;
  try{
   if(Date.now()>=nextBase){
    const block=await base.getBlock();const next=await base.readContract({address:app,abi,functionName:'boundMatch',blockNumber:block.number});
    delegation=await readHubDelegation(base,r.common.hub,app,block.number);
    if(binding?.id!==next.id||binding?.epoch!==next.epoch){engine?.close();engine=undefined;binding=next;lastTick=0;}
    nextBase=Date.now()+5000;
    if(delegation.status!==1||delegation.epoch!==binding.epoch||delegation.expiresAt<=block.timestamp){
     engine?.close();engine=undefined;await health(delegation.status===2?'challenge-window':delegation.status===0?'awaiting-admission':'recovering',
      {epoch:String(delegation.epoch),releaseAt:String(delegation.stakeUnlockAt),batches:String(delegation.batchIndex)});pause=3000;await delay(pause);continue;
    }
   }
   if(!binding?.id||delegation.status!==1){await delay(1000);continue;}
   if(!engine){
    await health('provisioning',{epoch:String(binding.epoch),id:String(binding.id)});
    url=await provisionPoolArena(db,app,binding.epoch,url||undefined);
    const candidate=createPoolEngine(db,base,r.common.hub,app,url,r.engineKey,{epoch:binding.epoch,id:binding.id});
    try{
     const session:any=await candidate.node.request({method:'interlude_session',params:[]} as any);
     assert.equal(String(session.app).toLowerCase(),app.toLowerCase());assert.equal(BigInt(session.epoch),binding.epoch);assert.equal(session.chainId,4242);
     assert.equal(await candidate.node.readContract({address:app,abi,functionName:'RULES_VERSION'}),10n);
     await observePoolArenaReady(db,app,binding.epoch,true);engine=candidate;
    }catch(error){candidate.close();await observePoolArenaReady(db,app,binding.epoch,false);throw error;}
   }
   let s=await engine.read();
   if(s.phase===1){s=await engine.send(`start:${binding.id}`,'start');lastTick=Date.now();}
   if(s.phase===2){
    await health('playing',{epoch:String(binding.epoch),id:String(binding.id),node:url,mode:s.state.mode,time:String(s.state.t),score:[s.state.scoreA,s.state.scoreB]});
    if(s.chaos&&!proofTask){
     const actor=engine,epoch=actor.ref.epoch,id=actor.ref.id;
     const state=(v:typeof s)=>({playing:v.phase===2,request:v.chaos?.request??0n,pending:v.chaos?.pending??0n});
     // A slow or missing beacon must not stop physics. Capture this exact arena
     // instance so a late proof cannot move to a newly renewed epoch.
     proofTask=beacon.offer(`${app}:${epoch}:${id}`,state(s),async()=>state(await actor.read()),async(request,proof)=>{
      const current=await actor.read();await actor.send(`proof:${request}:${current.revision}`,'submitRandomness',[id,request,proof]);lastTick=Date.now();
     }).catch(()=>{console.log(JSON.stringify({at:new Date().toISOString(),app,epoch:String(epoch),id:String(id),event:'randomness-retry'}));}).finally(()=>{proofTask=undefined;});
    }
    if(s.phase===2&&!engine.busy()&&Date.now()-lastTick>=300){
     s=await engine.send(`tick:${s.revision}:${s.head}:${Math.floor(Date.now()/300)}`,'tick',[binding.id]);lastTick=Date.now();
    }
   }else if(s.phase>=3){await health('awaiting-publication',{epoch:String(binding.epoch),id:String(binding.id),node:url,phase:s.phase,score:[s.state.scoreA,s.state.scoreB],winner:s.winner});pause=1000;}
  }catch(error){
   const e=error as {shortMessage?:string;message?:string;code?:string;retryAt?:number};
   await health('synchronizing',{epoch:String(binding?.epoch??0),id:String(binding?.id??0),code:e.code,
    error:(e.shortMessage??e.message??'Arena unavailable').split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220)});
   pause=Math.max(1000,engineCooldownMs(url),Number.isFinite(e.retryAt)?e.retryAt!-Date.now():0);
  }
  if(!stopping)await delay(Math.min(pause,30000));
 }}finally{engine?.close();await proofTask;}
}
try{await Promise.all(r.arenas.map((a:{app:Address})=>arenaLoop(a.app)));}finally{await metrics();await db.end();}
