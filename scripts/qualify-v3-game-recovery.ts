// Recovery belongs only to the named private trial. No forced closure, opening,
// public migration, missing-result cancellation or new game admission.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {NO_LEASE_HUB} from '../shared/hub-lease';

assert.equal(process.env.PONG_V3_GAME_RECOVERY,'finished-private-only');assert.equal(process.getuid?.(),1000);
const action=process.argv[2];assert(['close','release'].includes(action));
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
assert.equal(r.prefix,'reusable-agents-20261001-1');assert(!r.continuation);
assert.equal(r.common.pool.toLowerCase(),'0x550ff3c22e20fc760af9afd68fba2cb531140dc6');
assert.equal(r.common.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
const app=r.arenas[0].app;assert.equal(app.toLowerCase(),'0x8194191a762a54f2a2bc05fe159e8f418cffe36e');
const root='artifacts/reusable-candidate',file=`${root}/v3-game-${action}.json`;
const report:any={startedAt:new Date().toISOString(),action,app,epoch:'1',passed:false};
await writeFile(file,JSON.stringify(report),{flag:'wx'});
const save=async()=>{await writeFile(file+'.next',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));await rename(file+'.next',file);};
const finishMetrics=await agentMetrics('/diagnostics/reusable','private-recovery');
const t=await chainTools(r.prefix+':game-recovery',measuredFetch('monad'));
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:1});
try{
 const reports=await Promise.all([1,2].map(async n=>JSON.parse(await readFile(`${root}/five-controllers-${n}.json`,'utf8'))));
 assert(reports.every(x=>x.passed&&x.admissionsClosed&&x.pool===r.common.pool&&x.matches.length===1));
 assert.deepEqual(reports.map(x=>x.matches[0].result.mode),[0,1]);
 const backup=JSON.parse(await readFile(`${root}/off-vps.json`,'utf8'));assert(backup.verified&&backup.files===11&&Date.parse(backup.at)>Date.parse(reports[1].finishedAt));report.backup=backup;
 const block=await t.base.getBlock();
 const read=(address:any,abi:any,functionName:string,args:any[]=[])=>t.base.readContract({address,abi,functionName,args,blockNumber:block.number}) as Promise<any>;
 for(const gate of ['admissions','publicAdmissions'])assert.equal(await read(r.common.pool,poolAbi,gate),false);
 for(let lane=0;lane<5;lane++)assert.equal((await read(r.common.pool,poolAbi,'laneRecord',[lane])).ref.id,0n);
 assert.equal((await db.query("SELECT count(*)::int n FROM agent_pool.engine_jobs WHERE status='pending'")).rows[0].n,0);
 const d=await readHubDelegation(t.base,r.common.hub,app,block.number);assert.equal(d.epoch,1n);assert(d.batchIndex<2000n);
 const commitment=await read(app,arenaAbi,'resultCommitment');assert.equal(commitment[0],1n);assert.equal(commitment[1],2);
 for(const trial of reports){const item=trial.matches[0],ref={chainId:10143n,arena:app,epoch:1n,id:BigInt(item.ref.id)};
  assert.equal(item.ref.arena.toLowerCase(),app.toLowerCase());assert.equal((await read(r.common.pool,poolAbi,'record',[ref])).captured,true);
  const result=await read(r.common.pool,poolAbi,'result',[ref]);assert.equal(result.status,3);assert.equal(result.hash,item.result.hash);
 }
 assert.equal((await t.base.getBlock({blockNumber:block.number})).hash,block.hash);report.before={block:block.number,hash:block.hash,batches:d.batchIndex,commitment};
 if(action==='close'){
  assert.equal(d.status,1);const node=createPublicClient({transport:http(`https://il2-eu-${app.slice(2,18).toLowerCase()}.fly.dev`,{retryCount:0,timeout:5000,fetchFn:measuredFetch('interlude')})});
  assert.deepEqual(await node.readContract({address:app,abi:arenaAbi,functionName:'resultCommitment'}),commitment,'No unpublished root may be abandoned');
  const [published]=await read(r.common.verifier,verifierAbi,'currentRoot',[app,1n]);assert.equal(published.hash,commitment[2]);assert.equal(published.count,2);
 }else{
  const prior=JSON.parse(await readFile(`${root}/v3-game-close.json`,'utf8'));assert(prior.passed&&prior.app===app);
  assert.deepEqual(prior.before.commitment,commitment.map((v:any)=>typeof v==='bigint'?String(v):v));
  assert.equal(d.status,2);assert(block.timestamp>=d.stakeUnlockAt,'Wait for the actual hub deadline');
 }
 const tx=await retryOperatorContention(()=>t.write(action+'-epoch1',r.common.pool,poolAbi,action==='close'?'closeReusableArena':'releaseArena',[app]));
 const at=await t.base.getBlock(),next=await readHubDelegation(t.base,r.common.hub,app,at.number);
 assert.equal(next.epoch,1n);assert.equal(next.status,action==='close'?2:0);
 if(action==='release'){
  const sealed=await t.base.readContract({address:r.common.verifier,abi:verifierAbi,functionName:'finalizedRoots',args:[app,1n],blockNumber:at.number});
  assert.deepEqual(sealed,[commitment[2],2]);report.sealed=sealed;
 }
 assert.equal((await t.base.getBlock({blockNumber:at.number})).hash,at.hash);
 report.after={block:at.number,hash:at.hash,status:next.status,releaseAt:next.stakeUnlockAt};report.transaction={hash:tx.transactionHash,block:tx.blockNumber,gasUsed:tx.gasUsed};report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await db.end();await t.close();await finishMetrics();console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v));}
