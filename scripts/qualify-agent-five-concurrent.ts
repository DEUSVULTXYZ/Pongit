// Real private five-lane trial. Synthetic owners exercise the actual limited
// player client; this is not a physical passkey or browser input qualification.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {createPublicClient,http,decodeEventLog,keccak256,stringToHex,type Abi,type Address,type Hex} from 'viem';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {WebSocket} from 'ws';
import {Pool} from 'pg';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {agentChallengesAbi as challengeAbi} from '../shared/abi-AgentChallenges';
import {preparePoolFamily,loadPoolFamily} from '../shared/agent-pool-family';
import {preparePoolChallenge} from '../shared/agent-pool-client';
import {createPoolPlayer} from '../shared/agent-pool-player';
import {createPoolObserver} from '../shared/agent-pool-observer';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {AgentPoolReader,poolJson} from '../relayer/src/agents/pool-read';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {NO_LEASE_HUB,hubLeaseValid} from '../shared/hub-lease';
import {agentPoolAdmissionAbi} from '../shared/agent-house-instances';
import {privateSyncContinuation} from './private-sync-continuation';
assert.equal(process.env.PONG_FIVE_CONCURRENT,'bounded-private-five');assert.equal(process.getuid?.(),1000);
const run=process.env.PONG_FIVE_CONCURRENT_RUN!;assert(/^[1-9]$/.test(run));
const deadline=Date.parse(process.env.PONG_FIVE_CONCURRENT_DEADLINE??'');assert(deadline>Date.now()&&deadline<Date.now()+25*60_000);
const r=JSON.parse(readFileSync('/secrets/deployment.json','utf8'));
const m=validateAgentPoolManifest(JSON.parse(readFileSync('/metadata/manifest.json','utf8')),(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean));
assert(m.version===5&&!m.enabled&&!m.tournamentsEnabled&&m.pool===r.common.pool);
const continuation=privateSyncContinuation(r,process.env.PONG_PRIVATE_SYNC_CONTINUATION);
const existingTournament=Number(process.env.PONG_FIVE_CONCURRENT_EXISTING??0);
assert(existingTournament===0||continuation&&[3,4].includes(existingTournament),'Only an independently driven private continuation championship');
assert(!continuation||existingTournament>0,'Continuation must retain its existing tournament driver');
const v3=process.env.PONG_FIVE_CONCURRENT_V3==='reviewed-private';
assert(!process.env.PONG_FIVE_CONCURRENT_V3||v3);
if(v3){assert.equal(m.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());assert.equal(m.pool.toLowerCase(),'0x550ff3c22e20fc760af9afd68fba2cb531140dc6');}
const synchronized=process.env.PONG_FIVE_CONCURRENT_SYNC==='reviewed-private';
assert(!process.env.PONG_FIVE_CONCURRENT_SYNC||synchronized);
if(synchronized){
 assert(!v3&&m.rulesVersion===16&&m.friendlyPause==='heartbeat-v1');
 assert.equal(m.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
 if(!continuation)assert.equal(m.pool.toLowerCase(),'0xd47bc7fece722a237c6547f85b4dd91c2601a4c8');
}
assert((m.rulesVersion===16)===synchronized,'Rules-16 trials require the explicit heartbeat-aware fixture');
const path=`artifacts/reusable-candidate/five-concurrent-${run}.json`,privatePath=`/secrets/five-concurrent-${run}.json`;
assert(!existsSync(path),'Preserve every completed or incomplete trial; use its own recovery instead of a new admission');
assert(!existsSync(privatePath),'Preserve private trial keys');
const secret={people:Array.from({length:4},()=>({owner:generatePrivateKey(),storage:{} as Record<string,string>,call:null as any}))};
const saveSecret=()=>{writeFileSync(privatePath+'.next',poolJson(secret),{mode:0o600});renameSync(privatePath+'.next',privatePath);};saveSecret();
const report:any={startedAt:new Date().toISOString(),deadline,pool:m.pool,source:process.env.PONG_SOURCE_COMMIT,scope:'Real Interlude and Monad with four synthetic human owners and one official tournament match. No browser, physical passkey or 24-hour proof.',people:[],passed:false};
if(existingTournament)report.existingTournament=existingTournament;
const save=()=>{writeFileSync(path+'.next',poolJson(report));renameSync(path+'.next',path);};save();
const t=await chainTools(r.prefix+':five-concurrent-'+run,measuredFetch('monad'));
const base=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:10,batchSize:8192}},transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000,fetchFn:measuredFetch('monad')})});
const reader=new AgentPoolReader(base,m,(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean));
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:2});
const metrics=await agentMetrics('/diagnostics/reusable','five-human-qualification');
const read=(to:Address,abi:Abi,fn:string,args:any[]=[])=>base.readContract({address:to,abi,functionName:fn,args}) as Promise<any>;
const write=(op:string,to:Address,abi:Abi,fn:string,args:any[]=[])=>retryOperatorContention(()=>t.write(op,to,abi,fn,args));
const wait=(ms=1000)=>new Promise(resolve=>setTimeout(resolve,ms));
const clients:ReturnType<typeof createPoolPlayer>[]=[];
const heartbeatStops:(()=>Promise<void>)[]=[];
function keepPresent(client:ReturnType<typeof createPoolPlayer>,row:any){
 let stopped=false;
 const loop=(async()=>{
  while(!stopped&&Date.now()<deadline){
   try{const state=await client.heartbeat(true);if(state.phase>=3)return;}
   catch(e){row.heartbeatError=String((e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,160);save();return;}
   await wait(200);
  }
 })();
 const stop=async()=>{stopped=true;await loop;};heartbeatStops.push(stop);return stop;
}
let tournamentObserver:Awaited<ReturnType<typeof createPoolObserver>>|undefined;
let arrived=0,releaseReady:()=>void,rejectReady:(e:unknown)=>void;
const allReady=new Promise<void>((resolve,reject)=>{releaseReady=resolve;rejectReady=reject;});allReady.catch(()=>{});
const extract=(receipt:any)=>{const event=receipt.logs.filter((l:any)=>l.address.toLowerCase()===m.pool.toLowerCase()).flatMap((l:any)=>{try{const e=decodeEventLog({abi:poolAbi,data:l.data,topics:l.topics});return e.eventName==='AdmissionIssued'?[e]:[];}catch{return[];}})[0] as any;assert(event);const v=event.args.ticket;return{chainId:10143 as const,app:v.arena as Address,epoch:String(v.epoch),id:String(v.matchId)};};
try{
 const predecessor=process.env.PONG_FIVE_RETRY_FROM;
 assert(!existingTournament||!predecessor,'An existing championship cannot adopt an unrelated failed trial');
 let previous:any,previousCompleted=false;
 if(predecessor){assert(/^[1-9]$/.test(predecessor)&&Number(predecessor)<Number(run));previous=JSON.parse(readFileSync(`artifacts/reusable-candidate/five-concurrent-${predecessor}.json`,'utf8'));
  assert(previous.finishedAt&&!previous.passed&&previous['close-pool']&&previous['close-book']);
  if(previous.people.some((p:any)=>p.ref)){
   assert(v3&&previous.people.length===4&&previous.people.every((p:any)=>p.ref)&&previous.tournament,
    'Partial or legacy admissions require their own recovery');
   const completion=[];
   for(const ref of [previous.tournament,...previous.people.map((p:any)=>p.ref)]){
    const result=(await reader.match(ref)).value.result;
    assert(result?.status===3,'Every previous game must finish and publish normally before another trial');
    completion.push({ref,result});
   }
   for(let i=0;i<5;i++)assert.equal((await read(m.pool,poolAbi,'laneRecord',[i])).ref.id,0n,'Previous trial still owns a lane');
   const ref={chainId:10143n,arena:previous.tournament.app,epoch:BigInt(previous.tournament.epoch),id:BigInt(previous.tournament.id)};
   const record=await read(m.pool,poolAbi,'record',[ref]);assert(record.captured&&record.tournament===1n);
   const fixture=await read(m.tournaments,bookAbi,'fixture',[1n,record.fixture]);
   if(!fixture.resolved)await write('synchronize-previous',m.tournaments,bookAbi,'synchronize',[1n,record.fixture]);
   report.previousCompletion=completion;previousCompleted=true;
  }
  report.previousTrial=predecessor;
 }
 const lane=await read(m.pool,poolAbi,'laneRecord',[0]);
 const selected=m.arenas.slice(v3?1:0,v3?6:5);
 for(const arena of selected){
  const hub=await readHubDelegation(base,m.hub,arena.app),block=await base.getBlock();
  assert(hub.status===1&&hub.epoch===1n&&hub.batchIndex<2000n&&hubLeaseValid(m.hub,hub.expiresAt,block.timestamp,1800n),'Review original epoch reserve');
  const h=(await db.query("SELECT stage FROM agent_pool.health WHERE app=$1 AND updated_at>now()-interval '20 seconds'",[arena.app.toLowerCase()])).rows[0];
  assert(h?.stage==='available'||h?.stage==='playing'&&lane.ref.arena.toLowerCase()===arena.app.toLowerCase()&&(existingTournament||previous&&!previousCompleted&&String(lane.ref.id)===previous.tournament.id),'Only the preserved tournament may already be playing');
 }
 assert.equal(await read(m.pool,poolAbi,'publicAdmissions'),false);assert.equal(await read(m.tournaments,bookAbi,'count'),existingTournament?BigInt(existingTournament):previous?1n:0n);
 const catalogue=(await reader.catalog(0n,32)).value;
 assert.equal(catalogue.items.filter(v=>v.official&&v.qualification[0]&&v.qualification[1]).length,8,'All eight bots require real mode qualification');
 if(!existingTournament&&(v3||synchronized))await write('verified-private-epochs',m.pool,agentPoolAdmissionAbi,'setArenaAdmissions',[
  selected.map(a=>a.app),selected.map(()=>1n),selected.map(()=>true),keccak256(stringToHex('BOUNDED_PRIVATE_FIVE_CONCURRENT_TRIAL'))]);
 if(existingTournament){
  assert.equal(await read(m.pool,poolAbi,'admissions'),true);assert.equal(await read(m.tournaments,bookAbi,'admissions'),true);
  assert.equal(await read(m.challenges,challengeAbi,'admissions'),false);
  for(let i=1;i<5;i++)assert.equal((await read(m.pool,poolAbi,'laneRecord',[i])).ref.id,0n);
 }else{await write('admissions',m.pool,poolAbi,'setAdmissions',[true]);await write('tournaments',m.tournaments,bookAbi,'setAdmissions',[true]);}
 if(!existingTournament&&!previous){await write('begin',m.tournaments,bookAbi,'begin');await write('select',m.tournaments,bookAbi,'select',[1n,32]);}
 const next=await read(m.tournaments,bookAbi,'nextFixture',[BigInt(existingTournament||1)]);
 let archetype:Address;
 if(existingTournament){
  assert(lane.ref.id>0n&&lane.tournament===BigInt(existingTournament),'Existing championship must own its live lane');
  report.tournament={chainId:10143,app:lane.ref.arena,epoch:String(lane.ref.epoch),id:String(lane.ref.id)};
  const live=(await reader.match(report.tournament)).value;assert.equal(live.result,null);
  report.adoptedExistingTournament=true;archetype=lane.a;
 }else if(next[0]===255){
  assert(previous&&!previousCompleted&&lane.ref.id>0n,'Do not invent a tournament fixture');
  assert.equal((await reader.match(previous.tournament)).value.result,null,'A published fixture must be synchronized before retry');
  report.tournament=previous.tournament;report.adoptedExistingTournament=true;archetype=lane.a;
 }else{
  archetype=next[1];
 }
 assert(catalogue.items.some(v=>v.official&&v.agent.toLowerCase()===archetype.toLowerCase()));report.archetype=archetype;
 save();
 for(let i=0;i<4;i++){
  const p=secret.people[i],owner=privateKeyToAccount(p.owner as Hex),storage={getItem:(k:string)=>p.storage[k]??null,setItem:(k:string,v:string)=>{p.storage[k]=v;saveSecret();},removeItem:(k:string)=>{delete p.storage[k];saveSecret();}};
  const row:any={index:i,player:owner.address,mode:i%2,moves:0,latencies:[]};report.people.push(row);save();
  const family=await preparePoolFamily(base,m,owner,storage);assert(family.call);p.call=family.call;saveSecret();await retryOperatorContention(()=>t.submit('family-'+i,p.call.data,p.call.to));
 }
 // Prepare all accounts before starting the thirty-second loading deadline of
 // any human arena. Serial test-account setup is not player readiness.
 if(existingTournament){
  // Account preparation must not race the end of the adopted tournament game.
  // Wait for an actually young fixture, without modifying the tournament gates.
  let adopted=false;
  while(Date.now()<deadline-10*60_000){
   const active=await read(m.pool,poolAbi,'laneRecord',[0]);
   if(active.ref.id>0n&&active.tournament===BigInt(existingTournament)){
    const ref={chainId:10143 as const,app:active.ref.arena,epoch:String(active.ref.epoch),id:String(active.ref.id)};
    const observer=await createPoolObserver(m,(await reader.match(ref)).value,u=>new WebSocket(u));
    try{
     const state=await observer.read(true);
     if(state.phase===2&&state.clock<60_000_000n&&state.state.scoreA+state.state.scoreB<=2){
      report.tournament=ref;archetype=active.a;report.archetype=archetype;adopted=true;save();break;
     }
    }finally{observer.close();}
   }
   await wait(2000);
  }
  assert(adopted,'No live early fixture within original concurrent deadline');
 }
 await write('challenges',m.challenges,challengeAbi,'setAdmissions',[true]);
 for(const row of report.people){
  const p=secret.people[row.index],storage={getItem:(k:string)=>p.storage[k]??null,setItem:(k:string,v:string)=>{p.storage[k]=v;saveSecret();},removeItem:(k:string)=>{delete p.storage[k];saveSecret();}};
  const family=loadPoolFamily(m,row.player,storage)!;
  p.call=await preparePoolChallenge(base,m,privateKeyToAccount(family.key),row.player,{agent:archetype,mode:row.mode});saveSecret();
  await retryOperatorContention(()=>t.submit('challenge-'+row.index,p.call.data,p.call.to));row.queuedAt=new Date().toISOString();save();
 }
 if(!report.tournament)report.tournament=extract(await write('tournament-first-fixture',m.pool,poolAbi,'admitTournament',[1n]));
 for(const row of report.people){
  assert(Date.now()<deadline,'Original admission deadline');
  // Version-5 requests may have been admitted atomically by their own signed
  // command. Resolve the player's assigned lane before asking for another.
  const lanes=await Promise.all([1,2,3,4].map(i=>read(m.pool,poolAbi,'laneRecord',[i])));
  const current=lanes.find(v=>v.ref.id>0n&&v.a.toLowerCase()===row.player.toLowerCase());
  if(current)row.ref={chainId:10143,app:current.ref.arena,epoch:String(current.ref.epoch),id:String(current.ref.id)};
  else row.ref=extract(await write('admit-'+row.index,m.pool,poolAbi,'admitChallenge'));
  row.admittedAt=new Date().toISOString();save();
 }
 assert.equal(new Set([report.tournament,...report.people.map((p:any)=>p.ref)].map(v=>v.app.toLowerCase())).size,5);
 tournamentObserver=await createPoolObserver(m,(await reader.match(report.tournament)).value,u=>new WebSocket(u));
 tournamentObserver.watch(s=>{if(s.phase>=3&&!report.engineFinishedAt){report.engineFinishedAt=new Date().toISOString();save();}});
 const played=await Promise.allSettled(report.people.map(async(row:any)=>{try{
  const p=secret.people[row.index],storage={getItem:(k:string)=>p.storage[k]??null,setItem:(k:string,v:string)=>{p.storage[k]=v;saveSecret();},removeItem:(k:string)=>{delete p.storage[k];saveSecret();}};
  const view=(await reader.match(row.ref)).value;assert(view.b.toLowerCase()===archetype.toLowerCase()&&view.a.toLowerCase()===row.player.toLowerCase()&&!view.ranked&&view.tournament==='0');
  const session=loadPoolFamily(m,row.player,storage)!;
  const client=createPoolPlayer(m,view,session,{base,storage,socket:u=>new WebSocket(u)});clients.push(client);client.watch(s=>{if(s.phase>=3&&!row.engineFinishedAt){row.engineFinishedAt=new Date().toISOString();save();}});
  let recovered=false;
  while(Date.now()<deadline){
   try{const s=recovered?await client.read():await client.recover();recovered=true;
    if(s.phase===1)await client.ready();else if(s.phase===2){row.playingAt=new Date().toISOString();save();break;}else if(s.phase>=3)throw Error('Game ended before controls');
   }catch(e){row.lastRecovery=String((e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,160);save();if(row.lastRecovery==='Game ended before controls')throw e;recovered=false;}
   await wait(400);
  }
  assert(row.playingAt,'Original readiness deadline');
  if(synchronized)keepPresent(client,row);
  if(++arrived===4){
   const states=await Promise.all([...clients.map(c=>c.read(true)),tournamentObserver!.read(true)]);
   assert(states.every(s=>s.phase===2),'Five games must actually overlap on the hosted engines');
   report.overlapVerifiedAt=new Date().toISOString();report.overlapStates=states.map(s=>({id:String(s.id),revision:String(s.revision),clock:String(s.state.t),a:s.a,b:s.b}));save();releaseReady();
  }
  await allReady;
  for(let i=0;i<100&&Date.now()<deadline;i++){
   const before=await client.read();assert.equal(before.phase,2,'Game ended before 100 controls');
   const at=performance.now();await client.move(before.state.leftDir===1?-1:1);
   let after=await client.read();if(after.nonceA<=before.nonceA)after=await client.read(true);
   assert(after.nonceA>before.nonceA,'Direction must consume this human command nonce');
   row.latencies.push(performance.now()-at);row.moves++;save();await wait(40);
  }
  await client.move(0);row.controlsFinishedAt=new Date().toISOString();row.p95=[...row.latencies].sort((a:number,b:number)=>a-b)[94];save();
  // Let the real game reach its rule-based outcome; no injected score/concession.
 }catch(e){rejectReady(e);throw e;}}));
 const failure=played.find(v=>v.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
 while(Date.now()<deadline){
  for(const row of [report,...report.people]){const ref=row===report?report.tournament:row.ref;if(row.result)continue;const view=(await reader.match(ref)).value;if(view.result){assert.equal(view.result.status,3);row.result=view.result;row.capturedAt=new Date().toISOString();save();}}
  if(report.result&&report.people.every((p:any)=>p.result))break;await wait(2000);
 }
 assert(report.result&&report.people.every((p:any)=>p.result),'Original publication deadline');
 assert(report.people.every((p:any)=>!p.heartbeatError),'An independent player heartbeat failed');
 const start=Date.parse(report.overlapVerifiedAt),end=Math.min(...report.people.map((p:any)=>Date.parse(p.engineFinishedAt)),Date.parse(report.engineFinishedAt));report.overlapMs=end-start;assert(report.overlapMs>0);
 report.functionalPassed=true;report.latencyPassed=report.people.every((p:any)=>p.p95<=300);report.passed=report.functionalPassed&&report.latencyPassed;
 if(!report.passed){report.error='Actual player command p95 exceeds 300 ms';process.exitCode=1;}
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,250);process.exitCode=1;}
finally{
 await Promise.all(heartbeatStops.map(stop=>stop()));
 clients.forEach(c=>c.close());tournamentObserver?.close();
 for(const [op,to,abi] of [['close-pool',m.pool,poolAbi],['close-book',m.tournaments,bookAbi],['close-challenges',m.challenges,challengeAbi]] as const){
  if(existingTournament&&op!=='close-challenges')continue;
  try{await write(op,to,abi,'setAdmissions',[false]);report[op]=true;}catch{report.pendingReconciliation=true;process.exitCode=1;}
 }
 report.finishedAt=new Date().toISOString();save();await t.close();await db.end();await metrics();console.log(JSON.stringify({passed:report.passed,functional:report.functionalPassed,error:report.error}));
}
