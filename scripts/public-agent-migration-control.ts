// Explicit October 3 public migration. Private seasons never enter this path.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {keccak256,parseEther,zeroHash} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {canonicalContractReads} from '../shared/canonical-contract-reads';
import {readHubDelegation} from '../shared/rooms-hub';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {agentPublishedRatingsAbi as ratingsAbi} from '../shared/abi-AgentPublishedRatings';
import {agentChallengesAbi as queueAbi} from '../shared/abi-AgentChallenges';
import {agentQualificationsAbi as qualificationAbi} from '../shared/abi-AgentQualifications';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';

assert.equal(process.env.PONG_PUBLIC_MIGRATION,'user-authorized-recovery-20261003');
const action=process.argv[2];assert(['verify-source','verify-import','setup','qualifications','public'].includes(action));
const output=process.env.PONG_PUBLIC_MIGRATION_REPORT!;
assert(/^\/evidence\/public-(source|import|setup|qualifications|open)-[1-3]\.json$/.test(output));
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
const source=r.source.manifest;
assert.equal(r.prefix,'reusable-agents-20261003-4');
assert.equal(source.pool.toLowerCase(),'0x205d5739136d6cb73d732e1146e1ce034798a613');
const release=JSON.parse(await readFile('/metadata/public-retirement-2.json','utf8'));
assert(release.passed&&release.pool.toLowerCase()===source.pool.toLowerCase()&&release.arenas.length===8);
const t=await chainTools(r.prefix+':public-activation');
const report:any={startedAt:new Date().toISOString(),action,sourcePool:source.pool,pool:r.common?.pool,passed:false,transactions:[]};
await writeFile(output,JSON.stringify(report),{flag:'wx'});
const save=()=>writeFile(output,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
try{
 const anchor=await t.base.getBlock();assert(anchor.hash);
 const read=canonicalContractReads(t.base,anchor.hash).read;
 report.block=anchor.number;report.blockHash=anchor.hash;
 for(const [address,abi,method] of [[source.pool,poolAbi,'admissions'],[source.pool,poolAbi,'publicAdmissions'],[source.tournaments,bookAbi,'admissions'],[source.challenges,queueAbi,'admissions']]as const)
  assert.equal(await read(address,abi,method),false,'Retired source must remain closed');
 for(let lane=0;lane<5;lane++)assert.equal(await read(source.pool,poolAbi,'laneMatch',[BigInt(lane)]),zeroHash);
 for(const a of release.arenas){
  assert(a.release,'Missing journaled source release');
  const d=await readHubDelegation(t.base,source.hub,a.app,anchor.number);
  assert(d.status===0&&String(d.epoch)===a.epoch,'Source was reopened or not released');
  const root=await read(r.source.manifest.verifier??release.verifier??r.source.verifier??await read(source.pool,poolAbi,'verifier'),verifierAbi,'finalizedRoots',[a.app,BigInt(a.epoch)]);
  assert.equal(root[0],a.root[2]);assert.equal(String(root[1]),String(a.root[1]));
 }
 const results=await read(source.ratings,ratingsAbi,'count');assert.equal(results,463n);
 assert.equal(await read(source.ratings,ratingsAbi,'buildGeneration'),0n);
 const sourceEntries=[];
 for(let offset=0n;offset<results;offset+=32n){
  const [page,total]=await read(source.ratings,ratingsAbi,'resultPage',[offset,32n]);assert.equal(total,results);
  assert(page.every((e:any)=>e.finality),'Source ledger finality is incomplete');sourceEntries.push(...page);
 }
 assert.equal(sourceEntries.length,463);report.results=sourceEntries.length;
 const n=await read(source.catalog,catalogAbi,'count');assert.equal(n,9n);
 const identities=await Promise.all(Array.from({length:Number(n)},(_,i)=>read(source.catalog,catalogAbi,'at',[BigInt(i)])));
 assert.equal(await read(source.tournaments,bookAbi,'count'),23n);
 report.tournaments=[];
 for(let id=1n;id<=23n;id++){
  const book=await read(source.tournaments,bookAbi,'tournament',[id]);assert.equal(book.status,id===23n?2:3);
  const fixtures=await Promise.all(Array.from({length:book.league?28:7},(_,i)=>read(source.tournaments,bookAbi,'fixture',[id,i])));
  assert(fixtures.every(f=>!f.bound||f.published.finality),'Bound tournament result is not final');
  if(id===23n){assert.equal(fixtures.filter(f=>f.resolved).length,17);assert.equal(BigInt(book.champion),0n);}
  report.tournaments.push({id,resolved:fixtures.filter(f=>f.resolved).length});
  if(action==='verify-import'){
   const next=await read(r.common.tournaments,bookAbi,'tournament',[id]);
   assert.deepEqual(next,id===23n?{...book,status:5}:book,'Historical tournament changed');
   for(let i=0;i<fixtures.length;i++){
    assert.deepEqual(await read(r.common.tournaments,bookAbi,'fixture',[id,i]),fixtures[i]);
    assert.equal(await read(r.common.tournaments,bookAbi,'attemptCount',[id,i]),await read(source.tournaments,bookAbi,'attemptCount',[id,i]));
   }
  }
 }
 const requests=await read(source.challenges,queueAbi,'count');assert.equal(requests,67n);report.requests=requests;
 if(action==='verify-import'){
  assert.equal(r.phase,'deployed-closed');assert.equal(r.common.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
  assert.equal(await read(r.common.pool,poolAbi,'nonce'),463n);assert.equal(await read(r.common.ratings,ratingsAbi,'count'),results);
  assert.equal(await read(r.common.catalog,catalogAbi,'count'),n);
  assert.equal(await read(r.common.challenges,queueAbi,'family'),await read(source.challenges,queueAbi,'family'));
  for(let offset=0n;offset<results;offset+=32n){const [page]=await read(r.common.ratings,ratingsAbi,'resultPage',[offset,32n]);assert.deepEqual(page,sourceEntries.slice(Number(offset),Number(offset)+32),'Ordered rating ledger changed');}
  const policyHash=await read(r.common.catalog,catalogAbi,'houseCodeHash');
  report.identities=[];
  for(let i=0;i<identities.length;i++){
   const agent=identities[i],old=await read(source.catalog,catalogAbi,'identity',[agent]);
   assert.equal(await read(r.common.catalog,catalogAbi,'at',[BigInt(i)]),agent);
   assert.deepEqual(await read(r.common.catalog,catalogAbi,'identity',[agent]),old.house?{...old,qualified:0,codeHash:policyHash}:old);
   assert.equal(await read(r.common.catalog,catalogAbi,'participation',[agent]),zeroHash);
   for(const [method,arg]of [['registeredBlock',agent],['nonces',old.creator]]as const)assert.equal(await read(r.common.catalog,catalogAbi,method,[arg]),await read(source.catalog,catalogAbi,method,[arg]));
   for(let mode=0;mode<2;mode++){
    assert.deepEqual(await read(r.common.ratings,ratingsAbi,'ratingOf',[agent,mode]),await read(source.ratings,ratingsAbi,'ratingOf',[agent,mode]));
    assert.equal(await read(r.common.qualifications,qualificationAbi,'retryAt',[agent,mode]),await read(source.qualifications,qualificationAbi,'retryAt',[agent,mode]));
    assert.equal(await read(r.common.catalog,catalogAbi,'qualificationEvidence',[agent,mode]),old.house?zeroHash:await read(source.catalog,catalogAbi,'qualificationEvidence',[agent,mode]));
   }
   report.identities.push({agent,house:old.house});
  }
  assert.equal(await read(r.common.challenges,queueAbi,'count'),requests);
  for(let id=1n;id<=requests;id++){
   const request=await read(source.challenges,queueAbi,'requests',[id]);
   assert.deepEqual(await read(r.common.challenges,queueAbi,'requests',[id]),request,'Request or grant reference changed');
   assert.equal(await read(r.common.challenges,queueAbi,'nonces',[request[5]]),await read(source.challenges,queueAbi,'nonces',[request[5]]));
  }
 }
 assert.equal((await t.base.getBlock({blockNumber:anchor.number})).hash,anchor.hash);
 const write=async(id:string,address:any,abi:any,method:string,args:any[]=[],value=0n)=>{
  const receipt=await retryOperatorContention(()=>t.write(id,address,abi,method,args,value));
  report.transactions.push({id,hash:receipt.transactionHash,block:receipt.blockNumber});await save();return receipt;
 };
 if(action==='setup'){
  assert.equal(r.rulesVersion,16);assert.equal(r.common.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
  assert.equal(await read(r.common.pool,poolAbi,'admissions'),false);
  const validator=await read(r.common.hub,hubAbi,'defaultValidator'),terms=await read(r.common.hub,hubAbi,'termsOf',[validator]);
  assert.equal(validator.toLowerCase(),'0xa375cf27ed39491db8302ffc3df4210ad263ef43');
  assert(terms.open&&terms.maxDelegationDuration===0n&&terms.delegationFee<=parseEther('0.01'));
  report.openings=[];
  for(const a of r.arenas.slice(0,6)){
   assert.equal(keccak256((await t.base.getCode({address:a.app}))!),a.runtimeHash);
   const d=await readHubDelegation(t.base,r.common.hub,a.app);assert(d.status===0&&d.epoch===0n||d.status===1&&d.epoch===1n);
   const receipt=await write('open-'+a.app.toLowerCase(),r.common.pool,poolAbi,'openReusableArena',[a.app],terms.delegationFee);
   const next=await readHubDelegation(t.base,r.common.hub,a.app);assert(next.status===1&&next.epoch===1n&&next.expiresAt===0n);
   report.openings.push({app:a.app,epoch:next.epoch,baseBlock:next.baseBlock,hash:receipt.transactionHash});await save();
  }
 }
 if(action==='qualifications'||action==='public'){
  assert.equal(r.rulesVersion,16);assert.equal(r.common.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
  if(action==='public')for(const agent of identities){const id=await read(r.common.catalog,catalogAbi,'identity',[agent]);if(id.house)assert.equal(id.qualified,3,'Real house qualifications required');}
  await write('qualification-admissions',r.common.pool,poolAbi,'setAdmissions',[true]);
  if(action==='public'){
   await write('challenge-admissions',r.common.challenges,queueAbi,'setAdmissions',[true]);
   await write('public-admissions',r.common.pool,poolAbi,'setPublicAdmissions',[true]);
   await write('tournament-admissions',r.common.tournaments,bookAbi,'setAdmissions',[true]);
  }
 }
 report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await t.close();console.log(JSON.stringify({action,passed:report.passed,pool:report.pool,transactions:report.transactions.length,error:report.error}));}
