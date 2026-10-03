// Bounded normal recovery of the completed rules-16 private season only.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {agentChallengesAbi as queueAbi} from '../shared/abi-AgentChallenges';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {engineTransport} from '../shared/engine-transport';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {privateSyncCompleted} from './private-sync-continuation';

assert.equal(process.env.PONG_SYNC_RELEASE,'finished-private-only');
assert.equal(process.getuid?.(),1000);
const deadline=Date.parse(process.env.PONG_SYNC_RELEASE_DEADLINE??'');
assert(deadline>Date.now()&&deadline<Date.now()+80*60000);
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
const completed=privateSyncCompleted(r,process.env.PONG_PRIVATE_SYNC_CONTINUATION);
assert(r.maxMatches===5&&r.rulesVersion===16);
assert.equal(r.arenas.length,5);
// Each private season has a fixed required proof set. Historical partial trials
// retain their original scope; the queue candidate requires all four formats.
for(const name of completed.proofs){
 const proof=JSON.parse(await readFile('/evidence/'+name,'utf8'));
 assert(proof.passed&&proof.finishedAt&&proof.pool.toLowerCase()===r.common.pool.toLowerCase());
}
const backup=JSON.parse(await readFile('/backup/off-vps.json','utf8'));
assert(backup.verified&&backup.files===completed.backupFiles);
const file='/evidence/sync-release-1.json';
const report:any={startedAt:new Date().toISOString(),deadline,pool:r.common.pool,backup,arenas:[],passed:false,
 scope:'Normal closure, release and exact-root sealing of five completed private rules-16 arenas. No forced closure, opening, public mutation or final release claim.'};
await writeFile(file,JSON.stringify(report),{flag:'wx'});
const save=async()=>{await writeFile(file+'.next',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));await rename(file+'.next',file);};
const t=await chainTools(r.prefix+':sync-release-1',measuredFetch('monad'));
const finishMetrics=await agentMetrics('/diagnostics/reusable','sync-release-qualification');
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:1});
const read=(address:Address,abi:any,functionName:string,args:any[]=[])=>t.base.readContract({address,abi,functionName,args}) as Promise<any>;
const write=(id:string,method:string,app:Address)=>retryOperatorContention(()=>t.write(id,r.common.pool,poolAbi,method,[app]));
try{
 for(const gate of ['admissions','publicAdmissions'])assert.equal(await read(r.common.pool,poolAbi,gate),false);
 assert.equal(await read(r.common.tournaments,bookAbi,'admissions'),false);
 assert.equal(await read(r.common.challenges,queueAbi,'admissions'),false);
 const count=await read(r.common.tournaments,bookAbi,'count');
 assert.equal(count,completed.tournaments);
 assert.equal(await read(r.common.pool,poolAbi,'nonce'),completed.results);
 assert.equal((await read(r.common.tournaments,bookAbi,'tournament',[count])).status,3,'Finish the tournament before private recovery');
 for(let lane=0;lane<5;lane++)assert.equal((await read(r.common.pool,poolAbi,'laneRecord',[lane])).ref.id,0n);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM agent_pool.engine_jobs WHERE status='pending'")).rows[0].n,0);
 for(const a of r.arenas){
  const app=a.app as Address,d=await readHubDelegation(t.base,r.common.hub,app);
  assert.equal(d.status,1);assert.equal(d.epoch,1n);assert(d.batchIndex<2000n);
  const root=await read(app,arenaAbi,'resultCommitment');assert.equal(root[0],d.epoch);assert(root[1]>0);
  const live=createPublicClient({transport:engineTransport(`https://il2-eu-${app.slice(2,18).toLowerCase()}.fly.dev`)});
  const session:any=await live.request({method:'interlude_session',params:[]} as any);
  assert.equal(session.app.toLowerCase(),app.toLowerCase());assert.equal(BigInt(session.epoch),d.epoch);
  assert.equal(session.chainId,4242);
  assert.deepEqual(await live.readContract({address:app,abi:arenaAbi,functionName:'resultCommitment'}),root,'Unpublished result root must be recovered first');
  const [published]=await read(r.common.verifier,verifierAbi,'currentRoot',[app,d.epoch]);
  assert.equal(published.count,root[1]);assert.equal(published.hash,root[2]);
  report.arenas.push({app,epoch:d.epoch,batches:d.batchIndex,root});
 }
 await save();
 for(const row of report.arenas){
  assert(Date.now()<deadline);
  const receipt=await write('close-'+row.app,'closeReusableArena',row.app);
  const d=await readHubDelegation(t.base,r.common.hub,row.app);
  assert.equal(d.status,2);assert.equal(d.epoch,row.epoch);
  row.close={hash:receipt.transactionHash,block:receipt.blockNumber,gasUsed:receipt.gasUsed};row.releaseAt=d.stakeUnlockAt;await save();
 }
 while(Date.now()<deadline&&report.arenas.some((a:any)=>!a.release)){
  const block=await t.base.getBlock();
  for(const row of report.arenas.filter((a:any)=>!a.release&&a.releaseAt<=block.timestamp)){
   const d=await readHubDelegation(t.base,r.common.hub,row.app,block.number);
   assert.equal(d.status,2);assert.equal(d.epoch,row.epoch);
   const receipt=await write('release-'+row.app,'releaseArena',row.app);
   assert.equal((await readHubDelegation(t.base,r.common.hub,row.app)).status,0);
   assert.deepEqual(await read(r.common.verifier,verifierAbi,'finalizedRoots',[row.app,row.epoch]),[row.root[2],row.root[1]]);
   row.release={hash:receipt.transactionHash,block:receipt.blockNumber,gasUsed:receipt.gasUsed};await save();
  }
  if(report.arenas.some((a:any)=>!a.release))await new Promise(resolve=>setTimeout(resolve,15000));
 }
 assert.equal(report.arenas.filter((a:any)=>a.release).length,5,'Original release deadline reached');report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await db.end();await t.close();await finishMetrics();console.log(JSON.stringify({passed:report.passed,released:report.arenas.filter((a:any)=>a.release).length,error:report.error}));}
