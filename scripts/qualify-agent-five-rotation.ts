// Bounded private rotation with a real spare opened first. One original operator
// journal; no force-close, shortened challenge window or occupied arena close.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,keccak256,parseEther,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {verifyHostedArenaEvidence} from '../shared/hosted-arena-identity';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {privateSyncRotation,assertPrivateSyncBackup} from './private-sync-continuation';
assert.equal(process.env.PONG_FIVE_ROTATION,'bounded-private-owned');assert.equal(process.getuid?.(),1000);
const deadline=Date.parse(process.env.PONG_FIVE_ROTATION_DEADLINE??'');assert(deadline>Date.now()&&deadline<Date.now()+80*60_000);
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));assert.equal(r.maxMatches,5);
const scope=process.env.PONG_PRIVATE_SYNC_CONTINUATION,v3=scope!==undefined;
const plan=v3?privateSyncRotation(r,scope):{source:r.arenas[0],spare:r.arenas[5]};
if(v3)assert.equal(r.common.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
else {assert(!r.continuation);assert.equal(r.rulesVersion,15);}
const {source,spare}=plan;assert(source&&spare);
const manifest=validateAgentPoolManifest(JSON.parse(await readFile('/metadata/manifest.json','utf8')),
 (process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean));
assert(!manifest.enabled&&!manifest.tournamentsEnabled&&manifest.pool.toLowerCase()===r.common.pool.toLowerCase());
assert.equal(manifest.hub.toLowerCase(),r.common.hub.toLowerCase());assert.equal(manifest.rulesVersion,r.rulesVersion);
const backup=JSON.parse(await readFile('/backup/off-vps.json','utf8'));
if(v3){assertPrivateSyncBackup(backup,await readFile('/backup/manifest.json'),scope,22);
 assert(Date.now()-Date.parse(backup.checkedAt)>=0&&Date.now()-Date.parse(backup.checkedAt)<30*60_000,'Fresh verified backup required');}
else assert(backup.verified===true&&backup.files===3);
const file='artifacts/reusable-candidate/five-rotation-1.json',report:any={startedAt:new Date().toISOString(),deadline,pool:r.common.pool,source:source.app,spare:spare.app,backup,passed:false,continuityQualified:false};
await writeFile(file,JSON.stringify(report),{flag:'wx'});
const save=async()=>{await writeFile(file+'.next',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));await rename(file+'.next',file);};
const t=await chainTools(r.prefix+':five-rotation-1',measuredFetch('monad'));
const metrics=await agentMetrics('/diagnostics/reusable','rotation-qualification');
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:1}),wait=(ms=2000)=>new Promise(resolve=>setTimeout(resolve,ms));
const read=(address:Address,abi:any,functionName:string,args:readonly unknown[]=[])=>t.base.readContract({address,abi,functionName,args}) as Promise<any>;
const write=(id:string,to:Address,abi:any,method:string,args:readonly unknown[]=[],value=0n)=>retryOperatorContention(()=>{
 assert(Date.now()<deadline,'Original rotation deadline');return t.write(id,to,abi,method,args,value);
});
const readinessFailure=(stage:string,error:unknown)=>{
 const message=String((error as any)?.shortMessage??(error as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,180);
 report.readinessErrors??=[];
 const last=report.readinessErrors.at(-1);
 if(last?.stage!==stage||last?.message!==message){report.readinessErrors.push({at:new Date().toISOString(),stage,message});if(report.readinessErrors.length>10)report.readinessErrors.shift();}
};
async function hosted(a:typeof source,epoch:bigint,allowPlaying=false){
 const at=await t.base.getBlock(),d=await readHubDelegation(t.base,r.common.hub,a.app,at.number);
 const entry=manifest.arenas.find(a2=>a2.app.toLowerCase()===a.app.toLowerCase());assert(entry&&entry.runtimeHash===a.runtimeHash);
 const url=entry.node,node=createPublicClient({transport:http(url,{retryCount:0,timeout:5000,fetchFn:measuredFetch('interlude')})});
 const [session,rulesVersion,response]=await Promise.all([node.request({method:'interlude_session',params:[]} as any),node.readContract({address:a.app,abi:arenaAbi,functionName:'RULES_VERSION'}),measuredFetch('interlude')(url+'/health',{signal:AbortSignal.timeout(5000)})]);
 assert(response.ok);assert.equal(d.epoch,epoch);assert.equal(d.status,1);
 const evidence=verifyHostedArenaEvidence({app:a.app,epoch,chainId:4242,baseBlock:d.baseBlock,rulesVersion:BigInt(r.rulesVersion),runtimeHash:a.runtimeHash},
  {session,rulesVersion,runtimeHash:keccak256((await t.base.getCode({address:a.app,blockNumber:at.number}))!),health:await response.json()});
 if(v3){
  assert(d.batchIndex>0n,'The spare must actually publish before retiring any capacity');
  assert.equal(await t.base.readContract({address:a.app,abi:arenaAbi,functionName:'publicationCheckpoint',blockNumber:at.number}),epoch);
  const status=await db.query("SELECT stage,detail->>'epoch' AS epoch FROM agent_pool.health WHERE app=$1 AND updated_at>now()-interval '15 seconds'",[a.app.toLowerCase()]);
  assert(status.rows.length===1&&(status.rows[0].stage==='available'||allowPlaying&&status.rows[0].stage==='playing')&&status.rows[0].epoch===String(epoch),'The prepared arena must be available to its command worker');
 }
 assert.equal((await t.base.getBlock({blockNumber:at.number})).hash,at.hash);
 return evidence;
}
try{
 for(const arena of [source,spare])assert.equal(keccak256((await t.base.getCode({address:arena.app}))!),arena.runtimeHash,'Canonical candidate code mismatch');
 for(let lane=0;lane<5;lane++)assert.equal((await read(r.common.pool,poolAbi,'laneRecord',[lane])).ref.id,0n,'Existing private game must finish first');
 const before=await readHubDelegation(t.base,r.common.hub,source.app);assert(before.status===1&&before.epoch===1n&&before.batchIndex<2000n);
 report.prior=before;report.rootBefore=await read(source.app,arenaAbi,'resultCommitment');
 assert(report.rootBefore[1]>0n,'A used epoch is required');
 const root=await read(r.common.verifier,verifierAbi,'currentRoot',[source.app,1n]);
 assert.deepEqual([root[0].count,root[0].hash],[report.rootBefore[1],report.rootBefore[2]],'Every prior result must already be published');
 const pending=await db.query("SELECT count(*)::int AS n FROM agent_pool.engine_jobs WHERE app=$1 AND status='pending'",[source.app.toLowerCase()]);assert.equal(pending.rows[0].n,0);
 const validator=await read(r.common.hub,hubAbi,'defaultValidator'),terms=await read(r.common.hub,hubAbi,'termsOf',[validator]);
 if(v3){assert.equal(validator.toLowerCase(),'0xa375cf27ed39491db8302ffc3df4210ad263ef43');assert(terms.open&&terms.maxDelegationDuration===0n&&terms.delegationFee<=parseEther('0.01'));}
 else assert.equal(terms.delegationFee,0n);
 const priorSpare=await readHubDelegation(t.base,r.common.hub,spare.app);assert.equal(priorSpare.status,0);assert.equal(priorSpare.epoch,0n);
 report.openSpare=await write('open-spare',r.common.pool,poolAbi,'openReusableArena',[spare.app],terms.delegationFee);
 // Receipts contain public events only, but retain compact evidence in reports.
 report.openSpare={hash:report.openSpare.transactionHash,block:report.openSpare.blockNumber};await save();
 while(Date.now()<deadline){try{report.spareVerified=await hosted(spare,1n);await save();break;}catch(e){readinessFailure('spare',e);await save();await wait();}}
 assert(report.spareVerified,'Original spare readiness deadline');
 const close=await write('close-source-epoch1',r.common.pool,poolAbi,'closeReusableArena',[source.app]);report.close={hash:close.transactionHash,gasUsed:close.gasUsed};
 let d=await readHubDelegation(t.base,r.common.hub,source.app);assert.equal(d.status,2);report.releaseAt=d.stakeUnlockAt;await save();
 while(Date.now()<deadline){
  const block=await t.base.getBlock();d=await readHubDelegation(t.base,r.common.hub,source.app,block.number);
  assert.equal(d.epoch,1n);assert.equal(d.status,2,'Challenge or external lifecycle action needs its own reconciliation');
  if(block.timestamp>=d.stakeUnlockAt)break;
  await wait(Math.min(30000,Number(d.stakeUnlockAt-block.timestamp)*1000));
 }
 assert(Date.now()<deadline,'Original release deadline');
 const release=await write('release-source-epoch1',r.common.pool,poolAbi,'releaseArena',[source.app]);report.release={hash:release.transactionHash,gasUsed:release.gasUsed,block:release.blockNumber};
 assert.equal((await readHubDelegation(t.base,r.common.hub,source.app)).status,0);
 assert.deepEqual(await read(r.common.verifier,verifierAbi,'finalizedRoots',[source.app,1n]),[report.rootBefore[2],report.rootBefore[1]]);await save();
 assert.equal(await read(r.common.hub,hubAbi,'defaultValidator'),validator,'Changed validator requires a new reviewed operation');
 const renewedTerms=await read(r.common.hub,hubAbi,'termsOf',[validator]);assert.equal(renewedTerms.delegationFee,terms.delegationFee,'Changed terms require a new reviewed operation');
 if(v3)assert(renewedTerms.open&&renewedTerms.maxDelegationDuration===0n,'Changed renewal terms');
 const opening=await write('open-source-epoch2',r.common.pool,poolAbi,'openReusableArena',[source.app],terms.delegationFee);report.reopen={hash:opening.transactionHash,block:opening.blockNumber};await save();
 while(Date.now()<deadline){try{report.renewedVerified=await hosted(source,2n,true);await save();break;}catch(e){readinessFailure('renewal',e);await save();await wait();}}
 assert(report.renewedVerified,'Original renewed readiness deadline');report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await t.close();await db.end();await metrics();console.log(JSON.stringify({passed:report.passed,error:report.error}));}
