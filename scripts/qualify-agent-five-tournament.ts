// Private hosted tournament proof. Lifecycle belongs to its separate journaled
// worker. This driver never closes an arena or changes a publication budget.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {Pool} from 'pg';
import {decodeEventLog,keccak256,stringToHex,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi} from '../shared/abi-ReusableAgentPool';
import {agentPoolAdmissionAbi} from '../shared/agent-house-instances';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {agentChallengesAbi as queueAbi} from '../shared/abi-AgentChallenges';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {NO_LEASE_HUB,hubLeaseValid} from '../shared/hub-lease';
import {canonicalContractReads} from '../shared/canonical-contract-reads';
import {privateSyncContinuation,privateSyncQualification} from './private-sync-continuation';

assert.equal(process.env.PONG_FIVE_TOURNAMENT,'bounded-private');
assert.equal(process.getuid?.(),1000);
const id=BigInt(process.env.PONG_FIVE_TOURNAMENT_ID??'0');assert(id>=1n&&id<=8n);
const league=(id-1n)%4n>=2n;
const poolAbi=[...reusableAgentPoolAbi,...agentPoolAdmissionAbi];
const attempt=Number(process.env.PONG_FIVE_TOURNAMENT_ATTEMPT??1);assert(Number.isInteger(attempt)&&attempt>=1&&attempt<=3);
const deadline=Date.parse(process.env.PONG_FIVE_TOURNAMENT_DEADLINE??'');
assert(deadline>Date.now()&&deadline<Date.now()+(league?180:65)*60_000);
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
assert.equal(r.maxMatches,5);
const continuation=privateSyncContinuation(r,process.env.PONG_PRIVATE_SYNC_CONTINUATION);
if(continuation){
 const inherited=privateSyncQualification(process.env.PONG_PRIVATE_SYNC_CONTINUATION).tournaments;
 assert(id>inherited&&id<= (inherited===2n?4n:8n),'Only the next reviewed private formats');
}else assert(id<=4n,'Fresh private season only');
const v3=process.env.PONG_FIVE_TOURNAMENT_V3==='reviewed-private';
assert(!process.env.PONG_FIVE_TOURNAMENT_V3||v3);
if(v3){assert.equal(r.common.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());assert.equal(r.common.pool.toLowerCase(),'0x550ff3c22e20fc760af9afd68fba2cb531140dc6');}
const file=`artifacts/reusable-candidate/five-tournament-${id}${attempt>1?'-attempt'+attempt:''}.json`;
const report:any={startedAt:new Date().toISOString(),deadline,pool:r.common.pool,tournament:String(id),fixtures:[],passed:false,
 scope:'One real private tournament. Existing fixtures are verified canonically; no score injection, deadline extension, lifecycle writes or full-soak claim.'};
await writeFile(file,JSON.stringify(report),{flag:'wx'});
if(attempt>1){const previous=JSON.parse(await readFile(`artifacts/reusable-candidate/five-tournament-${id}${attempt>2?'-attempt'+(attempt-1):''}.json`,'utf8'));assert(previous.pool===r.common.pool&&!previous.passed&&previous.finishedAt&&previous.poolClosed&&previous.bookClosed);report.priorFailedAttempt=previous.finishedAt;}
const save=async()=>{await writeFile(file+'.next',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));await rename(file+'.next',file);};
const t=await chainTools(r.prefix+':five-tournament-'+id+'-attempt'+attempt,measuredFetch('monad'));
const closeMetrics=await agentMetrics('/diagnostics/reusable','tournament-qualification');
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:1});
const read=(to:Address,abi:any,fn:string,args:readonly unknown[]=[])=>t.base.readContract({address:to,abi,functionName:fn,args}) as Promise<any>;
const write=(op:string,to:Address,abi:any,fn:string,args:readonly unknown[]=[])=>retryOperatorContention(()=>t.write(op,to,abi,fn,args));
const wait=()=>new Promise(resolve=>setTimeout(resolve,2500));
const expected=league?28:7;
const communityReport=process.env.PONG_FIVE_COMMUNITY_REPORT??'five-community-setup-attempt3.json';
assert(/^five-community-setup(?:-attempt[23])?\.json$/.test(communityReport));
const community=process.env.PONG_FIVE_TOURNAMENT_COMMUNITY==='true'
 ?JSON.parse(await readFile('artifacts/reusable-candidate/'+communityReport,'utf8')):undefined;
