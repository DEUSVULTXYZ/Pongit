// One bounded normal retirement of nine completed, abandoned private test sessions.
// No forceClose, game command, reopening, provider mutation or public arena is allowed.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';
import {createPublicClient,http,parseAbi,zeroHash,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentArenaAbi as agentAbi} from '../shared/abi-ReusableAgentArena';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {abi as humanAbi} from '../shared/abi-independent-ReusableEventsArena';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';

assert.equal(process.env.PONG_RETIRE_PRIVATE_RESIDUES,'nine-completed-20261004');
assert.equal(process.getuid?.(),1000);
const deadline=Date.parse(process.env.PONG_RETIRE_DEADLINE??'');
assert(deadline>Date.now()&&deadline<Date.now()+80*60_000);
const HUB='0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e' as Address;
const AGENTS='0x550ff3c22e20fc760af9afd68fba2cb531140dc6' as Address;
const HUMAN='0xe4cdf97e582282879219d7a888f8cd0ae629bd31' as Address;
const apps=['0x8194191a762a54f2a2bc05fe159e8f418cffe36e','0x5f81f9fcc7d97e77c8edda8da103a03db043603b',
 '0x064b85b76e37538f8750c5313b0e66d718744265','0xe79709cddb0cbf21c3e080b30dc9a74628bde54a',
 '0x3b435d6e84b0a9a852ce06f5d0fa873638ebeb38','0x05b901fb1423a54d0692730d694126f3eb9f1809',
 '0x5472e6b3638a6f26a1e181b490e9fe5cde005522','0x2b85a8ae733bbd713159f446e4781caa0f9d6110',
 '0xc63aecc4bb92b9e13906b75b951b09b2f918c0b3'];
const audit=JSON.parse(await readFile('/evidence/arena-residue-state-20261004.json','utf8'));
assert.deepEqual(audit.rows.map((r:any)=>r.app),apps);
assert(audit.rows.every((r:any)=>!r.error&&r.matchingRoot&&r.simulation.passed&&r.canonical.snapshot.phase==='3'));
const backup=JSON.parse(await readFile('/backup/off-vps.json','utf8'));
assert(backup.verified&&backup.files===4);
assert.equal(backup.manifestSha256,createHash('sha256').update(await readFile('/backup/manifest.json')).digest('hex'));
assert(Date.now()-Date.parse(backup.checkedAt)<30*60_000);
const file='/evidence/retirement-1.json';
const report:any={startedAt:new Date().toISOString(),deadline,backup,passed:false,arenas:[],
 scope:'Normal close, real cooldown, release and exact-root sealing of seven old private agents and two old private human sessions. No cancellation, opening or production mutation.'};
