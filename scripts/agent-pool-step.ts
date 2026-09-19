// A single bounded Monad step. Physics runs in a separate process per arena;
// waiting for a challenge window never blocks an unrelated engine command.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {zeroHash,type Address,type Abi} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {agentArenaPoolAbi as poolAbi} from '../shared/abi-AgentArenaPool';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {agentPublishedRatingsAbi as ratingsAbi} from '../shared/abi-AgentPublishedRatings';
import {agentChallengesAbi as challengeAbi} from '../shared/abi-AgentChallenges';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {pooledAgentArenaAbi as arenaAbi} from '../shared/abi-PooledAgentArena';
import {expiredChallenge,historicalRepairWork,qualificationWork} from '../relayer/src/agents/pool-maintenance';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {measuredFetch} from '../shared/rpc-metrics';

assert.equal(process.env.PONG_AGENT_POOL_MAINTENANCE,'authorized-private-testnet');
const prefix=process.env.PONG_AGENT_POOL_PREFIX!;assert(/^agent-pool-candidate-\d{8}(-[2-9])?$/.test(prefix));
const file=`/secrets/${prefix}.json`,recordFile=`/secrets/${prefix}-maintenance.json`;
const r=JSON.parse(await readFile(file,'utf8')),m=r.common;assert.equal(r.phase,'deployed-closed');
assert(r.arenas.length>=3&&!r.arenas.some((a:any)=>(process.env.PONG_HUMAN_APPS??'').toLowerCase().split(',').includes(a.app.toLowerCase())));
const metrics=await agentMetrics('/diagnostics/pool','lifecycle');
const t=await chainTools(prefix+'-maintenance',measuredFetch('monad')),guard=await t.db.connect();let locked=false;
let state:{sequence:number;retryAt?:number;history?:{id:string;index:number};qualificationCursor?:bigint;challengeCursor?:bigint;intent?:{sequence:number;to:Address;method:string;args:any[];kind:string}}={sequence:0};
const save=async()=>{await writeFile(recordFile+'.next',JSON.stringify(state,(_,v)=>typeof v==='bigint'?{bigint:String(v)}:v),{mode:0o600});await rename(recordFile+'.next',recordFile);};
const abiFor=(at:Address):Abi=>at===m.pool?poolAbi:at===m.tournaments?bookAbi:at===m.ratings?ratingsAbi:at===m.challenges?challengeAbi:catalogAbi;
async function act(to:Address,method:string,args:any[]=[],kind=method){
 state.intent={sequence:state.sequence,to,method,args,kind};await save();
 let receipt;
 try{receipt=await t.write(`step-${state.sequence}`,to,abiFor(to),method,args);}
 catch(error){
  const job=(await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[`${prefix}-maintenance:step-${state.sequence}`])).rows[0];
  // No journal means simulation failed before signing; a confirmed revert also
  // resolves execution. Neither permits deleting or replacing an uncertain job.
  if(!job||job.status==='failed'){state.sequence++;delete state.intent;state.retryAt=Date.now()+30000;await save();}
  throw error;
 }
 state.sequence++;delete state.intent;await save();console.log(JSON.stringify({at:new Date().toISOString(),pool:m.pool,action:kind,hash:receipt.transactionHash}));
}
async function step(){
 if((state.retryAt??0)>Date.now())return;
 if(state.intent){const i=state.intent;await act(i.to,i.method,i.args,i.kind);return;}
 const block=await t.base.getBlock();const read=<T=any>(address:Address,abi:Abi,functionName:string,args:readonly unknown[]=[])=>
  t.base.readContract({address,abi,functionName,args,blockNumber:block.number}) as Promise<T>;
 // These are private gates. No call in this script can mark public capacity.
 const admissions=await read<boolean>(m.pool,poolAbi,'admissions');
 if(!admissions&&process.env.PONG_AGENT_POOL_START==='1'){await act(m.pool,'setAdmissions',[true],'enable-private-admissions');return;}
 if(process.env.PONG_AGENT_POOL_CHALLENGES==='1'&&!await read(m.challenges,challengeAbi,'admissions')){await act(m.challenges,'setAdmissions',[true],'enable-private-challenges');return;}
 for(const arena of r.arenas){
  const app=arena.app as Address,b=await read(app,arenaAbi,'boundMatch');if(!b.id)continue;
  const ref={chainId:10143n,arena:app,epoch:b.epoch,id:b.id},entry=await read(m.pool,poolAbi,'record',[ref]);
  const hub=await readHubDelegation(t.base,m.hub,app,block.number),epoch=await read<bigint>(m.pool,poolAbi,'arenaEpoch',[app]);
  if(hub.status===2&&block.timestamp>=hub.stakeUnlockAt){await act(m.pool,'releaseArena',[ref]);return;}
  if(hub.status===0&&epoch<b.epoch&&!entry.captured){
   if(b.preparedBlock>=block.number)continue;
   const challenge=await read<bigint>(m.pool,poolAbi,'challengeOf',[await read(m.pool,poolAbi,'arenaMatch',[app])]);
   if(challenge&& !await read(m.challenges,challengeAbi,'authorized',[challenge])){await act(m.pool,'cancelUnopened',[ref]);return;}
   if(!admissions)continue;
   await act(m.pool,'openArena',[ref]);return;
  }
  if(hub.status!==1)continue;
  const [result]=await read(app,arenaAbi,'publishedResult');
  if(!entry.captured&&result.status>=3&&result.hash!==zeroHash&&hub.batchIndex>0){await act(m.pool,'capture',[ref]);return;}
  if(entry.captured){await act(m.pool,'closeArena',[ref]);return;}
  if(block.timestamp>=hub.expiresAt){await act(m.pool,'recoverExpired',[ref]);return;}
 }
 if(await read<bigint>(m.ratings,ratingsAbi,'buildGeneration')){await act(m.ratings,'rebuild',[32n]);return;}
 const idle=await read<bigint>(m.pool,poolAbi,'releasedArenaCount'),lane1=await read(m.pool,poolAbi,'laneMatch',[1n]);
 const lane0Free=await read(m.pool,poolAbi,'laneMatch',[0n])===zeroHash;
 const expired=await expiredChallenge(read,m,state.challengeCursor??1n);state.challengeCursor=expired.next;await save();
 if(expired.expired!==null){await act(m.challenges,'expire',[expired.expired]);return;}
 const count=await read<bigint>(m.tournaments,bookAbi,'count');
 // Every unresolved/corrected historical fixture remains observable. Bound the
 // history scan, storing its cursor separately from business state on-chain.
 for(let scanned=0;count>0n&&scanned<4;scanned++){
  const id=state.history&&BigInt(state.history.id)<=count?BigInt(state.history.id):count,index=state.history?.index??0;
  const tournament=await read(m.tournaments,bookAbi,'tournament',[id]);
  state.history=index+1<(tournament.league?28:7)?{id:String(id),index:index+1}:{id:String(id>1n?id-1n:count),index:0};await save();
  if(index===0&&(id<count||tournament.status===4)){
   const repair=await historicalRepairWork(read,m,id,tournament,admissions?idle:0n,lane0Free);
   if(repair){await act(repair.to,repair.method,repair.args);return;}
  }
   const f=await read(m.tournaments,bookAbi,'fixture',[id,index]);if(!f.bound)continue;
   const record=await read(m.pool,poolAbi,'record',[f.ref]);if(!record.captured)continue;
   const result=await read(m.pool,poolAbi,'result',[f.ref]);
   if(result.hash!==f.published.hash||result.finality!==f.published.finality||result.status!==f.published.status){await act(m.tournaments,'synchronize',[id,index]);return;}
   if(!f.resolved&&f.published.status===4&&f.published.finality){await act(m.tournaments,'retryCancelled',[id,index]);return;}
 }
 const bookOpen=await read(m.tournaments,bookAbi,'admissions'),last=count?await read(m.tournaments,bookAbi,'tournament',[count]):null;
 // Do not starve a tournament behind repeated empty qualification scans.
 if(bookOpen&&admissions){
  if(!last||last.status===3||last.status===4){
   if(block.timestamp>=await read<bigint>(m.tournaments,bookAbi,'nextAt')){await act(m.tournaments,'begin');return;}
  }else if(last.status===1){
   const revision=await read(m.catalog,catalogAbi,'revision');
   if(last.cursor<last.scanCount||last.catalogRevision!==revision){await act(m.tournaments,'select',[count,32]);return;}
  }else if(idle&&lane0Free){
   const [index]=await read(m.tournaments,bookAbi,'nextFixture',[count]);if(index!==255){await act(m.pool,'admitTournament',[count]);return;}
  }
 }
 if(admissions&&idle&&lane1===zeroHash){
  if(!await read(m.challenges,challengeAbi,'qualificationsMayStart')){await act(m.pool,'admitChallenge');return;}
  const qualification=await qualificationWork(read,m,state.qualificationCursor??0n,block.timestamp);
  state.qualificationCursor=qualification.next;await save();
  if(qualification.needed){await act(m.pool,'admitQualification');return;}
 }
 if(admissions&&!bookOpen&&process.env.PONG_AGENT_POOL_TOURNAMENTS==='1')await act(m.tournaments,'setAdmissions',[true],'enable-private-tournaments');
}
try{
 locked=(await guard.query('SELECT pg_try_advisory_lock(hashtextextended($1,701350)) AS ok',[m.pool])).rows[0].ok;assert(locked,'Pool maintenance is already running');
 try{state=JSON.parse(await readFile(recordFile,'utf8'),(_,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&typeof v.bigint==='string'?BigInt(v.bigint):v);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 await step();
}catch(error){
 const e=error as {shortMessage?:string;message?:string;code?:string};
 console.error(JSON.stringify({at:new Date().toISOString(),pool:m.pool,stage:'maintenance-waiting',code:e.code,
  error:(e.shortMessage??e.message??'Pool maintenance unavailable').split('\n')[0].replace(/https?:\/\/\S+/g,'[endpoint]').replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220)}));
 process.exitCode=1;
}finally{if(locked)await guard.query('SELECT pg_advisory_unlock(hashtextextended($1,701350))',[m.pool]);guard.release();await t.close();await metrics();}
