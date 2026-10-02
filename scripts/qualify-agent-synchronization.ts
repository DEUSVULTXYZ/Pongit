// Bounded private rules-16 trial. Uses a synthetic owner and the real scoped
// player client. It does not claim browser rendering or physical Mera evidence.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,http,decodeEventLog,keccak256,stringToHex,zeroAddress,type Address,type Abi} from 'viem';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {WebSocket} from 'ws';
import {Pool} from 'pg';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {preparePoolFamily} from '../shared/agent-pool-family';
import {preparePoolChallenge} from '../shared/agent-pool-client';
import {createPoolPlayer} from '../shared/agent-pool-player';
import {AgentPoolReader,poolJson} from '../relayer/src/agents/pool-read';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentChallengesAbi as queueAbi} from '../shared/abi-AgentChallenges';
import {agentPoolAdmissionAbi} from '../shared/agent-house-instances';
import {agentPublishedRatingsAbi as ratingsAbi} from '../shared/abi-AgentPublishedRatings';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
import type {EngineState} from '../shared/engine-stream';

assert.equal(process.env.PONG_SYNC_QUALIFICATION,'bounded-private-pause');
assert.equal(process.getuid?.(),1000);
const mode=Number(process.env.PONG_SYNC_MODE);assert(mode===0||mode===1);
const deadline=Date.parse(process.env.PONG_SYNC_DEADLINE??'');
assert(deadline>Date.now()&&deadline<Date.now()+15*60_000,'Original bounded deadline required');
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
assert.equal(r.prefix,'reusable-agents-20261002-1');assert(!r.continuation);
const m=validateAgentPoolManifest(JSON.parse(await readFile('/metadata/manifest.json','utf8')),(process.env.PONG_HUMAN_APPS??'').split(','));
assert(m.pool===r.common.pool&&m.rulesVersion===16&&m.friendlyPause==='heartbeat-v1'&&!m.enabled&&!m.tournamentsEnabled);
const path=`artifacts/reusable-candidate/synchronization-${mode}.json`;
const report:any={startedAt:new Date().toISOString(),deadline,pool:m.pool,mode,source:process.env.PONG_SOURCE_COMMIT,passed:false,
 scope:'Hosted rules-16 pause, resume, control and publication with a synthetic owner. No browser, catalogue latency, human passkey or 24-hour proof.'};
