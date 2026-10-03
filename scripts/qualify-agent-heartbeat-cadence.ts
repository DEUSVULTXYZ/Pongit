// Bounded hosted liveness diagnostic using the public player's 200ms cadence.
// Synthetic controls and a deliberate concession are not browser or natural-game proof.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {createPublicClient,http,keccak256,type Abi,type Address} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {WebSocket} from 'ws';
import {Pool} from 'pg';
import {chainTools} from './independent-chain-tools';
import {privateSyncContinuation} from './private-sync-continuation';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {preparePoolFamily} from '../shared/agent-pool-family';
import {preparePoolChallenge} from '../shared/agent-pool-client';
import {createPoolPlayer,type PoolPlayerTiming} from '../shared/agent-pool-player';
import {challengeRefFromReceipt} from '../shared/agent-challenge-receipt';
import {admissionPasses} from '../shared/agent-pool-sponsor';
import {AgentPoolReader,poolJson} from '../relayer/src/agents/pool-read';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentChallengesAbi as queueAbi} from '../shared/abi-AgentChallenges';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
import type {EngineState} from '../shared/engine-stream';

assert.equal(process.env.PONG_HEARTBEAT_CADENCE,'bounded-private');
assert.equal(process.getuid?.(),1000);
const run=process.env.PONG_HEARTBEAT_RUN!;assert(/^[1-9]$/.test(run));
const mode=Number(process.env.PONG_HEARTBEAT_MODE);assert(mode===0||mode===1);
const deadline=Date.parse(process.env.PONG_HEARTBEAT_DEADLINE??'');
assert(deadline>Date.now()&&deadline<Date.now()+900_000);
const r=JSON.parse(readFileSync('/secrets/deployment.json','utf8'));
assert(privateSyncContinuation(r,process.env.PONG_PRIVATE_SYNC_CONTINUATION));
const m=validateAgentPoolManifest(JSON.parse(readFileSync('/metadata/manifest.json','utf8')));
assert(m.pool===r.common.pool&&m.rulesVersion===16&&m.friendlyPause==='heartbeat-v1'&&!m.enabled&&!m.tournamentsEnabled);
const path=`artifacts/reusable-candidate/heartbeat-cadence-${run}.json`,privatePath=`/secrets/heartbeat-cadence-${run}.json`;
assert(!existsSync(path)&&!existsSync(privatePath),'Retain every previous attempt');
const secret={owner:generatePrivateKey(),storage:{} as Record<string,string>};
const saveSecret=()=>{writeFileSync(privatePath+'.next',poolJson(secret),{mode:0o600});renameSync(privatePath+'.next',privatePath);};saveSecret();
const storage={getItem:(k:string)=>secret.storage[k]??null,setItem:(k:string,v:string)=>{secret.storage[k]=v;saveSecret();},removeItem:(k:string)=>{delete secret.storage[k];saveSecret();}};
const owner=privateKeyToAccount(secret.owner);
const report:any={startedAt:new Date().toISOString(),deadline,run,mode,pool:m.pool,source:process.env.PONG_SOURCE_COMMIT,passed:false,
 scope:'One real hosted friendly match alongside an independently driven tournament. Synthetic owner, measured heartbeat/command cadence, deliberate concession. No browser/GPU, catalogue latency, five-lane or 24-hour proof.',samples:[],heartbeats:[],moves:[],errors:[],timings:[]};