if(community){assert(id===2n&&community.registered&&community.pool===r.common.pool);report.community={strategy:community.strategy,matches:[],qualified:false};}
async function qualifyCommunity(){
 if(!community)return true;
 const identity=await read(r.common.catalog,catalogAbi,'identity',[community.strategy]);
 for(const row of report.community.matches){
  const record=await read(r.common.pool,poolAbi,'record',[row.ref]);
  if(record.captured&&!row.result){row.result=await read(r.common.pool,poolAbi,'result',[row.ref]);assert.equal(row.result.status,3,'Community trial was cancelled');row.capturedAt=new Date().toISOString();}
 }
 if(identity.qualified===3){assert(report.community.matches.length===2&&report.community.matches.every((m:any)=>m.result));report.community.qualified=true;return true;}
 if(await read(r.common.pool,poolAbi,'playing',[community.strategy])!==`0x${'0'.repeat(64)}`)return false;
 // Only the renewed base can see this newly registered strategy. Do not create
 // another session or change gates owned by the tournament/lifecycle driver.
 let compatible=false;
 for(const arena of r.arenas){
  const d=await readHubDelegation(t.base,r.common.hub,arena.app);
  if(d.status===1&&d.baseBlock>=BigInt(community.registeredBlock)
   &&await read(r.common.pool,poolAbi,'arenaAdmissionEnabled',[arena.app,d.epoch])
   &&await read(r.common.pool,poolAbi,'arenaAvailable',[arena.app])){compatible=true;break;}
 }
 if(!compatible)return false;
 // The real keeper scans the challenge queue before qualifications. Completed
 // fixture challenges still invalidate that cursor when the catalogue changes.
 // This bounded harness must perform the same maintenance, not bypass priority.
 if(!await read(r.common.challenges,queueAbi,'qualificationsMayStart')){
  const count=await read(r.common.challenges,queueAbi,'count');assert(count<=32n,'Review a larger private challenge queue');
  for(let i=1n;i<=count;i++)assert.notEqual((await read(r.common.challenges,queueAbi,'requests',[i]))[3],1,'A waiting human has priority');
  const scan=report.community.scans??0;
  await write('community-scan-'+scan,r.common.pool,poolAbi,'admitChallenge');
  report.community.scans=scan+1;await save();return false;
 }
 assert(report.community.matches.length<2,'Community strategy failed a real trial; do not retry indefinitely');
 const tx=await write('community-'+report.community.matches.length,r.common.pool,poolAbi,'admitQualification');
 const events=tx.logs.filter((l:any)=>l.address.toLowerCase()===r.common.pool.toLowerCase()).flatMap((l:any)=>{
  try{const e=decodeEventLog({abi:reusableAgentPoolAbi,topics:l.topics,data:l.data});return e.eventName==='AdmissionIssued'?[e]:[];}catch{return[];}
 });
 assert.equal(events.length,1,'No eligible community qualification');
 const ticket=(events[0] as any).args.ticket,ref={chainId:10143n,arena:ticket.arena,epoch:ticket.epoch,id:ticket.matchId};
 const record=await read(r.common.pool,poolAbi,'record',[ref]);
 assert([record.a.toLowerCase(),record.b.toLowerCase()].includes(community.strategy.toLowerCase()),'Wrong community strategy');
 report.community.matches.push({ref,hash:tx.transactionHash,admittedAt:new Date().toISOString()});await save();return false;
}
try{
 assert.equal(await read(r.common.pool,poolAbi,'publicAdmissions'),false);
 assert.equal(await read(r.common.pool,poolAbi,'admissions'),false);
 const identities=await Promise.all(r.bots.map((b:any)=>read(r.common.catalog,catalogAbi,'identity',[b.agent])));
 assert.equal(identities.length,8);assert(identities.every(v=>v.qualified===3));
 const count=await read(r.common.tournaments,bookAbi,'count');assert(count===id||count===id-1n);
 if(count===id-1n&&id>1n){assert.equal((await read(r.common.tournaments,bookAbi,'tournament',[id-1n])).status,3);assert((await t.base.getBlock()).timestamp>=await read(r.common.tournaments,bookAbi,'nextAt'));}
 await write('pool-on',r.common.pool,poolAbi,'setAdmissions',[true]);
 await write('book-on',r.common.tournaments,bookAbi,'setAdmissions',[true]);
 if(count===id-1n)await write('begin',r.common.tournaments,bookAbi,'begin');
 let gateRevision=0,gateKey='';
 while(Date.now()<deadline){
  const anchor=await t.base.getBlock();assert(anchor.hash);
  const pinned=canonicalContractReads(t.base,anchor.hash).read;
  const tournament=await pinned(r.common.tournaments,bookAbi,'tournament',[id]);
  assert.equal(tournament.mode,Number((id-1n)%2n));assert.equal(tournament.league,league);
  if(tournament.status===1){await write('select-'+tournament.cursor+'-'+tournament.catalogRevision,r.common.tournaments,bookAbi,'select',[id,32]);continue;}
  assert(tournament.status===2||tournament.status===3,'Tournament correction requires independent reconciliation');
  // Qualification must not itself monopolize the gameplay RPC queue as the
  // championship grows. Verify every fixture on every iteration in bounded
  // canonical batches, including completed results; do not hide corrections in
  // a fixture cache or infer results from the previously saved report.
  const fixtures=await Promise.all(Array.from({length:expected},(_,index)=>pinned(r.common.tournaments,bookAbi,'fixture',[id,index])));
  const records=await Promise.all(fixtures.map(f=>f.bound?pinned(r.common.pool,poolAbi,'record',[f.ref]):null));
  const results=await Promise.all(fixtures.map((f,i)=>records[i]?.captured?pinned(r.common.pool,poolAbi,'result',[f.ref]):null));
  for(let index=0;index<expected;index++){
   const f=fixtures[index];if(!f.bound)continue;
   let row=report.fixtures.find((v:any)=>v.index===index);
   if(!row){row={index,ref:f.ref,observedAt:new Date().toISOString()};report.fixtures.push(row);}
   else assert.deepEqual(JSON.parse(JSON.stringify(row.ref,(_,v)=>typeof v==='bigint'?String(v):v)),JSON.parse(JSON.stringify(f.ref,(_,v)=>typeof v==='bigint'?String(v):v)),'A fixture reference changed');
   const record=records[index];assert(record);
   assert.equal(record.tournament,id);assert.equal(record.fixture,index);
   if(record.captured){
    const result=results[index];assert(result);assert.equal(result.status,3,'A canceled fixture is failed evidence');
    if(!f.resolved)await write('sync-'+index,r.common.tournaments,bookAbi,'synchronize',[id,index]);
    const final=f.resolved?f:await read(r.common.tournaments,bookAbi,'fixture',[id,index]);assert(final.resolved&&final.published.hash===result.hash);
    row.result=result;row.administrative=final.administrative;row.resolved=true;
   }
  }
  report.observedAt=new Date().toISOString();report.observedBlock=String(anchor.number);report.observedHash=anchor.hash;await save();
  const communityReady=await qualifyCommunity();
  if(tournament.status===3){assert.equal(report.fixtures.filter((v:any)=>v.resolved).length,expected);report.champion=tournament.champion;if(id>=3n)report.standings=await read(r.common.tournaments,bookAbi,'standings',[id]);if(communityReady){report.passed=true;break;}await wait();continue;}
  const lane=await read(r.common.pool,poolAbi,'laneRecord',[0]);if(lane.ref.id>0n){await wait();continue;}
  const next=await read(r.common.tournaments,bookAbi,'nextFixture',[id]);if(next[0]===255){await wait();continue;}
  const block=await t.base.getBlock(),health=(await db.query("SELECT app,stage,detail FROM agent_pool.health WHERE updated_at>now()-interval '20 seconds'")).rows;
  const candidates=await Promise.all(r.arenas.map(async(a:any)=>{
   const d=await readHubDelegation(t.base,r.common.hub,a.app,block.number),h=health.find(v=>v.app===a.app.toLowerCase());
   // Conservative diagnostic admission bound, not a qualified production policy.
   const enabled=d.status===1&&hubLeaseValid(r.common.hub,d.expiresAt,block.timestamp,420n)&&d.batchIndex<1200n&&h?.stage==='available'&&String(h.detail.epoch)===String(d.epoch);
   return{app:a.app,epoch:d.epoch,active:d.status===1,enabled,batches:d.batchIndex};
  }));
  const key=JSON.stringify(candidates.map(a=>[a.app,String(a.epoch),a.enabled]));
  const active=candidates.filter(a=>a.active);
  if(key!==gateKey&&active.length){await write('gates-'+gateRevision++,r.common.pool,poolAbi,'setArenaAdmissions',[active.map(a=>a.app),active.map(a=>a.epoch),active.map(a=>a.enabled),keccak256(stringToHex('BOUNDED_PRIVATE_TOURNAMENT'))]);gateKey=key;}
  report.capacity=candidates;await save();
  if(!candidates.some(a=>a.enabled)){report.waitingSince??=new Date().toISOString();await wait();continue;}
  delete report.waitingSince;
  await write('admit-'+next[0],r.common.pool,poolAbi,'admitTournament',[id]);await wait();
 }
 assert(report.passed,'Original tournament deadline reached');
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,250);process.exitCode=1;}
finally{
 for(const [key,to,abi]of [['pool',r.common.pool,poolAbi],['book',r.common.tournaments,bookAbi]]as const){try{await write('close-'+key,to,abi,'setAdmissions',[false]);report[key+'Closed']=true;}catch{report[key+'Closed']=false;process.exitCode=1;}}
 report.finishedAt=new Date().toISOString();await save();await db.end();await t.close();await closeMetrics();console.log(JSON.stringify({passed:report.passed,error:report.error,fixtures:report.fixtures.length}));
}
