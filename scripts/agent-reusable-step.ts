// Common Monad keeper. It chooses when to trigger a rule, never participants,
// scores or winners. Every write uses the existing sole operator nonce journal.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,custom,decodeAbiParameters,getAbiItem,zeroHash,type Address,type Abi} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
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
import {qualificationWork,historicalRepairWork,expiredChallenge,capturedTournamentWork,tournamentDue,pinnedReads} from '../relayer/src/agents/pool-maintenance';
import {loadReusableRuntime} from '../relayer/src/agents/reusable-runtime';
import {validateReusableBudget,reusableAdmissionBudget,type ReusablePublicationBudget} from '../relayer/src/agents/reusable-budget';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {overdueAgentPublication} from '../relayer/src/agents/reusable-recovery';
import {verifyHouseInstanceAuthorities} from '../shared/agent-house-instances';
import {arenaRenewalExclusions} from '../shared/arena-renewal-policy';
type Ref={chainId:bigint;arena:Address;epoch:bigint;id:bigint};
const {record:r,prefix,stateFile:file}=await loadReusableRuntime('keeper'),m={...r.common,houseInstances:r.houseInstances};
const metrics=await agentMetrics('/diagnostics/reusable','lifecycle'),t=await chainTools(prefix+'-maintenance',measuredFetch('monad'));
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:3});await initializeReusableResultArchive(db);
const archive=createReusableResultArchive(db),guard=await t.db.connect();let locked=false;
let state:{sequence:number;retry?:Record<string,number>;qualificationCursor?:bigint;challengeCursor?:bigint;history?:{id:bigint;index:number};
 archiveCursor?:{app:string;epoch:string;id:string};intent?:{to:Address;method:string;args:any[];value:bigint}}={sequence:0};