await writeFile(path,poolJson(report),{flag:'wx'});
const save=async()=>{await writeFile(path+'.next',poolJson(report));await rename(path+'.next',path);};
const privatePath=`/secrets/synchronization-${mode}.json`;
const secret={owner:generatePrivateKey(),storage:{} as Record<string,string>};
await writeFile(privatePath,poolJson(secret),{mode:0o600,flag:'wx'});
let secretWrites=Promise.resolve();
const storage={getItem:(k:string)=>secret.storage[k]??null,setItem:(k:string,v:string)=>{secret.storage[k]=v;persist();},removeItem:(k:string)=>{delete secret.storage[k];persist();}};
function persist(){const value=poolJson(secret);secretWrites=secretWrites.then(async()=>{await writeFile(privatePath+'.next',value,{mode:0o600});await rename(privatePath+'.next',privatePath);});}
const owner=privateKeyToAccount(secret.owner);
const t=await chainTools(r.prefix+':synchronization-'+mode,measuredFetch('monad'));
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000,fetchFn:measuredFetch('monad')})});
const reader=new AgentPoolReader(base,m,[]),db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:2});
const metrics=await agentMetrics('/diagnostics/reusable','synchronization-'+mode);
const write=(id:string,address:Address,abi:any,method:string,args:readonly unknown[]=[])=>retryOperatorContention(()=>t.write(id,address,abi,method,args));
const read=(method:string,args:any[]=[])=>base.readContract({address:m.pool,abi:poolAbi as Abi,functionName:method,args}) as Promise<any>;
const rating=(agent:Address)=>base.readContract({address:m.ratings,abi:ratingsAbi,functionName:'ratingOf',args:[agent,mode]});
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let client:ReturnType<typeof createPoolPlayer>|undefined,unwatch:(()=>void)|undefined;
const physical=(s:EngineState)=>keccak256(stringToHex(poolJson({state:s.state,chaos:s.chaos,winner:s.winner})));
const sample=(s:EngineState)=>({at:new Date().toISOString(),head:String(s.head),time:String(s.state.t),phase:s.phase,score:[s.state.scoreA,s.state.scoreB],pause:s.sync?.pause,physical:physical(s)});
const requireTime=()=>assert(Date.now()<deadline,'Original trial deadline reached');
async function fresh(){requireTime();return client!.read(true);}
try{
 assert.equal(await read('publicAdmissions'),false);
 for(let i=0;i<5;i++)assert.equal((await read('laneRecord',[i])).ref.id,0n,'Previous trial still owns a lane');
 const bots=(await reader.catalog(0n,32)).value.items;
 const bot=bots.find(b=>b.official&&b.agent.toLowerCase()===r.bots[0].agent.toLowerCase());
 assert(bot?.qualification[mode],'NOVA needs a real published mode qualification');
 report.archetype=bot.agent;report.player=owner.address;report.ratingBefore=await rating(bot.agent);
 const arena=m.arenas[0],hub=await readHubDelegation(base,m.hub,arena.app);
 assert(hub.status===1&&hub.epoch===1n&&hub.batchIndex<2000n,'Review bounded publication reserve');
 const health=(await db.query("SELECT stage,detail FROM agent_pool.health WHERE app=$1 AND updated_at>now()-interval '20 seconds'",[arena.app.toLowerCase()])).rows[0];
 assert(health?.stage==='available'&&String(health.detail.epoch)===String(hub.epoch),'Fresh operational arena required');
 assert.equal(keccak256((await base.getCode({address:arena.app}))!),arena.runtimeHash);
 const family=await preparePoolFamily(base,m,owner,storage);assert(family.call);await secretWrites;
 await retryOperatorContention(()=>t.submit('family',family.call!.data,family.call!.to));
 await write('private-epoch',m.pool,agentPoolAdmissionAbi,'setArenaAdmissions',[[arena.app],[hub.epoch],[true],keccak256(stringToHex('BOUNDED_RULES16_SYNCHRONIZATION'))]);
 await write('open-pool',m.pool,poolAbi,'setAdmissions',[true]);await write('open-challenges',m.challenges,queueAbi,'setAdmissions',[true]);
 const call=await preparePoolChallenge(base,m,privateKeyToAccount(family.session.key),owner.address,{agent:bot.agent,mode});
 await retryOperatorContention(()=>t.submit('challenge',call.data,call.to));
 const receipt=await write('admit',m.pool,poolAbi,'admitChallenge');
 const issued=receipt.logs.filter(l=>l.address.toLowerCase()===m.pool.toLowerCase()).flatMap(l=>{try{const e=decodeEventLog({abi:poolAbi,data:l.data,topics:l.topics});return e.eventName==='AdmissionIssued'?[e]:[];}catch{return[];}})[0] as any;
 assert(issued,'Exact admission receipt required');const ticket=issued.args.ticket;
 report.ref={chainId:10143,app:ticket.arena,epoch:String(ticket.epoch),id:String(ticket.matchId)};report.admittedAt=new Date().toISOString();await save();
 const view=(await reader.match(report.ref)).value;
 assert(view.mode===mode&&!view.ranked&&view.tournament==='0'&&view.a.toLowerCase()===owner.address.toLowerCase()&&view.b.toLowerCase()===bot.agent.toLowerCase());
 client=createPoolPlayer(m,view,family.session,{base,storage,socket:url=>new WebSocket(url)});
 unwatch=client.watch(()=>{});
 let state:EngineState|undefined;
 while(Date.now()<deadline){
  try{state=await client.recover();if(state.phase===1)state=await client.ready();break;}
  catch(error){report.lastEntryError=String((error as any)?.shortMessage??(error as Error).message).split('\n')[0].slice(0,160);await wait(200);}
 }
 assert(state,'Original entry deadline');
 while(state.phase===1){await wait(100);state=await fresh();}
 assert.equal(state.phase,2);assert.equal(state.sync?.pause.human,1);report.started=sample(state);await save();
 const controls:number[]=[];
 for(let i=0;i<30;i++){
  requireTime();const before=performance.now();await client.move(i%2?1:-1);controls.push(performance.now()-before);
  state=await client.heartbeat(true);assert.equal(state.phase,2);await wait(100);
 }
 await client.move(0);state=await fresh();report.beforeOutage=sample(state);await save();
 // No player writes during this interval. The independently running controller
 // keeps ticking, so an unchanged game proves a contractual stop, not a stopped test.
 await wait(1600);state=await fresh();assert.equal(state.phase,2);assert.equal(state.sync?.pause.status,2);
 assert.equal(state.state.t,state.sync!.pause.limitUs);report.paused=sample(state);
 const frozen=physical(state),limit=state.state.t;
 for(let i=0;i<8;i++){await wait(250);state=await fresh();assert.equal(physical(state),frozen,'Physics advanced while player controls were absent');}
 report.freezeVerified=sample(state);await save();
 state=await client.heartbeat(true);assert.equal(state.sync?.pause.status,3);const resume=state.sync!.pause.resumeBlock;
 assert(resume-state.head>=250n&&resume-state.head<=300n,'Resume uses the real three-second engine countdown');
 report.resumeRequested=sample(state);await save();
 while(state.sync!.pause.status===3){
  assert.equal(state.state.t,limit,'Countdown advances no physics');requireTime();await wait(100);state=await client.heartbeat(true);
 }
 assert.equal(state.sync!.pause.status,1);assert(state.head>=resume);report.resumed=sample(state);
 for(let i=0;i<70;i++){
  requireTime();const before=performance.now();await client.move(i%2?-1:1);controls.push(performance.now()-before);
  state=await client.heartbeat(true);assert.equal(state.phase,2);await wait(100);
 }
 await client.move(0);report.controls=controls.length;report.controlP95=[...controls].sort((a,b)=>a-b)[Math.ceil(controls.length*.95)-1];await save();
 if(mode===0){
  report.cancellationOutage=sample(await fresh());await save();
  do{await wait(500);state=await fresh();}while(state.phase===2);
  assert.equal(state.phase,4);assert.equal(state.winner,zeroAddress);report.cancelled=sample(state);
 }else{
  do{requireTime();await wait(100);state=await client.heartbeat(true);}while(state.phase===2);
  assert.equal(state.phase,3);report.finished=sample(state);
 }
 while(Date.now()<deadline){const result=(await reader.match(report.ref)).value.result;if(result){report.result=result;break;}await wait(1000);}
 assert.equal(report.result?.status,mode===0?4:3,'The hosted outcome must be published and captured');
 if(mode===0)assert.equal(report.result.winner,zeroAddress);
 assert.deepEqual(await rating(bot.agent),report.ratingBefore,'A friendly game must not alter competitive ratings');
 report.functionalPassed=true;report.latencyPassed=report.controlP95<=300;report.passed=report.functionalPassed&&report.latencyPassed;
 if(!report.passed){report.error='Control confirmation p95 exceeds 300 ms';process.exitCode=1;}
}catch(error){report.error=String((error as any)?.shortMessage??(error as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{
 unwatch?.();client?.close();await secretWrites;
 for(const [id,address,abi] of [['close-pool',m.pool,poolAbi],['close-challenges',m.challenges,queueAbi]] as const){try{await write(id,address,abi,'setAdmissions',[false]);report[id]=true;}catch{report.pendingReconciliation=true;process.exitCode=1;}}
 report.finishedAt=new Date().toISOString();await save();await t.close();await db.end();await metrics();
 console.log(JSON.stringify({passed:report.passed,functional:report.functionalPassed,error:report.error,report:path}));
}
