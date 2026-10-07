// Explicit user-authorized replacement of the eleven current public arenas.
// Never installed in continuous service. One journal, bounded normal close only.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,keccak256,zeroHash,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {engineTransport} from '../shared/engine-transport';
import {hostedArenaOrigin} from '../shared/hosted-control';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {agentChallengesAbi as queueAbi} from '../shared/abi-AgentChallenges';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {roomsLifecycleHubAbi as hubAbi} from '../shared/abi-rooms-lifecycle';

assert.equal(process.env.PONG_PUBLIC_RESHIP,'all-public-20261007');assert.equal(process.getuid?.(),1000);
const a=JSON.parse(await readFile('/source/agents.json','utf8')),h=JSON.parse(await readFile('/source/human.json','utf8'));
assert.equal(a.pool.toLowerCase(),'0x1f7d8a7b470a724df48d1b72723d7782d8e6014a');
assert.equal(h.lobby.toLowerCase(),'0x527ccb705048820694a4ac209f83528db68fff3f');
assert.equal(a.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());assert.equal(h.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
const approvalBytes=await readFile('/source/retirement-approval.json'),approval=JSON.parse(approvalBytes.toString());
assert.equal(approval.reason,'User explicitly authorized all public contract replacements and old delegation closure on 2026-10-07');
assert.equal(approval.backupSha256,'3860df3bb0c0d8d466364a010b91da7ebe5d1bdaf1e9beb4178ea8ea56955451');
assert(approval.offVpsVerified&&approval.arenas.length===11&&a.arenas.length===8&&h.arenas.length===3);
const deadline=Date.parse(process.env.PONG_PUBLIC_RESHIP_DEADLINE!);assert(deadline>Date.now()&&deadline<Date.now()+80*60000);
const approved=approval.arenas.map((v:any)=>({...v,epoch:BigInt(v.epoch)}));
for(const [kind,m,authority] of [['agent',a,a.pool],['human',h,h.lobby]] as const)
 for(const ar of m.arenas)assert(approved.some((v:any)=>v.app===ar.app&&v.authority===authority&&v.kind===kind),'Explicit arena scope');
const t=await chainTools('public-reship-20261007:retire',undefined,undefined,{evidence:keccak256(approvalBytes),deadline,arenas:approved});
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:1});
const path='/evidence/retirement.json',report:any={startedAt:new Date().toISOString(),deadline,approval:keccak256(approvalBytes),arenas:[],passed:false};
await writeFile(path,JSON.stringify(report),{flag:'wx'});
const save=async()=>{await writeFile(path+'.next',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));await rename(path+'.next',path);};
const read=(address:Address,abi:any,functionName:string,args:any[]=[])=>t.base.readContract({address,abi,functionName,args}) as Promise<any>;
const write=(...args:Parameters<typeof t.write>)=>{assert(Date.now()<deadline,'Original deadline');return t.write(...args);};
const idle=async()=>{
 for(let i=0;i<5;i++)assert.equal((await read(a.pool,poolAbi,'laneRecord',[i])).ref.id,0n,'Active agent match');
 for(let i=0;i<2;i++)assert.equal(await read(h.lobby,lobbyAbi,'slot',[BigInt(i)]),0n,'Active human proposal');
 for(const ar of h.arenas)assert.equal(await read(h.lobby,lobbyAbi,'reservedMatch',[ar.app]),0n,'Reserved human arena');
 assert.equal((await db.query("SELECT count(*)::int AS n FROM agent_pool.engine_jobs WHERE status='pending'")).rows[0].n,0,'Pending engine command');
};
try{
 await idle();
 for(const [address,abi,gate] of [[a.pool,poolAbi,'publicAdmissions'],[a.pool,poolAbi,'admissions'],[a.tournaments,bookAbi,'admissions'],[a.challenges,queueAbi,'admissions']] as const){
  if(await read(address,abi,gate))await write('gate-'+address+'-'+gate,address,abi,gate==='publicAdmissions'?'setPublicAdmissions':'setAdmissions',[false]);
  assert.equal(await read(address,abi,gate),false);
 }
 report.tournament=await read(a.tournaments,bookAbi,'tournament',[39n]);assert.equal(await read(a.tournaments,bookAbi,'count'),39n);
 report.matchCount=await read(a.pool,poolAbi,'nonce');assert.equal(report.matchCount,837n);
 const agentVerifier=await read(a.pool,poolAbi,'verifier');
 // Verify every source before the first closure. Hosting failures cannot turn
 // an unpublished root into permission to discard it.
 for(const row of approved){
  const d=await readHubDelegation(t.base,NO_LEASE_HUB,row.app);assert.equal(d.epoch,row.epoch);assert.equal(d.status,1);
  assert.equal(d.beneficiary.toLowerCase(),row.authority.toLowerCase());
  const root=await read(row.app,arenaAbi,'resultCommitment');assert.equal(root[0],row.epoch);
  const live=createPublicClient({transport:engineTransport(hostedArenaOrigin(NO_LEASE_HUB,row.app))});
  const session:any=await live.request({method:'interlude_session',params:[]} as any);
  assert.equal(session.app.toLowerCase(),row.app.toLowerCase());assert.equal(BigInt(session.epoch),row.epoch);assert.equal(session.chainId,4242);
  assert.deepEqual(await live.readContract({address:row.app,abi:arenaAbi,functionName:'resultCommitment'}),root,'Unpublished source commitment');
  report.arenas.push({...row,root,verifier:row.kind==='agent'?agentVerifier:h.resultVerifier,batches:d.batchIndex});
 }
 await save();
 for(const row of report.arenas){
  await idle();assert.deepEqual(await read(row.app,arenaAbi,'resultCommitment'),row.root);
  const receipt=await write('close-'+row.app+'-'+row.epoch,row.authority,row.kind==='agent'?poolAbi:lobbyAbi,'closeReusableArena',[row.app]);
  const d=await readHubDelegation(t.base,NO_LEASE_HUB,row.app);assert.equal(d.epoch,row.epoch);assert.equal(d.status,2);
  row.close={hash:receipt.transactionHash,block:receipt.blockNumber};row.releaseAt=d.stakeUnlockAt;await save();
 }
 while(Date.now()<deadline&&report.arenas.some((r:any)=>!r.verified)){
  const block=await t.base.getBlock();
  for(const row of report.arenas.filter((r:any)=>!r.verified)){
   let d=await readHubDelegation(t.base,NO_LEASE_HUB,row.app);assert.equal(d.epoch,row.epoch);
   if(d.status===2&&d.stakeUnlockAt<=block.timestamp){
    const receipt=row.kind==='agent'?await write('release-'+row.app,row.authority,poolAbi,'releaseArena',[row.app])
      :await write('release-'+row.app,NO_LEASE_HUB,hubAbi,'releaseStake',[row.app,zeroHash]);
    row.release={hash:receipt.transactionHash,block:receipt.blockNumber};d=await readHubDelegation(t.base,NO_LEASE_HUB,row.app);
   }
   if(d.status!==0)continue;
   let final=await read(row.verifier,verifierAbi,'finalizedRoots',[row.app,row.epoch]);
   if(final[0]===zeroHash){row.seal=(await write('seal-'+row.app,row.verifier,verifierAbi,'sealReleased',[row.app])).transactionHash;final=await read(row.verifier,verifierAbi,'finalizedRoots',[row.app,row.epoch]);}
   assert.deepEqual(final,[row.root[2],row.root[1]],'Exact released root');row.verified=true;await save();
  }
  if(report.arenas.some((r:any)=>!r.verified))await new Promise(resolve=>setTimeout(resolve,15000));
 }
 assert.equal(report.arenas.filter((r:any)=>r.verified).length,11,'Original retirement deadline');report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await db.end();await t.close();console.log(JSON.stringify({passed:report.passed,closed:report.arenas.filter((r:any)=>r.close).length,released:report.arenas.filter((r:any)=>r.verified).length,error:report.error}));}
