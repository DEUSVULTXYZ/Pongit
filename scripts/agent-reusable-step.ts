// Common Monad keeper. It chooses when to trigger a rule, never participants,
// scores or winners. Every write uses the existing sole operator nonce journal.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,custom,decodeAbiParameters,getAbiItem,zeroHash,keccak256,stringToHex,type Address,type Abi} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegations} from '../shared/rooms-hub';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {agentPublishedRatingsAbi as ratingsAbi} from '../shared/abi-AgentPublishedRatings';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {agentChallengesAbi as challengeAbi} from '../shared/abi-AgentChallenges';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {measuredFetch} from '../shared/rpc-metrics';
import {initializeReusableResultArchive,createReusableResultArchive} from '../relayer/src/reusable-result-archive';
import {qualificationWork,historicalRepairWork,expiredChallenge,capturedTournamentWork,tournamentDue,pinnedReads,controlPlaneAnswers,writeRetryMs,inspectionSchedule} from '../relayer/src/agents/pool-maintenance';
import {DEAD_ARENA_MS,DEAD_ARENA_MIN_EPOCH_SECONDS,replacementBudget,verifiedRecovery,type ArenaRecoveryWindow} from '../shared/arena-replacement';
import {loadReusableRuntime} from '../relayer/src/agents/reusable-runtime';
import {validateReusableBudget,reusableAdmissionBudget,reusableCapacity,type ReusablePublicationBudget} from '../relayer/src/agents/reusable-budget';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {overdueAgentPublication} from '../relayer/src/agents/reusable-recovery';
import {verifyHouseInstanceAuthorities,agentPoolAdmissionAbi,deferReserveEnable} from '../shared/agent-house-instances';
import {arenaRenewalExclusions} from '../shared/arena-renewal-policy';
import {keeperLoop} from '../shared/keeper-loop';
import {keeperRolePolicy,type AgentKeeperRole} from '../shared/agent-keeper-role';
import {agentContinuationAbi,localTournamentCursor,ratingContinuationWork,ratingFinalityPage} from '../shared/agent-continuation';
type Ref={chainId:bigint;arena:Address;epoch:bigint;id:bigint};
// Process-relative setup times, logged only when profiling is enabled.
const boot:[string,number][]=[['imports',Math.round(performance.now())]];
// A pre-started step (agent-reusable-process.mjs) loads its modules while the
// previous step is still running or pausing, then waits here for its turn. Nothing
// above this line reads chain state, holds a lock or writes.
if(process.env.PONG_KEEPER_PRESTARTED==='1'&&process.send){
 const turn=new Promise(resolve=>process.once('message',resolve));process.send('ready');await turn;process.disconnect();
 boot.push(['released',Math.round(performance.now())]);
}
const {record:r,prefix,stateFile:legacyFile}=await loadReusableRuntime('keeper'),m={...r.common,houseInstances:r.houseInstances,maxMatches:r.maxMatches??2};
const role=(process.env.PONG_AGENT_KEEPER_ROLE??'legacy') as AgentKeeperRole|'legacy';
assert(['legacy','admission','maintenance','archive'].includes(role));
assert(m.maxMatches===5?role!=='legacy':role==='legacy'||role==='archive','Five-lane services require separate scoped roles');
const jobsPrefix=prefix+'-maintenance'+(role==='legacy'?'':'-'+role),file=role==='legacy'?legacyFile:legacyFile.replace(/\.json$/,`-${role}.json`);
const doesAdmission=role==='legacy'||role==='admission',doesMaintenance=role==='legacy'||role==='maintenance',doesArchive=role==='legacy'||role==='archive';
const laneNumbers=Array.from({length:m.maxMatches},(_,i)=>i),currentPoolAbi:Abi=[...poolAbi,...agentPoolAdmissionAbi];
boot.push(['runtime',Math.round(performance.now())]);
const currentRatingsAbi:Abi=[...ratingsAbi,...agentContinuationAbi];
const contracts={pool:{address:m.pool,abi:currentPoolAbi},tournaments:{address:m.tournaments,abi:bookAbi},ratings:{address:m.ratings,abi:currentRatingsAbi},challenges:{address:m.challenges,abi:challengeAbi}};
const scope=role==='legacy'?undefined:{keyFile:process.env.PONG_AGENT_ROLE_KEY_FILE!,address:process.env.PONG_AGENT_ROLE_ADDRESS! as Address,
 allowCall:keeperRolePolicy(role,contracts,BigInt(process.env.PONG_AGENT_MAX_OPENING_WEI??'0'))};
