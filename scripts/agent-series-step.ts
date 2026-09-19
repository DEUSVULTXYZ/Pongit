// One journaled Monad step for the private bounded-series qualification.
// No public switches, capacity attestation or arbitrary result writes exist here.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {zeroHash,zeroAddress,type Address,type Abi} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {agentSeriesPoolAbi as poolAbi} from '../shared/abi-AgentSeriesPool';
import {seriesAgentArenaAbi as arenaAbi} from '../shared/abi-SeriesAgentArena';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {agentPublishedRatingsAbi as ratingsAbi} from '../shared/abi-AgentPublishedRatings';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {agentChallengesAbi as challengeAbi} from '../shared/abi-AgentChallenges';
import {qualificationWork,historicalRepairWork,expiredChallenge} from '../relayer/src/agents/pool-maintenance';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {measuredFetch} from '../shared/rpc-metrics';
assert.equal(process.env.PONG_AGENT_SERIES_MAINTENANCE,'authorized-private-testnet');assert.equal(process.getuid?.(),1000);
const prefix=process.env.PONG_AGENT_SERIES_PREFIX!;assert(/^agent-series-candidate-\d{8}(-[2-9])?$/.test(prefix));
const file=`/secrets/${prefix}-maintenance.json`,r=JSON.parse(await readFile(`/secrets/${prefix}.json`,'utf8')),m=r.common;
assert.equal(r.phase,'deployed-closed');
const protectedApps=(process.env.PONG_HUMAN_APPS??'').toLowerCase().split(',').filter(Boolean);assert(protectedApps.length>0);
assert(r.arenas.length===2&&!r.arenas.some((a:any)=>protectedApps.includes(a.app.toLowerCase())));
const metrics=await agentMetrics('/diagnostics/series','lifecycle'),t=await chainTools(prefix+'-maintenance',measuredFetch('monad'));
const guard=await t.db.connect();let locked=false;
let state:{sequence:number;retryAt?:number;qualificationCursor?:bigint;challengeCursor?:bigint;history?:{id:bigint;index:number};intent?:{sequence:number;to:Address;method:string;args:any[]}}={sequence:0};
const save=async()=>{await writeFile(file+'.next',JSON.stringify(state,(_,v)=>typeof v==='bigint'?{bigint:String(v)}:v),{mode:0o600});await rename(file+'.next',file);};
const abiFor=(at:Address):Abi=>at===m.pool?poolAbi:at===m.tournaments?bookAbi:at===m.ratings?ratingsAbi:at===m.challenges?challengeAbi:catalogAbi;
async function act(to:Address,method:string,args:any[]=[]){
 state.intent={sequence:state.sequence,to,method,args};await save();let receipt;
 try{receipt=await t.write(`step-${state.sequence}`,to,abiFor(to),method,args);}
 catch(error){
  const job=(await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[`${prefix}-maintenance:step-${state.sequence}`])).rows[0];
  if(!job||job.status==='failed'){state.sequence++;delete state.intent;state.retryAt=Date.now()+30000;await save();}
  throw error;
 }
 state.sequence++;delete state.intent;await save();console.log(JSON.stringify({at:new Date().toISOString(),pool:m.pool,action:method,hash:receipt.transactionHash}));
}
async function step(){
 if((state.retryAt??0)>Date.now())return;
 if(state.intent){const i=state.intent;await act(i.to,i.method,i.args);return;}
 const block=await t.base.getBlock();
 const read=<T=any>(address:Address,abi:Abi,functionName:string,args:readonly unknown[]=[])=>t.base.readContract({address,abi,functionName,args,blockNumber:block.number}) as Promise<T>;
 const admissions=await read<boolean>(m.pool,poolAbi,'admissions');
 if(!admissions&&process.env.PONG_AGENT_SERIES_START==='1'){await act(m.pool,'setAdmissions',[true]);return;}
 if(m.challenges&&process.env.PONG_AGENT_SERIES_CHALLENGES==='1'&&!await read<boolean>(m.challenges,challengeAbi,'admissions')){
  await act(m.challenges,'setAdmissions',[true]);return;
 }
 for(const a of r.arenas){
  const app=a.app as Address,ids=await read<bigint>(app,arenaAbi,'seriesSize')===0n?[]:await read<readonly bigint[]>(m.pool,poolAbi,'assignedIds',[app]);
  if(ids.length===0)continue;
  const d=await readHubDelegation(t.base,m.hub,app,block.number),epoch=await read<bigint>(m.pool,poolAbi,'arenaEpoch',[app]);
  const first=await read(m.pool,poolAbi,'record',[ids[0]]);
  if(d.status===2&&block.timestamp>=d.stakeUnlockAt){await act(m.pool,'releaseArena',[app]);return;}
  if(d.status===0&&epoch<first.ref.epoch){
   if(first.captured)continue;
   if(m.challenges){
    const challenge=await read<bigint>(m.pool,poolAbi,'challengeOf',[ids[0]]);
    if(challenge&&!await read<boolean>(m.challenges,challengeAbi,'authorized',[challenge])){await act(m.pool,'cancelUnopened',[app]);return;}
   }
   if(admissions){await act(m.pool,'openArena',[app]);return;}continue;
  }
  if(d.status!==1)continue;
  for(const id of ids){
   const entry=await read(m.pool,poolAbi,'record',[id]),[published]=await read(app,arenaAbi,'resultFor',[id]);
   if(d.batchIndex>0&&published.status>=3&&published.hash!==zeroHash){
    const prior=entry.captured?await read(m.pool,poolAbi,'result',[entry.ref]):null;
    if(!prior||prior.hash!==published.hash||prior.status!==published.status){await act(m.pool,'capture',[id]);return;}
   }
  }
  if(await read<bigint>(m.pool,poolAbi,'remaining',[app])===0n&&await read<boolean>(app,arenaAbi,'seriesDrained')){await act(m.pool,'closeArena',[app]);return;}
  if(block.timestamp>=d.expiresAt){await act(m.pool,'recoverExpired',[app]);return;}
 }
 if(await read<bigint>(m.ratings,ratingsAbi,'buildGeneration')){await act(m.ratings,'rebuild',[32n]);return;}
 if(m.challenges){
  const expired=await expiredChallenge(read,m,state.challengeCursor??1n);state.challengeCursor=expired.next;await save();
  if(expired.expired!==null){await act(m.challenges,'expire',[expired.expired]);return;}
 }
 let available=false;for(const a of r.arenas)if(await read<boolean>(m.pool,poolAbi,'available',[a.app])){available=true;break;}
 const laneFree=await read<Address>(m.pool,poolAbi,'activeSeries')===zeroAddress;
 const count=await read<bigint>(m.tournaments,bookAbi,'count');
 // Continuously revisit old fixtures: corrections must not disappear when a
 // newer series becomes current. This cursor is operational, not business state.
 for(let checked=0;count>0n&&checked<3;checked++){
  const cursor=state.history&&state.history.id<=count?state.history:{id:count,index:0};
  const tournament=await read(m.tournaments,bookAbi,'tournament',[cursor.id]);
  state.history=cursor.index+1<(tournament.league?28:7)?{id:cursor.id,index:cursor.index+1}:{id:cursor.id>1n?cursor.id-1n:count,index:0};await save();
  if(cursor.index===0&&(cursor.id<count||tournament.status===4)){
   const repair=await historicalRepairWork(read,m,cursor.id,tournament,admissions&&available?1n:0n,laneFree);
   if(repair){await act(repair.to,repair.method,repair.args);return;}
  }
  const f=await read(m.tournaments,bookAbi,'fixture',[cursor.id,cursor.index]);if(!f.bound)continue;
  const entry=await read(m.pool,poolAbi,'record',[f.ref.id]);if(!entry.captured)continue;
  const result=await read(m.pool,poolAbi,'result',[f.ref]);
  if(result.hash!==f.published.hash||result.finality!==f.published.finality||result.status!==f.published.status){await act(m.tournaments,'synchronize',[cursor.id,cursor.index]);return;}
  if(!f.resolved&&f.published.status===4&&f.published.finality){await act(m.tournaments,'retryCancelled',[cursor.id,cursor.index]);return;}
 }
 if(!admissions||!available)return;
 const bookOpen=await read<boolean>(m.tournaments,bookAbi,'admissions');
 if(process.env.PONG_AGENT_SERIES_TOURNAMENTS==='1'){
  let allQualified=true;for(const b of r.bots)if((await read(m.catalog,catalogAbi,'identity',[b.agent])).qualified!==3)allQualified=false;
  if(allQualified&&!bookOpen){await act(m.tournaments,'setAdmissions',[true]);return;}
 }
 if(bookOpen){
  const last=count?await read(m.tournaments,bookAbi,'tournament',[count]):null;
  if(!last||last.status===3||last.status===4){
   if(block.timestamp>=await read<bigint>(m.tournaments,bookAbi,'nextAt')){await act(m.tournaments,'begin');return;}
  }else if(last.status===1){
   const revision=await read(m.catalog,catalogAbi,'revision');
   if(last.cursor<last.scanCount||last.catalogRevision!==revision){await act(m.tournaments,'select',[count,32]);return;}
  }
  else if(await read<Address>(m.pool,poolAbi,'activeSeries')===zeroAddress){
   const [,n]=await read(m.tournaments,bookAbi,'seriesRange',[count,3]);if(n>0){await act(m.pool,'admitTournament',[count]);return;}
  }
 }
 if(await read<Address>(m.pool,poolAbi,'qualificationSeries')===zeroAddress){
  if(m.challenges&&!await read<boolean>(m.challenges,challengeAbi,'qualificationsMayStart')){await act(m.pool,'admitChallenge');return;}
  const work=await qualificationWork(read,m,state.qualificationCursor??0n,block.timestamp);state.qualificationCursor=work.next;await save();
  if(work.needed){await act(m.pool,'admitQualifications');return;}
 }
}
try{
 locked=(await guard.query('SELECT pg_try_advisory_lock(hashtextextended($1,701354)) AS ok',[prefix])).rows[0].ok;assert(locked,'Another series step owns this state');
 try{state=JSON.parse(await readFile(file,'utf8'),(_,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&typeof v.bigint==='string'?BigInt(v.bigint):v);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 await step();
}catch(error){const e=error as {shortMessage?:string;message?:string};console.error(JSON.stringify({at:new Date().toISOString(),pool:m.pool,error:(e.shortMessage??e.message??'Series step failed').split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220)}));process.exitCode=1;}
finally{if(locked)await guard.query('SELECT pg_advisory_unlock(hashtextextended($1,701354))',[prefix]);guard.release();await metrics();await t.close();}
