// One failed private qualification, recovered through the real hub lifecycle.
// Expiry or an empty engine RPC is never accepted as proof of cancellation.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';

assert.equal(process.env.PONG_REUSABLE_AGENT_QUALIFICATION,'isolated-vps');
assert.equal(process.getuid?.(),1000);
const m=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
const s=JSON.parse(await readFile('/secrets/qualification.json','utf8'));
assert.equal(m.rulesVersion,15);assert.equal(m.phase,'deployed-closed');
assert.equal(s.app,m.arenas[0].app);assert.equal(s.pool,m.common.pool);
assert.equal(s.epoch,'1');assert.equal(s.jobs.length,0);assert.equal(s.results.length,0);assert.equal(s.matches.length,1);
const app=s.app,epoch=1n,t=await chainTools(m.prefix+':recover-unadmitted-epoch1');
const read=(address:any,abi:any,functionName:string,args:any[]=[])=>t.base.readContract({address,abi,functionName,args} as any) as Promise<any>;
const write=(...args:Parameters<typeof t.write>)=>retryOperatorContention(()=>t.write(...args));
const report:any={app,epoch:'1',startedAt:new Date().toISOString(),passed:false,scope:'Failed private unadmitted ticket; no public admission changes'};
const out='artifacts/reusable-candidate/agents-admission-recovery.json';await mkdir('artifacts/reusable-candidate',{recursive:true});
const flush=async()=>{await writeFile(out+'.next',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));await rename(out+'.next',out);};
try{
 assert.equal(await read(m.common.pool,poolAbi,'publicAdmissions'),false);
 let d=await readHubDelegation(t.base,m.common.hub,app);assert.equal(d.epoch,epoch);
 const [actual,count,root]=await read(app,arenaAbi,'resultCommitment');assert.equal(actual,epoch);assert.equal(count,0);
 const current=await read(app,arenaAbi,'currentMatch');assert.equal(current[1],0n);
 if(d.status===1){
  const receipt=await write('close-unadmitted',m.common.pool,poolAbi,'closeReusableArena',[app]);
  report.closeHash=receipt.transactionHash;d=await readHubDelegation(t.base,m.common.hub,app);
 }
 assert([0,2].includes(d.status));const deadline=Date.now()+75*60_000;
 while(d.status===2){
  report.releaseAt=String(d.stakeUnlockAt);report.observedAt=new Date().toISOString();await flush();
  assert(Date.now()<deadline,'Hub release remains unavailable');
  if((await t.base.getBlock()).timestamp>=d.stakeUnlockAt)break;
  await new Promise(r=>setTimeout(r,30000));d=await readHubDelegation(t.base,m.common.hub,app);assert.equal(d.epoch,epoch);
 }
 if(d.status===2){const receipt=await write('release-unadmitted',m.common.pool,poolAbi,'releaseArena',[app]);report.releaseHash=receipt.transactionHash;report.releaseGas=String(receipt.gasUsed);}
 else await write('recover-released',m.common.pool,poolAbi,'recoverReleased',[app]);
 assert.equal((await readHubDelegation(t.base,m.common.hub,app)).status,0);
 const sealed=await read(m.common.verifier,verifierAbi,'finalizedRoots',[app,epoch]);assert.deepEqual(sealed,[root,0]);
 const ref={...s.matches[0].ref,chainId:10143n,epoch,id:BigInt(s.matches[0].ref.id)};
 const record=await read(m.common.pool,poolAbi,'record',[ref]),result=await read(m.common.pool,poolAbi,'result',[ref]);
 assert(record.captured);assert.equal(result.status,4);assert.equal(result.finality,true);
 assert.equal(await read(m.common.pool,poolAbi,'laneMatch',[1n]),'0x'+'00'.repeat(32));
 report.resultStatus=4;report.finality=true;report.passed=true;
}catch(e:any){report.error=String(e.shortMessage??e.message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,220);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await flush();await t.close();console.log(JSON.stringify(report));}