const save=()=>{writeFileSync(path+'.next',poolJson(report));renameSync(path+'.next',path);};save();
const t=await chainTools(r.prefix+':heartbeat-cadence-'+run,measuredFetch('monad'));
const base=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:10,batchSize:8192}},transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000,fetchFn:measuredFetch('monad')})});
const reader=new AgentPoolReader(base,m,[]),db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:1});
const metrics=await agentMetrics('/diagnostics/reusable','heartbeat-cadence-'+run);
const read=(address:Address,abi:Abi,method:string,args:any[]=[])=>base.readContract({address,abi,functionName:method,args}) as Promise<any>;
const write=(id:string,address:Address,abi:Abi,method:string,args:any[]=[])=>retryOperatorContention(()=>t.write(id,address,abi,method,args));
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const clean=(e:any)=>String(e?.shortMessage??e?.message??e).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,200);
const requireTime=()=>assert(Date.now()<deadline,'Original diagnostic deadline reached');
let client:ReturnType<typeof createPoolPlayer>|undefined,stopWatch:(()=>void)|undefined,latest:EngineState|undefined;
let heartbeatTimer:ReturnType<typeof setInterval>|undefined,movementTimer:ReturnType<typeof setInterval>|undefined,enabled=false;
let beating:Promise<unknown>|undefined,moving:Promise<unknown>|undefined,challengeOwned=false;
const percent95=(values:number[])=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]:null;
const stopCadence=async()=>{enabled=false;clearInterval(heartbeatTimer);clearInterval(movementTimer);await Promise.allSettled([beating,moving].filter(Boolean));};
function observe(s:EngineState){
 latest=s;const prior=report.samples.at(-1);
 if(prior?.revision===String(s.revision)&&prior?.head===String(s.head))return;
 report.samples.push({at:Date.now(),revision:String(s.revision),head:String(s.head),time:String(s.state.t),phase:s.phase,pause:s.sync?.pause.status,score:[s.state.scoreA,s.state.scoreB]});
}
function defend(s:EngineState):-1|0|1{
 const v=s.state,dt=v.vx<0n?(40_000_000n-v.x)*1_000_000n/v.vx:0n;let target=288_000_000n;
 if(dt>0n){let y=v.y+v.vy*dt/1_000_000n-6_000_000n;y=((y%1_128_000_000n)+1_128_000_000n)%1_128_000_000n;target=6_000_000n+(y>564_000_000n?1_128_000_000n-y:y);}
 return v.left<target-8_000_000n?1:v.left>target+8_000_000n?-1:0;
}
try{
 assert.equal(await read(m.pool,poolAbi,'publicAdmissions'),false);
 assert.equal(await read(m.pool,poolAbi,'admissions'),true,'The independent tournament owns pool admission');
 assert.equal(await read(m.tournaments,bookAbi,'admissions'),true);
 const tournament=await read(m.pool,poolAbi,'laneRecord',[0]);assert(tournament.tournament===7n||tournament.tournament===8n);
 for(let i=1;i<5;i++)assert.equal((await read(m.pool,poolAbi,'laneRecord',[i])).ref.id,0n,'Do not overlap another friendly driver');
 assert.equal(await read(m.challenges,queueAbi,'admissions'),false);
 const bots=(await reader.catalog(0n,32)).value.items,bot=bots.find(b=>b.official&&b.agent.toLowerCase()===r.bots[0].agent.toLowerCase());
 assert(bot?.qualification[mode]);report.archetype=bot.agent;report.player=owner.address;
 for(const arena of m.arenas.filter(a=>a.app.toLowerCase()!==tournament.ref.arena.toLowerCase())){
  const hub=await readHubDelegation(base,m.hub,arena.app);
  assert(hub.status===1&&hub.epoch===1n&&hub.batchIndex<1500n,'Review reserve before admission');
  const health=(await db.query("SELECT stage,detail FROM agent_pool.health WHERE app=$1 AND updated_at>now()-interval '20 seconds'",[arena.app.toLowerCase()])).rows[0];
  assert(health?.stage==='available'&&String(health.detail.epoch)===String(hub.epoch));
  assert.equal(keccak256((await base.getCode({address:arena.app}))!),arena.runtimeHash);
 }
 const family=await preparePoolFamily(base,m,owner,storage);assert(family.call);
 await retryOperatorContention(()=>t.submit('family',family.call!.data,family.call!.to));
 challengeOwned=true;await write('open-challenges',m.challenges,queueAbi,'setAdmissions',[true]);
 const call=await preparePoolChallenge(base,m,privateKeyToAccount(family.session.key),owner.address,{agent:bot.agent,mode});
 const queued=await retryOperatorContention(()=>t.submit('challenge',call.data,call.to));report.queuedAt=new Date().toISOString();
 assert.equal((await base.getBlock({blockNumber:queued.blockNumber})).hash,queued.blockHash);
 report.ref=challengeRefFromReceipt(m,queued,owner.address,{agent:bot.agent,mode});save();
 const passes=admissionPasses(await read(m.challenges,queueAbi,'count'))+1;
 for(let i=0;!report.ref&&i<passes;i++){
  requireTime();const receipt=await write('admit-'+i,m.pool,poolAbi,'admitChallenge');
  assert.equal((await base.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash);
  report.ref=challengeRefFromReceipt(m,receipt,owner.address,{agent:bot.agent,mode});save();
 }
 assert(report.ref,'Retain the unresolved request and its owner journal');report.admittedAt=new Date().toISOString();save();
 const view=(await reader.match(report.ref)).value;
 assert(view.mode===mode&&!view.ranked&&view.tournament==='0'&&view.a.toLowerCase()===owner.address.toLowerCase()&&view.b.toLowerCase()===bot.agent.toLowerCase());
 client=createPoolPlayer(m,view,family.session,{base,storage,socket:url=>new WebSocket(url),onTiming:(s:PoolPlayerTiming)=>{report.timings.push(s);}});
 stopWatch=client.watch(observe);
 let recovered=false;
 while(Date.now()<deadline){
  try{const s=recovered?await client.read():await client.recover();recovered=true;observe(s);
   if(s.phase===1)observe(await client.ready());else if(s.phase===2)break;else assert.fail('The fixture ended before its controls started');
  }catch(e){report.entryError=clean(e);recovered=false;save();}
  await wait(100);
 }
 assert.equal(latest?.phase,2);report.playingAt=Date.now();save();enabled=true;
 // Match the public component's cadence and non-overlap guard. In particular,
 // do not add an artificial 200ms sleep after each completed network round trip.
 heartbeatTimer=setInterval(()=>{
  if(!enabled||beating)return;const at=performance.now();
  beating=client!.heartbeat(true).then(s=>{observe(s);report.heartbeats.push({at:Date.now(),ms:performance.now()-at});},e=>{report.errors.push({kind:'heartbeat',error:clean(e),at:Date.now()});enabled=false;}).finally(()=>{beating=undefined;});
 },200);
 movementTimer=setInterval(()=>{
  if(!enabled||moving||latest?.phase!==2||latest.sync?.pause.status!==1)return;
  const dir=defend(latest);if(dir===latest.state.leftDir)return;const at=performance.now();
  moving=client!.move(dir).then(()=>{report.moves.push({at:Date.now(),ms:performance.now()-at});},e=>{report.errors.push({kind:'movement',error:clean(e),at:Date.now()});enabled=false;}).finally(()=>{moving=undefined;});
 },120);
 while(Date.now()-report.playingAt<90_000&&latest?.phase===2&&enabled){requireTime();await wait(1000);save();}
 await stopCadence();report.normalThrough=Date.now();
 const normal=report.samples.filter((s:any)=>s.at>=report.playingAt&&s.at<=report.normalThrough);
 report.pauseTransitions=normal.filter((s:any,i:number)=>s.pause===2&&normal[i-1]?.pause!==2).length;
 report.activeMs=report.normalThrough-report.playingAt;report.heartbeatP95=percent95(report.heartbeats.map((s:any)=>s.ms));report.controlP95=percent95(report.moves.map((s:any)=>s.ms));save();
 const state=await client.read(true);
 if(state.phase===2&&!client.journal.pending(family.session.grant.key)){await client.concede();report.deliberateConcession=true;save();}
 while(Date.now()<deadline){const result=(await reader.match(report.ref)).value.result;if(result){report.result=result;break;}await wait(1000);}
 assert(report.result,'Outcome must publish before the original deadline');
 report.passed=report.result.status===3&&report.activeMs>=60_000&&report.pauseTransitions===0&&report.errors.length===0&&report.heartbeats.length>=100&&report.heartbeatP95<=300;
 if(!report.passed){report.error='Healthy-cadence liveness or confirmation target failed';process.exitCode=1;}
}catch(e){report.error=clean(e);process.exitCode=1;}
finally{
 await stopCadence();stopWatch?.();client?.close();
 if(challengeOwned)try{await write('close-challenges',m.challenges,queueAbi,'setAdmissions',[false]);report.queueClosed=true;}catch{report.pendingReconciliation=true;process.exitCode=1;}
 report.finishedAt=new Date().toISOString();save();await t.close();await db.end();await metrics();
 console.log(JSON.stringify({passed:report.passed,error:report.error,pauseTransitions:report.pauseTransitions,heartbeatP95:report.heartbeatP95,controlP95:report.controlP95}));
}