await writeFile(file,JSON.stringify(report),{flag:'wx'});
const save=async()=>{await writeFile(file+'.next',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));await rename(file+'.next',file);};
const t=await chainTools('private-residues-20261004:retire-1');
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:1});
const read=(address:Address,abi:any,functionName:string,args:any[]=[])=>t.base.readContract({address,abi,functionName,args}) as Promise<any>;
const write=(id:string,address:Address,abi:any,fn:string,args:any[])=>{
 assert(Date.now()<deadline,'Original retirement deadline reached');
 return retryOperatorContention(()=>t.write(id,address,abi,fn,args));
};
try{
 assert.equal(await read(AGENTS,poolAbi,'admissions'),false);
 assert.equal(await read(AGENTS,poolAbi,'publicAdmissions'),false);
 assert.equal(await read(AGENTS,poolAbi,'nonce'),75n);
 for(let i=0;i<5;i++)assert.equal((await read(AGENTS,poolAbi,'laneRecord',[i])).ref.id,0n);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM agent_pool.engine_jobs WHERE status='pending'")).rows[0].n,0);
 // Inspect every source before making the first close. All source services are stopped.
 for(let i=0;i<apps.length;i++){
  const app=apps[i] as Address,authority=i<7?AGENTS:HUMAN,abi:any=i<7?agentAbi:humanAbi;
  const d=await readHubDelegation(t.base,HUB,app);
  assert.equal(d.status,1);assert.equal(d.epoch,i===0?2n:1n);assert(d.batchIndex<2000n);
  if(i>=7)assert.equal(await read(HUMAN,lobbyAbi,'reservedMatch',[app]),0n);
  const root=await read(app,abi,'resultCommitment'),current=await read(app,abi,'currentMatch');
  assert.equal(root[0],d.epoch);assert(root[1]>0);
  assert.deepEqual(root,[BigInt(audit.rows[i].canonical.root[0]),audit.rows[i].canonical.root[1],audit.rows[i].canonical.root[2]]);
  assert.equal((await read(app,abi,'getSnapshot',[current[1]])).phase,3n);
  const live=createPublicClient({transport:http(`https://il2-eu-${app.slice(2,18)}.fly.dev`,{retryCount:0,timeout:10000})});
  const session:any=await live.request({method:'interlude_session',params:[]} as any);
  assert.equal(session.app.toLowerCase(),app);assert.equal(BigInt(session.epoch),d.epoch);assert.equal(session.chainId,4242);
  assert.deepEqual(await live.readContract({address:app,abi,functionName:'resultCommitment'}),root);
  assert.deepEqual(await live.readContract({address:app,abi,functionName:'currentMatch'}),current);
  assert.equal((await live.readContract({address:app,abi,functionName:'getSnapshot',args:[current[1]]}) as any).phase,3n);
  assert.deepEqual(await live.readContract({address:app,abi,functionName:'publishedResult'}),await read(app,abi,'publishedResult'));
  const verifier=await read(app,abi,'resultVerifier');
  const [verified]=await read(verifier,verifierAbi,'currentRoot',[app,d.epoch]);
  assert.equal(verified.hash,root[2]);assert.equal(verified.count,root[1]);
  await t.base.simulateContract({address:authority,abi:i<7?poolAbi:lobbyAbi,functionName:'closeReusableArena',args:[app],account:t.account.address});
  report.arenas.push({app,authority,kind:i<7?'agents':'human',epoch:d.epoch,batches:d.batchIndex,verifier,root,current});
 }
 await save();
 for(const row of report.arenas){
  const tx=await write('close-'+row.app,row.authority,row.kind==='agents'?poolAbi:lobbyAbi,'closeReusableArena',[row.app]);
  const d=await readHubDelegation(t.base,HUB,row.app);assert.equal(d.status,2);assert.equal(d.epoch,row.epoch);
  row.close={hash:tx.transactionHash,block:tx.blockNumber,gasUsed:tx.gasUsed};row.releaseAt=d.stakeUnlockAt;await save();
 }
 while(Date.now()<deadline&&report.arenas.some((r:any)=>!r.release)){
  const block=await t.base.getBlock();
  for(const row of report.arenas.filter((r:any)=>!r.release&&r.releaseAt<=block.timestamp)){
   const d=await readHubDelegation(t.base,HUB,row.app,block.number);assert.equal(d.status,2);assert.equal(d.epoch,row.epoch);
   const root=await read(row.app,row.kind==='agents'?agentAbi:humanAbi,'resultCommitment');assert.deepEqual(root,row.root);
   const tx=row.kind==='agents'
    ?await write('release-'+row.app,AGENTS,poolAbi,'releaseArena',[row.app])
    :await write('release-'+row.app,HUB,parseAbi(['function releaseStake(address,bytes32)']),'releaseStake',[row.app,zeroHash]);
   row.releaseTransaction={hash:tx.transactionHash,block:tx.blockNumber,gasUsed:tx.gasUsed};await save();
   assert.equal((await readHubDelegation(t.base,HUB,row.app)).status,0);
   if(row.kind==='human'){
    const sealed=await write('seal-'+row.app,row.verifier,verifierAbi,'sealReleased',[row.app]);
    row.sealTransaction={hash:sealed.transactionHash,block:sealed.blockNumber,gasUsed:sealed.gasUsed};await save();
   }
   assert.deepEqual(await read(row.verifier,verifierAbi,'finalizedRoots',[row.app,row.epoch]),[row.root[2],row.root[1]]);
   row.release={verifiedAt:new Date().toISOString(),status:0};await save();
  }
  if(report.arenas.some((r:any)=>!r.release))await new Promise(r=>setTimeout(r,15000));
 }
 assert.equal(report.arenas.filter((r:any)=>r.release).length,9,'Original retirement deadline reached');report.passed=true;
}catch(e:any){report.error=String(e.shortMessage??e.message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await db.end();await t.close();console.log(JSON.stringify({passed:report.passed,released:report.arenas.filter((r:any)=>r.release).length,error:report.error}));}