const save=async()=>{await writeFile(file+'.next',JSON.stringify(state,(_,v)=>typeof v==='bigint'?{bigint:String(v)}:v),{mode:0o600});await rename(file+'.next',file);};
const abiFor=(at:Address):Abi=>at===m.hub?hubAbi:at===m.pool?poolAbi:at===m.tournaments?bookAbi:at===m.ratings?ratingsAbi:at===m.challenges?challengeAbi:at===m.verifier?verifierAbi:catalogAbi;
const cooling=(to:Address,method:string)=>(state.retry?.[`${to.toLowerCase()}:${method}`]??0)>Date.now();
async function act(to:Address,method:string,args:any[]=[],value=0n){
 state.intent={to,method,args,value};await save();let receipt;
 try{receipt=await t.write(`step-${state.sequence}`,to,abiFor(to),method,args,value);}
 catch(e){
  const job=(await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[`${prefix}-maintenance:step-${state.sequence}`])).rows[0];
  // No signed record or an exact reverted receipt can retire this intention.
  // A missing receipt keeps the exact operation and nonce for the next process.
  if(!job||job.status==='failed'){state.sequence++;delete state.intent;state.retry??={};state.retry[`${to.toLowerCase()}:${method}`]=Date.now()+30000;await save();}
  throw e;
 }
 state.sequence++;delete state.intent;await save();console.log(JSON.stringify({at:new Date().toISOString(),pool:m.pool,action:method,hash:receipt.transactionHash}));
}
// Same paced transport and no retries, plus Multicall3 batching: reads started
// together travel as one eth_call. Writes and raw requests still use t.base.
const reader=createPublicClient({chain:t.base.chain,transport:custom({request:(args:any)=>t.base.request(args)},{retryCount:0}),batch:{multicall:true}});
async function step(){
 if(state.intent){const i=state.intent;await act(i.to,i.method,i.args,i.value);return;}
 const block=await t.base.getBlock({includeTransactions:false});
 const pinned=pinnedReads((address,abi,functionName,args)=>reader.readContract({address,abi,functionName,args,blockNumber:block.number}));
 const read=pinned.read;
 // Start the common path's independent reads together. They are exactly the
 // values the logic below reads at this block; the batch makes them one call.
 pinned.prefetch(m.pool,poolAbi,'verifier');
 for(const l of [0,1])pinned.prefetch(m.pool,poolAbi,'laneRecord',[l]);
 pinned.prefetch(m.ratings,ratingsAbi,'buildGeneration');
 pinned.prefetch(m.pool,poolAbi,'admissions');
 pinned.prefetch(m.tournaments,bookAbi,'admissions');
 pinned.prefetch(m.tournaments,bookAbi,'nextAt');
 pinned.prefetch(m.challenges,challengeAbi,'qualificationsMayStart');
 for(const a of r.arenas){pinned.prefetch(m.pool,poolAbi,'arenaMatch',[a.app]);pinned.prefetch(a.app,arenaAbi,'currentMatch');}
 if(state.history){pinned.prefetch(m.tournaments,bookAbi,'tournament',[state.history.id]);pinned.prefetch(m.tournaments,bookAbi,'fixture',[state.history.id,state.history.index]);}
 read<bigint>(m.tournaments,bookAbi,'count').then(count=>{if(count)pinned.prefetch(m.tournaments,bookAbi,'tournament',[count]);}).catch(()=>{});
 await verifyHouseInstanceAuthorities(read,m);
 assert.equal((await read<Address>(m.pool,poolAbi,'verifier')).toLowerCase(),m.verifier.toLowerCase());
 let budget:ReusablePublicationBudget|undefined;
 try{budget=validateReusableBudget(JSON.parse(await readFile('/metadata/reusable-budget.json','utf8')),r.arenas.map((a:any)=>a.runtimeHash));}
 catch(e){if((e as any).code!=='ENOENT')console.error(JSON.stringify({event:'admissions-budget-unavailable',error:clean(e)}));}
 const lanes=await Promise.all([0,1].map(l=>read(m.pool,poolAbi,'laneRecord',[l])));
 async function capture(ref:Ref){
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
 for(const row of lanes)if(row.ref.id>0n){try{if(await capture(row.ref))return;}catch(e){
  if(state.intent)throw e;
  console.error(JSON.stringify({at:new Date().toISOString(),arena:row.ref.arena,id:String(row.ref.id),event:'publication-proof-pending',error:clean(e)}));
 }}
 const delegations=await Promise.all(r.arenas.map(async(a:any)=>({app:a.app as Address,d:await readHubDelegation(t.base,m.hub,a.app,block.number)})));
 for(const {app,d} of delegations){
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
  if(d.status===1&&reservation&&!cooling(m.hub,'forceClose')){
   const [ticket]=await read(m.pool,poolAbi,'ticketOf',[reservation.ref]);
   if(ticket.matchId!==reservation.ref.id||ticket.epoch!==reservation.ref.epoch)throw Error('Reservation ticket identity changed');
   const commitment=await read(app,arenaAbi,'resultCommitment');
   if(overdueAgentPublication({app,...d},ticket,commitment,block.timestamp)){
    await act(m.hub,'forceClose',[app,zeroHash]);return;
   }
  }
  // An active or unpublished game never migrates to a different arena.
  if(d.status===1&&!occupied&&(d.expiresAt<=block.timestamp+420n||budget&&!reusableAdmissionBudget(budget,d.batchIndex,d.expiresAt,block.timestamp))&&!cooling(m.pool,'closeReusableArena')){
   await act(m.pool,'closeReusableArena',[app]);return;
  }
 }
 if(await read<bigint>(m.ratings,ratingsAbi,'buildGeneration')){if(!cooling(m.ratings,'rebuild'))await act(m.ratings,'rebuild',[32n]);return;}
 // Result capture releases the lane, but nextFixture still waits for the
 // tournament ledger. Do not bury this current result in a rotating scan of
 // all historical fixtures (minutes of artificial downtime in a league).
 for(const {app} of delegations){
  const key=await read(m.pool,poolAbi,'arenaMatch',[app]);if(key===zeroHash)continue;
  const [epoch,id]=await read(app,arenaAbi,'currentMatch');if(!id)continue;
  const record=await read(m.pool,poolAbi,'record',[{chainId:10143n,arena:app,epoch,id}]);
  const work=await capturedTournamentWork(read,m,record);
  if(work&&!cooling(work.to,work.method)){await act(work.to,work.method,work.args);return;}
 }
 // Old finality/correction proofs stay resumable, but do not occupy every
 // operator step before an available next match. Current lane capture, release,
 // nonce recovery and rating rebuilds above always retain priority.
 const archiveHistory=async()=>{
  const cursor=state.archiveCursor??{app:'',epoch:'0',id:'0'};
  const history=(await db.query(`SELECT app,epoch,match_id FROM (
  SELECT DISTINCT app,epoch,match_id FROM il_reusable_results WHERE chain_id=10143
  UNION SELECT DISTINCT app,epoch,match_id FROM il_reusable_slot_results WHERE chain_id=10143) records
  WHERE (app,epoch,match_id)>($1,$2::numeric,$3::numeric) ORDER BY app,epoch,match_id LIMIT 3`,[cursor.app,cursor.epoch,cursor.id])).rows;
  if(!history.length){delete state.archiveCursor;await save();}
  for(const row of history){state.archiveCursor={app:row.app,epoch:String(row.epoch),id:String(row.match_id)};await save();
   if(!r.arenas.some((a:any)=>a.app.toLowerCase()===row.app))continue;
   try{if(await capture({chainId:10143n,arena:row.app,epoch:BigInt(row.epoch),id:BigInt(row.match_id)}))return;}
   catch(e){if(state.intent)throw e;console.error(JSON.stringify({event:'historical-proof-pending',arena:row.app,error:clean(e)}));}
  }
 };
 const expired=await expiredChallenge(read,m,state.challengeCursor??1n);state.challengeCursor=expired.next;await save();
 if(expired.expired!==null&&!cooling(m.challenges,'expire')){await act(m.challenges,'expire',[expired.expired]);return;}
 // A missing worst-case proof holds NEW admissions only. Recovery above is
 // deliberately still live while qualification or the provider is unavailable.
 if(!budget){await archiveHistory();return;}
 const privateSetup=process.env.PONG_REUSABLE_AGENT_RUNTIME!=='reviewed-release';
 const admissions=await read<boolean>(m.pool,poolAbi,'admissions');
 if(privateSetup&&!admissions&&process.env.PONG_REUSABLE_AGENT_START==='1'&&!cooling(m.pool,'setAdmissions')){await act(m.pool,'setAdmissions',[true]);return;}
 if(!admissions){await archiveHistory();return;}
 if(privateSetup&&process.env.PONG_REUSABLE_AGENT_CHALLENGES==='1'&&!await read<boolean>(m.challenges,challengeAbi,'admissions')){await act(m.challenges,'setAdmissions',[true]);return;}
 // Review after recovery and reconciliation. Retiring owned capacity never
 // bypasses an uncertain transaction or the existing close/release sequence.
 let renewalExclusions:ReadonlySet<string>=new Set();
 try{renewalExclusions=arenaRenewalExclusions(JSON.parse(await readFile('/metadata/renewal-policy.json','utf8')),m.pool,r.arenas.map((a:any)=>a.app));}
 catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const active=delegations.filter(x=>x.d.status===1&&x.d.expiresAt>block.timestamp+420n);
 // Keep an actually admitted third arena, not an imaginary database reserve.
 // Rotate only one early while two others remain; opening all arenas together
 // and waiting until their simultaneous expiry would recreate a global outage.
 if(active.length<3&&!cooling(m.pool,'openReusableArena')){
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
 const hosted=(await db.query("SELECT app,stage,detail FROM agent_pool.health WHERE updated_at>now()-interval '15 seconds'")).rows;
 const ready=active.filter(a=>hosted.some(h=>h.app===a.app.toLowerCase()&&['available','playing','awaiting-publication'].includes(h.stage)&&String(h.detail.epoch)===String(a.d.epoch)));
 if(ready.length>=3&&!cooling(m.pool,'closeReusableArena')){
  const candidates=active.filter(x=>!lanes.some(l=>l.ref.id>0n&&l.ref.arena.toLowerCase()===x.app.toLowerCase())).sort((a,b)=>a.d.baseBlock<b.d.baseBlock?-1:1);
  for(const candidate of candidates){
   const opening=await t.base.getBlock({blockNumber:candidate.d.baseBlock,includeTransactions:false});
   if(block.timestamp-opening.timestamp>=BigInt(budget.serviceSeconds)||candidate.d.expiresAt<=block.timestamp+BigInt(budget.rotationLeadSeconds)){
    await act(m.pool,'closeReusableArena',[candidate.app]);return;
   }
  }
 }
 const healthy=(await db.query("SELECT app,detail FROM agent_pool.health WHERE stage='available' AND updated_at>now()-interval '15 seconds'")).rows;
 // The contract picks the newest idle arena. Require every potentially chosen
 // idle arena to satisfy the measured budget, rather than assuming it picks ours.
 const idle=active.filter(x=>!lanes.some(l=>l.ref.id>0n&&l.ref.arena.toLowerCase()===x.app.toLowerCase()));
 const available=idle.length>0&&idle.every(x=>reusableAdmissionBudget(budget,x.d.batchIndex,x.d.expiresAt,block.timestamp)
  &&healthy.some(h=>h.app===x.app.toLowerCase()&&BigInt(h.detail.epoch)===x.d.epoch));
 const laneFree=lanes[0].ref.id===0n,count=await read<bigint>(m.tournaments,bookAbi,'count');
 for(let checked=0;count>0n&&checked<3;checked++){
  const cursor=state.history&&state.history.id<=count?state.history:{id:count,index:0},tournament=await read(m.tournaments,bookAbi,'tournament',[cursor.id]);
  state.history=cursor.index+1<(tournament.league?28:7)?{id:cursor.id,index:cursor.index+1}:{id:cursor.id>1n?cursor.id-1n:count,index:0};await save();
  if(cursor.index===0&&(cursor.id<count||tournament.status===4)){
   const repair=await historicalRepairWork(read,m,cursor.id,tournament,available?1n:0n,laneFree);
   if(repair&&!cooling(repair.to,repair.method)){await act(repair.to,repair.method,repair.args);return;}
  }
  const f=await read(m.tournaments,bookAbi,'fixture',[cursor.id,cursor.index]);if(!f.bound)continue;
  if(!(await read(m.pool,poolAbi,'record',[f.ref])).captured)continue;
  const result=await read(m.pool,poolAbi,'result',[f.ref]);
  if(result.hash!==f.published.hash||result.finality!==f.published.finality||result.status!==f.published.status){await act(m.tournaments,'synchronize',[cursor.id,cursor.index]);return;}
  if(!f.resolved&&f.published.status===4&&f.published.finality){await act(m.tournaments,'retryCancelled',[cursor.id,cursor.index]);return;}
 }
 if(!available){await archiveHistory();return;}
 const bookOpen=await read<boolean>(m.tournaments,bookAbi,'admissions');
 if(privateSetup&&process.env.PONG_REUSABLE_AGENT_TOURNAMENTS==='1'&&!bookOpen){
  const identities=await Promise.all(r.bots.map((b:any)=>read(m.catalog,catalogAbi,'identity',[b.agent])));
  if(identities.every(x=>x.qualified===3)){await act(m.tournaments,'setAdmissions',[true]);return;}
 }
 if(bookOpen){
  const last=count?await read(m.tournaments,bookAbi,'tournament',[count]):null;
  if(!last||last.status===3||last.status===4){
   if(tournamentDue(last,await read<bigint>(m.tournaments,bookAbi,'nextAt'),block.timestamp)){await act(m.tournaments,'begin');return;}
  }
  else if(last.status===1){
   if(last.cursor<last.scanCount||last.catalogRevision!==await read(m.catalog,catalogAbi,'revision')){await act(m.tournaments,'select',[count,32]);return;}
  }else if(laneFree&&!cooling(m.pool,'admitTournament')){const [index]=await read(m.tournaments,bookAbi,'nextFixture',[count]);if(index!==255){await act(m.pool,'admitTournament',[count]);return;}}
 }
 if(lanes[1].ref.id===0n){
  if(!await read<boolean>(m.challenges,challengeAbi,'qualificationsMayStart')){
   if(!cooling(m.pool,'admitChallenge'))await act(m.pool,'admitChallenge');else await archiveHistory();return;
  }
  const newestBase=idle.reduce((n,a)=>a.d.baseBlock>n?a.d.baseBlock:n,0n);
  const work=await qualificationWork(read,m,state.qualificationCursor??0n,block.timestamp,16,newestBase);state.qualificationCursor=work.next;await save();
  if(work.needed&&!cooling(m.pool,'admitQualification')){await act(m.pool,'admitQualification');return;}
 }
 await archiveHistory();
}
function clean(e:any){return String(e?.shortMessage??e?.message??'Reusable keeper unavailable').split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220);}
try{
 locked=(await guard.query('SELECT pg_try_advisory_lock(hashtextextended($1,701354)) AS ok',[prefix])).rows[0].ok;assert(locked,'Another keeper owns this state');
 try{state=JSON.parse(await readFile(file,'utf8'),(_,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&typeof v.bigint==='string'?BigInt(v.bigint):v);}catch(e){if((e as any).code!=='ENOENT')throw e;}
 await step();
}catch(e){console.error(JSON.stringify({at:new Date().toISOString(),pool:m.pool,error:clean(e)}));process.exitCode=1;}
finally{if(locked)await guard.query('SELECT pg_advisory_unlock(hashtextextended($1,701354))',[prefix]);guard.release();await metrics();await db.end();await t.close();}