const metrics=await agentMetrics('/diagnostics/reusable',role==='legacy'?'lifecycle':role),t=await chainTools(jobsPrefix,measuredFetch('monad'),scope);
boot.push(['chain-tools',Math.round(performance.now())]);
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:3});await initializeReusableResultArchive(db);
boot.push(['archive-init',Math.round(performance.now())]);
const archive=createReusableResultArchive(db),guard=await t.db.connect();let locked=false;
boot.push(['guard',Math.round(performance.now())]);
let state:{sequence:number;retry?:Record<string,number>;sourceFinalityScanAt?:number;sourceFinalityCursor?:bigint;qualificationCursor?:bigint;challengeCursor?:bigint;history?:{id:bigint;index:number};
 archiveCursor?:{app:string;epoch:string;id:string};intent?:{to:Address;method:string;args:any[];value:bigint};
 verifiedRecovery?:Record<string,ArenaRecoveryWindow>;recoveredAt?:Record<string,number>;deadSince?:Record<string,number>;replaced?:Record<string,number[]>;replacementAlerted?:Record<string,number>}={sequence:0};
const save=async()=>{await writeFile(file+'.next',JSON.stringify(state,(_,v)=>typeof v==='bigint'?{bigint:String(v)}:v),{mode:0o600});await rename(file+'.next',file);};
const abiFor=(at:Address):Abi=>at===m.hub?hubAbi:at===m.pool?currentPoolAbi:at===m.tournaments?bookAbi:at===m.ratings?currentRatingsAbi:at===m.challenges?challengeAbi:at===m.verifier?verifierAbi:catalogAbi;
const cooling=(to:Address,method:string)=>(state.retry?.[`${to.toLowerCase()}:${method}`]??0)>Date.now();
async function act(to:Address,method:string,args:any[]=[],value=0n){
 state.intent={to,method,args,value};await save();let receipt;
 try{receipt=await t.write(`step-${state.sequence}`,to,abiFor(to),method,args,value);}
 catch(e){
  const job=(await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[`${jobsPrefix}:step-${state.sequence}`])).rows[0];
  // No signed record or an exact reverted receipt can retire this intention.
  // A missing receipt keeps the exact operation and nonce for the next process.
  if(!job||job.status==='failed'){state.sequence++;delete state.intent;state.retry??={};state.retry[`${to.toLowerCase()}:${method}`]=Date.now()+(job?30000:writeRetryMs(e));await save();}
  throw e;
 }
 state.sequence++;delete state.intent;await save();console.log(JSON.stringify({at:new Date().toISOString(),pool:m.pool,action:method,hash:receipt.transactionHash}));
}
// Same paced transport and no retries, plus Multicall3 batching: reads started
// together travel as one eth_call. Writes and raw requests still use t.base.
const reader=createPublicClient({chain:t.base.chain,transport:custom({request:(args:any)=>t.base.request(args)},{retryCount:0}),batch:{multicall:{wait:5,batchSize:16384}}});
// Operator profiling: create /state/profile to log one timing line per step.
// The flag only adds a log line; it never changes what the keeper does.
const profile=await readFile('/state/profile','utf8').then(()=>({start:performance.now(),marks:[] as [string,number][],reads:new Map<string,{n:number;ms:number}>()}),()=>null);
const mark=(label:string)=>{if(profile)profile.marks.push([label,Math.round(performance.now()-profile.start)]);};
const inspections=inspectionSchedule();
async function step(){
 if(state.intent){const i=state.intent;await act(i.to,i.method,i.args,i.value);return;}
 const block=await t.base.getBlock({includeTransactions:false});
 mark('block');
 const pinned=pinnedReads(async(address,abi,functionName,args)=>{
  const began=performance.now();
  try{return await reader.readContract({address,abi,functionName,args,blockNumber:block.number});}
  finally{if(profile){const e=profile.reads.get(functionName)??{n:0,ms:0};e.n++;e.ms+=performance.now()-began;profile.reads.set(functionName,e);}}
 });
 const read=pinned.read;
 const delegationRead=readHubDelegations(t.base,m.hub,r.arenas.map((a:any)=>a.app),block.number);
 delegationRead.catch(()=>{});
 const authorityRead=verifyHouseInstanceAuthorities(read,m);authorityRead.catch(()=>{});
 // Start the common path's independent reads together. They are exactly the
 // values the logic below reads at this block; the batch makes them one call.
 pinned.prefetch(m.pool,poolAbi,'verifier');
 for(const l of laneNumbers)pinned.prefetch(m.pool,poolAbi,'laneRecord',[l]);
 if(doesArchive)pinned.prefetch(m.ratings,ratingsAbi,'buildGeneration');
 pinned.prefetch(m.pool,poolAbi,'admissions');
 pinned.prefetch(m.tournaments,bookAbi,'admissions');
 pinned.prefetch(m.tournaments,bookAbi,'nextAt');
 pinned.prefetch(m.challenges,challengeAbi,'qualificationsMayStart');
 if(doesMaintenance||doesArchive)for(const a of r.arenas){pinned.prefetch(m.pool,poolAbi,'arenaMatch',[a.app]);pinned.prefetch(a.app,arenaAbi,'currentMatch');}
 if(doesArchive&&state.history){pinned.prefetch(m.tournaments,bookAbi,'tournament',[state.history.id]);pinned.prefetch(m.tournaments,bookAbi,'fixture',[state.history.id,state.history.index]);}
 read<bigint>(m.tournaments,bookAbi,'count').then(count=>{if(count)pinned.prefetch(m.tournaments,bookAbi,'tournament',[count]);}).catch(()=>{});
 if(role==='admission'||role==='maintenance')pinned.prefetch(m.pool,agentPoolAdmissionAbi,role+'Operator');
 if(r.continuation){pinned.prefetch(m.tournaments,agentContinuationAbi,'inheritedCount');pinned.prefetch(m.tournaments,agentContinuationAbi,'predecessor');}
 const inherited=r.continuation?await read<bigint>(m.tournaments,agentContinuationAbi,'inheritedCount'):0n;
 if(r.continuation){
  const prior=await read<Address>(m.tournaments,agentContinuationAbi,'predecessor');
  assert.equal(prior.toLowerCase(),r.continuation.tournaments.toLowerCase(),'Tournament predecessor mismatch');
  if(doesArchive){const correction=await ratingContinuationWork(read,m.ratings,r.continuation.ratings,ratingsAbi);
   if(correction){if(!cooling(correction.to,correction.method)){
    await act(correction.to,correction.method,correction.args);state.sourceFinalityScanAt=Date.now()+60_000;await save();
   }return;}}
 }
 await authorityRead;
 if(role==='admission'||role==='maintenance'){const expected=await read<Address>(m.pool,agentPoolAdmissionAbi,role+'Operator');assert.equal(expected.toLowerCase(),t.account.address.toLowerCase(),'Keeper signer differs from contract role');}
 assert.equal((await read<Address>(m.pool,poolAbi,'verifier')).toLowerCase(),m.verifier.toLowerCase());
 let budget:ReusablePublicationBudget|undefined;
 try{budget=validateReusableBudget(JSON.parse(await readFile('/metadata/reusable-budget.json','utf8')),r.arenas.map((a:any)=>a.runtimeHash));}
 catch(e){if((e as any).code!=='ENOENT')console.error(JSON.stringify({event:'admissions-budget-unavailable',error:clean(e)}));}
 mark('authority');
 const lanes=await Promise.all(laneNumbers.map(l=>read(m.pool,poolAbi,'laneRecord',[l])));
 // Everything capture() reads depends only on ref: start those reads together.
 const warmCapture=(ref:Ref)=>{pinned.prefetch(m.pool,poolAbi,'record',[ref]);pinned.prefetch(m.pool,poolAbi,'ticketOf',[ref]);
  pinned.prefetch(m.verifier,verifierAbi,'currentRoot',[ref.arena,ref.epoch]);pinned.prefetch(m.pool,poolAbi,'result',[ref]);};
 async function capture(ref:Ref){
  warmCapture(ref);
  const entry=await read(m.pool,poolAbi,'record',[ref]);if(!entry.ref.id)return false;
  const [ticket]=await read(m.pool,poolAbi,'ticketOf',[ref]),[root,finality]=await read(m.verifier,verifierAbi,'currentRoot',[ref.arena,ref.epoch]);
  if(root.count<ticket.sequence){if(finality&&!entry.captured&&!cooling(m.pool,'captureMissing')){await act(m.pool,'captureMissing',[ref]);return true;}return false;}
  const proof=await archive.proof({chainId:10143n,arena:ref.arena,epoch:ref.epoch},{root:root.hash,count:root.count},ref.id);
  const complete=decodeAbiParameters(getAbiItem({abi:arenaAbi,name:'publishedResult'}).outputs,proof.canonical)[0];
  const previous=entry.captured?await read(m.pool,poolAbi,'result',[ref]):null;
  if(!previous||previous.hash!==complete.match_.hash||previous.status!==complete.match_.status||previous.finality!==finality){
   if(cooling(m.pool,'captureProof'))return false;
   await act(m.pool,'captureProof',[ref,complete,proof.siblings]);return true;
  }return false;
 }
 // Observe and settle before considering admissions or a publication budget.
 if(doesArchive)for(const row of lanes)if(row.ref.id>0n){try{if(await capture(row.ref))return;}catch(e){
  if(state.intent)throw e;
  console.error(JSON.stringify({at:new Date().toISOString(),arena:row.ref.arena,id:String(row.ref.id),event:'publication-proof-pending',error:clean(e)}));
 }}
 mark('lane-capture');
 const observedDelegations=await delegationRead;
 const delegations:{app:Address;d:typeof observedDelegations[number]}[]=r.arenas.map((a:any,i:number)=>({app:a.app as Address,d:observedDelegations[i]}));
 if(doesMaintenance)for(const {app,d} of delegations){
  if(d.status===0&&!cooling(m.pool,'recoverReleased')){
   const [epoch]=await read(app,arenaAbi,'resultCommitment');
   if(epoch>0n){
    const [sealed]=await read(m.verifier,verifierAbi,'finalizedRoots',[app,epoch]);
    const [,id]=await read(app,arenaAbi,'currentMatch');
    const unfinished=id>0n&&(await read(app,arenaAbi,'getSnapshot',[id])).phase<3n;
    if(sealed===zeroHash||unfinished){await act(m.pool,'recoverReleased',[app]);return;}
   }
  }
  if(d.status===2&&block.timestamp>=d.stakeUnlockAt&&!cooling(m.pool,'releaseArena')){await act(m.pool,'releaseArena',[app]);return;}
  if(d.status===1&&block.timestamp>=d.expiresAt&&!cooling(m.pool,'recoverExpired')){await act(m.pool,'recoverExpired',[app]);return;}
  const reservation=lanes.find(row=>row.ref.id>0n&&row.ref.arena.toLowerCase()===app.toLowerCase());
  const occupied=!!reservation;
  // Terminal engine results may remain unpublished even while /health says
  // OK. Keep their archive and recover only after the real protocol deadline.
  // A new ticket after a long idle interval must never close immediately.
  if(role==='legacy'&&d.status===1&&reservation&&!cooling(m.hub,'forceClose')){
   const [ticket]=await read(m.pool,poolAbi,'ticketOf',[reservation.ref]);
   if(ticket.matchId!==reservation.ref.id||ticket.epoch!==reservation.ref.epoch)throw Error('Reservation ticket identity changed');
   const commitment=await read(app,arenaAbi,'resultCommitment');
   if(overdueAgentPublication({...d,app},ticket,commitment,block.timestamp)){
    await act(m.hub,'forceClose',[app,zeroHash]);return;
   }
  }
  // An active or unpublished game never migrates to a different arena.
  if(d.status===1&&!occupied&&(d.expiresAt<=block.timestamp+420n||budget&&!reusableAdmissionBudget(budget,d.batchIndex,d.expiresAt,block.timestamp))&&!cooling(m.pool,'closeReusableArena')){
   await act(m.pool,'closeReusableArena',[app]);return;
  }
 }
 mark('arena-lifecycle');
 if(doesArchive&&await read<bigint>(m.ratings,ratingsAbi,'buildGeneration')){if(!cooling(m.ratings,'rebuild'))await act(m.ratings,'rebuild',[32n]);return;}
 // Result capture releases the lane, but nextFixture still waits for the
 // tournament ledger. Do not bury this current result in a rotating scan of
 // all historical fixtures (minutes of artificial downtime in a league).
 if(doesArchive)for(const {app} of delegations){
  const key=await read(m.pool,poolAbi,'arenaMatch',[app]);if(key===zeroHash)continue;
  const [epoch,id]=await read(app,arenaAbi,'currentMatch');if(!id)continue;
  const record=await read(m.pool,poolAbi,'record',[{chainId:10143n,arena:app,epoch,id}]);
  const work=await capturedTournamentWork(read,m,record);
  if(work&&!cooling(work.to,work.method)){await act(work.to,work.method,work.args);return;}
 }
 // Read-only finality inspection follows current result capture. Historical
 // records that have not changed neither hold current lanes nor spend gas.
 if(doesArchive&&r.continuation&&(state.sourceFinalityScanAt??0)<=Date.now()){
  const page=await ratingFinalityPage(read,m.ratings,r.continuation.ratings,ratingsAbi,state.sourceFinalityCursor??0n);
  if(page.changed){
   if(!cooling(m.ratings,'synchronizeHistory'))await act(m.ratings,'synchronizeHistory',[32]);
   return;
  }
  state.sourceFinalityCursor=page.next;state.sourceFinalityScanAt=Date.now()+60_000;await save();
 }
 // Old finality/correction proofs stay resumable, but do not occupy every
 // operator step before an available next match. Current lane capture, release,
 // nonce recovery and rating rebuilds above always retain priority.
 mark('captured-work');
 const archiveHistory=async()=>{
  if(!doesArchive)return;
  const cursor=state.archiveCursor??{app:'',epoch:'0',id:'0'};
  const history=(await db.query(`SELECT app,epoch,match_id FROM (
  SELECT DISTINCT app,epoch,match_id FROM il_reusable_results WHERE chain_id=10143
  UNION SELECT DISTINCT app,epoch,match_id FROM il_reusable_slot_results WHERE chain_id=10143) records
  WHERE (app,epoch,match_id)>($1,$2::numeric,$3::numeric) ORDER BY app,epoch,match_id LIMIT 3`,[cursor.app,cursor.epoch,cursor.id])).rows;
  if(!history.length){delete state.archiveCursor;await save();}
  for(const row of history)if(r.arenas.some((a:any)=>a.app.toLowerCase()===row.app))warmCapture({chainId:10143n,arena:row.app,epoch:BigInt(row.epoch),id:BigInt(row.match_id)});
  for(const row of history){state.archiveCursor={app:row.app,epoch:String(row.epoch),id:String(row.match_id)};await save();
   if(!r.arenas.some((a:any)=>a.app.toLowerCase()===row.app))continue;
   try{if(await capture({chainId:10143n,arena:row.app,epoch:BigInt(row.epoch),id:BigInt(row.match_id)}))return;}
   catch(e){if(state.intent)throw e;console.error(JSON.stringify({event:'historical-proof-pending',arena:row.app,error:clean(e)}));}
  }
 };
 const tournamentHistory=async(count:bigint,available:boolean,laneFree:boolean)=>{
  for(let checked=0;count>inherited&&checked<3;checked++){
   const cursor=localTournamentCursor(count,inherited,state.history)!,tournament=await read(m.tournaments,bookAbi,'tournament',[cursor.id]);
   state.history=cursor.index+1<(tournament.league?28:7)?{id:cursor.id,index:cursor.index+1}:{id:cursor.id>inherited+1n?cursor.id-1n:count,index:0};await save();
   for(let k=1;checked+k<3&&cursor.index+k<(tournament.league?28:7);k++)pinned.prefetch(m.tournaments,bookAbi,'fixture',[cursor.id,cursor.index+k]);
   if(cursor.index===0&&(cursor.id<count||tournament.status===4)){
    const repair=await historicalRepairWork(read,m,cursor.id,tournament,available?1n:0n,laneFree);
    if(repair&&(repair.method==='admitTournament'?doesAdmission:doesArchive)&&!cooling(repair.to,repair.method)){await act(repair.to,repair.method,repair.args);return true;}
   }
   const f=await read(m.tournaments,bookAbi,'fixture',[cursor.id,cursor.index]);if(!f.bound)continue;
   pinned.prefetch(m.pool,poolAbi,'result',[f.ref]);
   if(!(await read(m.pool,poolAbi,'record',[f.ref])).captured)continue;
   const result=await read(m.pool,poolAbi,'result',[f.ref]);
   if(doesArchive&&(result.hash!==f.published.hash||result.finality!==f.published.finality||result.status!==f.published.status)&&!cooling(m.tournaments,'synchronize')){await act(m.tournaments,'synchronize',[cursor.id,cursor.index]);return true;}
   if(doesArchive&&!f.resolved&&f.published.status===4&&f.published.finality&&!cooling(m.tournaments,'retryCancelled')){await act(m.tournaments,'retryCancelled',[cursor.id,cursor.index]);return true;}
  }
  return false;
 };
 // Historical capture/correction remains active with admissions closed and no
 // publication budget, including the retired predecessor after migration.
 if(role==='archive'){
  if(!await tournamentHistory(await read<bigint>(m.tournaments,bookAbi,'count'),false,false))await archiveHistory();
  return;
 }
 // A missing worst-case proof holds NEW admissions only. Recovery above is
 // deliberately still live while qualification or the provider is unavailable.
 mark('recovery');
 if(!budget){await archiveHistory();return;}
 const privateSetup=process.env.PONG_REUSABLE_AGENT_RUNTIME!=='reviewed-release';
 const admissions=await read<boolean>(m.pool,poolAbi,'admissions');
 if(role==='legacy'&&privateSetup&&!admissions&&process.env.PONG_REUSABLE_AGENT_START==='1'&&!cooling(m.pool,'setAdmissions')){await act(m.pool,'setAdmissions',[true]);return;}
 if(!admissions){await archiveHistory();return;}
 if(role==='legacy'&&privateSetup&&process.env.PONG_REUSABLE_AGENT_CHALLENGES==='1'&&!await read<boolean>(m.challenges,challengeAbi,'admissions')){await act(m.challenges,'setAdmissions',[true]);return;}
 // Review after recovery and reconciliation. Retiring owned capacity never
 // bypasses an uncertain transaction or the existing close/release sequence.
 let renewalExclusions:ReadonlySet<string>=new Set();
 try{renewalExclusions=arenaRenewalExclusions(JSON.parse(await readFile('/metadata/renewal-policy.json','utf8')),m.pool,r.arenas.map((a:any)=>a.app));}
 catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const active=delegations.filter(x=>x.d.status===1&&x.d.expiresAt>block.timestamp+420n);
 const hosted=(await db.query("SELECT app,stage,detail FROM agent_pool.health WHERE updated_at>now()-interval '15 seconds'")).rows;
 const serving=(a:{app:Address;d:{epoch:bigint}})=>hosted.some(h=>h.app===a.app.toLowerCase()&&['available','playing','awaiting-publication','publisher-unfunded'].includes(h.stage)&&String(h.detail.epoch)===String(a.d.epoch));
 const capacity=reusableCapacity(budget,active.map(a=>({app:a.app,batches:a.d.batchIndex,expires:a.d.expiresAt,
  occupied:lanes.some(l=>l.ref.id>0n&&l.ref.arena.toLowerCase()===a.app.toLowerCase()),serving:serving(a)})),block.timestamp);
 // Prepare one actually usable reserve. Unavailable engines cannot suppress
 // opening a released spare just because their hub status is still Active.
 const reserveTarget=m.maxMatches+1;
 if(doesMaintenance&&capacity.ready.length<reserveTarget&&!cooling(m.pool,'openReusableArena')){
  for(const {app,d} of delegations)if(d.status===0&&!renewalExclusions.has(app.toLowerCase())){
   const match=await read(m.pool,poolAbi,'arenaMatch',[app]);
   if(match!==zeroHash&&lanes.some(l=>l.ref.arena.toLowerCase()===app.toLowerCase()&&l.ref.id>0n))continue;
   const validator=await read(m.hub,hubAbi,'defaultValidator'),terms=await read(m.hub,hubAbi,'termsOf',[validator]);
   try{await act(m.pool,'openReusableArena',[app],terms.delegationFee);return;}
   catch(e){
    // A refused reserve opening must not suppress games on admitted arenas.
    // An uncertain signed transaction retains its intent and stops this step.
    if(state.intent)throw e;
    console.error(JSON.stringify({at:new Date().toISOString(),event:'reserve-opening-delayed',arena:app,error:clean(e)}));
    break;
   }
  }
 }
 mark('reserve');
 // Replace an idle arena whose engine never comes back while Interlude answers
 // (shared/arena-replacement.ts). Only a fresh report from the engines process
 // counts: a silent engines process is its own outage, not three dead arenas.
 if(doesMaintenance){
  const now=Date.now(),dead=state.deadSince??={},replaced=state.replaced??={},alerted=state.replacementAlerted??={};
  state.verifiedRecovery??={};state.recoveredAt??={};
  for(const a of active){const key=a.app.toLowerCase(),progress=verifiedRecovery(state.verifiedRecovery[key],{epoch:a.d.epoch,batches:a.d.batchIndex,healthy:serving(a),now});
   if(progress.window)state.verifiedRecovery[key]=progress.window;else delete state.verifiedRecovery[key];
   if(progress.recoveredAt){state.recoveredAt[key]=progress.recoveredAt;delete alerted[key];}
  }
  const idleNow=active.filter(x=>!lanes.some(l=>l.ref.id>0n&&l.ref.arena.toLowerCase()===x.app.toLowerCase()));
  for(const key of Object.keys(dead))if(!idleNow.some(a=>a.app.toLowerCase()===key))delete dead[key];
  for(const a of idleNow){
   const key=a.app.toLowerCase();
   if(serving(a)||!hosted.some(h=>h.app===key)){delete dead[key];continue;}
   dead[key]??=now;
   if(now-dead[key]<DEAD_ARENA_MS)continue;
   const opening=await t.base.getBlock({blockNumber:a.d.baseBlock,includeTransactions:false});
   if(block.timestamp-opening.timestamp<DEAD_ARENA_MIN_EPOCH_SECONDS)continue;
   const {recent,allowed}=replacementBudget(replaced[key],now,state.recoveredAt[key]);
   if(!allowed){
    if(!alerted[key]){alerted[key]=now;console.warn(JSON.stringify({at:new Date().toISOString(),event:'arena-replacement-exhausted',arena:a.app,epoch:String(a.d.epoch),since:new Date(dead[key]).toISOString()}));}
    continue;
   }
   if(cooling(m.pool,'closeReusableArena')||!await controlPlaneAnswers(a.app))continue;
   const since=dead[key];replaced[key]=[...(replaced[key]??[]),now];delete dead[key];delete alerted[key];await save();
   console.warn(JSON.stringify({at:new Date().toISOString(),event:'arena-replaced-unhealthy',arena:a.app,epoch:String(a.d.epoch),since:new Date(since).toISOString()}));
   await act(m.pool,'closeReusableArena',[a.app]);return;
  }
  await save();
 }
 if(doesMaintenance&&capacity.ready.length>=reserveTarget&&!cooling(m.pool,'closeReusableArena')){
  const candidates=active.filter(x=>!lanes.some(l=>l.ref.id>0n&&l.ref.arena.toLowerCase()===x.app.toLowerCase())).sort((a,b)=>a.d.baseBlock<b.d.baseBlock?-1:1);
  for(const candidate of candidates){
   const opening=await t.base.getBlock({blockNumber:candidate.d.baseBlock,includeTransactions:false});
   const leading=candidate.d.expiresAt<=block.timestamp+BigInt(budget.rotationLeadSeconds);
   // Age alone is a voluntary rotation: never retire a healthy arena into an
   // epoch that Interlude's control plane cannot host right now.
   if(leading||block.timestamp-opening.timestamp>=BigInt(budget.serviceSeconds)&&await controlPlaneAnswers(candidate.app)){
    await act(m.pool,'closeReusableArena',[candidate.app]);return;
   }
  }
 }
 mark('rotation');
 if(role==='maintenance')return;
 const healthy=(await db.query("SELECT app,detail FROM agent_pool.health WHERE stage='available' AND updated_at>now()-interval '15 seconds'")).rows;
 // The contract picks the newest idle arena. Require every potentially chosen
 // idle arena to satisfy the measured budget, rather than assuming it picks ours.
 const idle=active.filter(x=>!lanes.some(l=>l.ref.id>0n&&l.ref.arena.toLowerCase()===x.app.toLowerCase()));
 const eligible=(x:typeof idle[number])=>reusableAdmissionBudget(budget,x.d.batchIndex,x.d.expiresAt,block.timestamp)
  &&healthy.some(h=>h.app===x.app.toLowerCase()&&BigInt(h.detail.epoch)===x.d.epoch);
 const challengeLaneFree=lanes.slice(1).some(l=>l.ref.id===0n);
 const waitingChallenge=challengeLaneFree&&!await read<boolean>(m.challenges,challengeAbi,'qualificationsMayStart');
 if(doesAdmission&&m.maxMatches===5){
  const gates=await Promise.all(delegations.filter(x=>x.d.status===1).map(async x=>{
   // The contract alone selects the arena. Gate updates cannot move active games.
   const occupied=lanes.some(l=>l.ref.id>0n&&l.ref.arena.toLowerCase()===x.app.toLowerCase());
   const prior=await read<boolean>(m.pool,agentPoolAdmissionAbi,'arenaAdmissionEnabled',[x.app,x.d.epoch]);
   const enabled=occupied?prior:idle.some(a=>a.app===x.app)&&eligible(x);
   return {app:x.app,epoch:x.d.epoch,enabled,prior,ready:!occupied&&prior&&enabled};
  }));
  const pending=gates.filter(x=>x.enabled!==x.prior);
  if(pending.length&&!deferReserveEnable(pending,waitingChallenge,gates.some(x=>x.ready))){
   if(!cooling(m.pool,'setArenaAdmissions'))await act(m.pool,'setArenaAdmissions',[
    pending.map(x=>x.app),pending.map(x=>x.epoch),pending.map(x=>x.enabled),keccak256(stringToHex('PONGIT_VERIFIED_NODE_AND_PUBLICATION_V1'))]);
   return;
  }
 }
 const available=idle.length>0&&(m.maxMatches===5?idle.some(eligible):idle.every(eligible));
 const laneFree=lanes[0].ref.id===0n,count=await read<bigint>(m.tournaments,bookAbi,'count');
 mark('available');
 // A player waiting on a challenge comes before background bookkeeping: history
 // repairs and tournaments use lane 0 and wait one step at most. The unchanged
 // lane 1 section below still handles qualifications and cooldowns.
 if(doesAdmission&&available&&waitingChallenge&&!cooling(m.pool,'admitChallenge')){
  await act(m.pool,'admitChallenge');return;
 }
 // Expiry and historical scans cannot delay an eligible waiting player. The
 // contract still validates every request and advances its bounded cursor.
 if(doesAdmission&&inspections.due('expiry')){const expired=await expiredChallenge(read,m,state.challengeCursor??1n);state.challengeCursor=expired.next;await save();inspections.completed('expiry');
 if(expired.expired!==null&&!cooling(m.challenges,'expire')){await act(m.challenges,'expire',[expired.expired]);return;}}
 mark('expired-challenge');
 if((doesArchive||available&&laneFree)&&await tournamentHistory(count,available,laneFree))return;
 mark('history-walk');
 if(!available){await archiveHistory();return;}
 const bookOpen=await read<boolean>(m.tournaments,bookAbi,'admissions');
 if(role==='legacy'&&privateSetup&&process.env.PONG_REUSABLE_AGENT_TOURNAMENTS==='1'&&!bookOpen){
  const identities=await Promise.all(r.bots.map((b:any)=>read(m.catalog,catalogAbi,'identity',[b.agent])));
  if(identities.every(x=>x.qualified===3)){await act(m.tournaments,'setAdmissions',[true]);return;}
 }
 if(bookOpen){
  const last=count>inherited?await read(m.tournaments,bookAbi,'tournament',[count]):null;
  if(!last||last.status===3||last.status===4){
   if(tournamentDue(last,await read<bigint>(m.tournaments,bookAbi,'nextAt'),block.timestamp)){await act(m.tournaments,'begin');return;}
  }
  else if(last.status===1){
   if(last.cursor<last.scanCount||last.catalogRevision!==await read(m.catalog,catalogAbi,'revision')){await act(m.tournaments,'select',[count,32]);return;}
  }else if(laneFree&&!cooling(m.pool,'admitTournament')){const [index]=await read(m.tournaments,bookAbi,'nextFixture',[count]);if(index!==255){await act(m.pool,'admitTournament',[count]);return;}}
 }
 mark('tournaments');
 if(challengeLaneFree){
  if(!await read<boolean>(m.challenges,challengeAbi,'qualificationsMayStart')){
   if(!cooling(m.pool,'admitChallenge'))await act(m.pool,'admitChallenge');else await archiveHistory();return;
  }
  mark('challenge');
  if(!inspections.due('qualification'))return;
  const newestBase=idle.reduce((n,a)=>a.d.baseBlock>n?a.d.baseBlock:n,0n);
  const work=await qualificationWork(read,m,state.qualificationCursor??0n,block.timestamp,16,newestBase);state.qualificationCursor=work.next;await save();inspections.completed('qualification');
  if(work.needed&&!cooling(m.pool,'admitQualification')){await act(m.pool,'admitQualification');return;}
 }
 mark('qualification');
 await archiveHistory();
}
function clean(e:any){return String(e?.shortMessage??e?.message??'Reusable keeper unavailable').split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220);}
try{
 locked=(await guard.query('SELECT pg_try_advisory_lock(hashtextextended($1,701354)) AS ok',[role==='legacy'?prefix:jobsPrefix])).rows[0].ok;assert(locked,'Another keeper owns this state');
 try{state=JSON.parse(await readFile(file,'utf8'),(_,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&typeof v.bigint==='string'?BigInt(v.bigint):v);}catch(e){if((e as any).code!=='ENOENT')throw e;}
 if(process.env.PONG_KEEPER_PERSISTENT==='1'){
  const stop=new AbortController(),shutdown=()=>stop.abort();let lastFailure='';
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
  try{await keeperLoop({signal:stop.signal,step:async()=>{
   if(profile){profile.start=performance.now();profile.marks.length=0;profile.reads.clear();}
   try{await step();}finally{if(profile)console.log(JSON.stringify({event:'keeper-step-profile',role,at:new Date().toISOString(),totalMs:Math.round(performance.now()-profile.start),marks:profile.marks}));}
  },onFailure:(e,retryMs)=>{
   const reason=clean(e);if(reason!==lastFailure)console.error(JSON.stringify({at:new Date().toISOString(),pool:m.pool,event:'keeper-waiting',reason,retryMs}));lastFailure=reason;
  },onRecovery:()=>{lastFailure='';console.log(JSON.stringify({at:new Date().toISOString(),pool:m.pool,event:'keeper-recovered'}));}});}
  finally{process.removeListener('SIGTERM',shutdown);process.removeListener('SIGINT',shutdown);}
 }else await step();
}catch(e){console.error(JSON.stringify({at:new Date().toISOString(),pool:m.pool,error:clean(e)}));process.exitCode=1;}
finally{const summary=profile?{event:'keeper-step-profile',at:new Date().toISOString(),boot,startMs:Math.round(profile.start),totalMs:Math.round(performance.now()-profile.start),marks:profile.marks,
 reads:[...profile.reads].sort((a,b)=>b[1].ms-a[1].ms).slice(0,10).map(([name,v])=>[name,v.n,Math.round(v.ms)])}:null;
 const down=performance.now();
 if(locked)await guard.query('SELECT pg_advisory_unlock(hashtextextended($1,701354))',[role==='legacy'?prefix:jobsPrefix]);guard.release();await metrics();await db.end();await t.close();if(summary)console.log(JSON.stringify({...summary,teardownMs:Math.round(performance.now()-down)}));}
