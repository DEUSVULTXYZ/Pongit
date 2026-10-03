// User-authorized retirement of the unreachable v1 PUBLIC source. No forced
// result, fake champion, reopening, new game or private-history substitution.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {agentChallengesAbi as queueAbi} from '../shared/abi-AgentChallenges';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {retryOperatorContention} from '../shared/operator-contention';

assert.equal(process.env.PONG_PUBLIC_RETIREMENT,'user-authorized-interrupted-tournament-23');
assert.equal(process.getuid?.(),1000);
const deadline=Date.parse(process.env.PONG_PUBLIC_RETIREMENT_DEADLINE??'');
assert(deadline>Date.now()&&deadline<Date.now()+80*60000);
const m=JSON.parse(await readFile('/metadata/source-manifest.json','utf8'));
assert.equal(m.pool.toLowerCase(),'0x205d5739136d6cb73d732e1146e1ce034798a613');
assert.equal(m.hub.toLowerCase(),'0x3ef8327f69e09cf721772f345e2a887ea22cd595');
const report:any={startedAt:new Date().toISOString(),deadline,pool:m.pool,arenas:[],passed:false};
const path='/evidence/public-retirement-1.json';
await writeFile(path,JSON.stringify(report),{flag:'wx'});
const save=async()=>{await writeFile(path+'.next',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));await rename(path+'.next',path);};
const t=await chainTools('public-retirement-20261003-1');
const read=(address:any,abi:any,functionName:string,args:any[]=[])=>t.base.readContract({address,abi,functionName,args}) as Promise<any>;
const write=(id:string,address:any,abi:any,method:string,args:any[])=>retryOperatorContention(()=>t.write(id,address,abi,method,args));
try{
 assert.equal((await read(m.pool,poolAbi,'owner')).toLowerCase(),t.account.address.toLowerCase());
 assert.equal(await read(m.tournaments,bookAbi,'count'),23n);
 for(const [address,abi,gate] of [[m.pool,poolAbi,'publicAdmissions'],[m.pool,poolAbi,'admissions'],[m.tournaments,bookAbi,'admissions'],[m.challenges,queueAbi,'admissions']] as const){
  if(await read(address,abi,gate))await write('close-gate-'+address+'-'+gate,address,abi,gate==='publicAdmissions'?'setPublicAdmissions':'setAdmissions',[false]);
  assert.equal(await read(address,abi,gate),false);
 }
 for(let lane=0;lane<5;lane++)assert.equal((await read(m.pool,poolAbi,'laneRecord',[lane])).ref.id,0n,'Never close an occupied lane');
 report.matchNonce=await read(m.pool,poolAbi,'nonce');
 report.tournament=await read(m.tournaments,bookAbi,'tournament',[23n]);
 for(const a of m.arenas){
  const d=await readHubDelegation(t.base,m.hub,a.app);
  assert([0,1,2].includes(d.status));
  const root=await read(a.app,arenaAbi,'resultCommitment');
  const row:any={app:a.app,epoch:d.epoch,status:d.status,root,batches:d.batchIndex};report.arenas.push(row);await save();
  if(d.status===1){
   const receipt=await write('close-'+a.app+'-'+d.epoch,m.pool,poolAbi,'closeReusableArena',[a.app]);
   row.close={hash:receipt.transactionHash,block:receipt.blockNumber};
  }
  const current=await readHubDelegation(t.base,m.hub,a.app);
  assert.equal(current.epoch,d.epoch);assert([0,2].includes(current.status));row.releaseAt=current.stakeUnlockAt;await save();
 }
 while(Date.now()<deadline&&report.arenas.some((r:any)=>!r.verified)){
  const block=await t.base.getBlock();
  for(const row of report.arenas.filter((r:any)=>!r.verified)){
   const d=await readHubDelegation(t.base,m.hub,row.app);
   assert.equal(d.epoch,row.epoch,'Unexpected reopening');
   if(d.status===2&&d.stakeUnlockAt<=block.timestamp){
    const receipt=await write('release-'+row.app+'-'+row.epoch,m.pool,poolAbi,'releaseArena',[row.app]);
    row.release={hash:receipt.transactionHash,block:receipt.blockNumber};
   }else if(d.status!==0)continue;
   assert.equal((await readHubDelegation(t.base,m.hub,row.app)).status,0);
   if(row.root[0]===row.epoch){
    assert.deepEqual(await read(m.verifier,verifierAbi,'finalizedRoots',[row.app,row.epoch]),[row.root[2],row.root[1]],'Exact final root');
   }
   row.verified=true;await save();
  }
  if(report.arenas.some((r:any)=>!r.verified))await new Promise(r=>setTimeout(r,15000));
 }
 assert(report.arenas.every((r:any)=>r.verified),'Original retirement deadline exceeded');
 report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await t.close();console.log(JSON.stringify({passed:report.passed,verified:report.arenas.filter((r:any)=>r.verified).length,error:report.error}));}
