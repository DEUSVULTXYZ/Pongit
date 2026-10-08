// Continuous-delegation public migration. No retirement or cancellation path.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {keccak256,parseEther,zeroHash} from 'viem';
import {Pool} from 'pg';
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
assert.equal(process.env.PONG_RESPONSIVE_AGENTS,'public-rules17-20261008');
const action=process.argv[2];assert(['freeze','verify-import','open-arenas'].includes(action));
const source=JSON.parse(await readFile('/metadata/source-manifest.json','utf8'));
assert.equal(source.pool.toLowerCase(),'0x6b09eb398668cb38db5d3a7dd857c33a371ac308');
const output=process.env.PONG_RESPONSIVE_REPORT!;
assert(/^\/evidence\/(freeze|verify-import|open-arenas)-[1-3]\.json$/.test(output)&&output.includes('/'+action+'-'));
const t=await chainTools('reusable-agents-20261008-1:public');
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:1});
const report:any={at:new Date().toISOString(),action,sourcePool:source.pool,passed:false,transactions:[]};
const stringify=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2);
await writeFile(output,stringify(report),{flag:'wx'});
const save=()=>writeFile(output,stringify(report)+'\n');
async function batch<A,B>(rows:readonly A[],f:(row:A)=>Promise<B>){const out:B[]=[];for(let i=0;i<rows.length;i+=6)out.push(...await Promise.all(rows.slice(i,i+6).map(f)));return out;}
const gates=[[source.pool,poolAbi,'setPublicAdmissions','publicAdmissions'],[source.challenges,queueAbi,'setAdmissions','admissions'],
 [source.tournaments,bookAbi,'setAdmissions','admissions'],[source.pool,poolAbi,'setAdmissions','admissions']] as const;
const write=async(id:string,address:any,abi:any,method:string,args:any[],value=0n)=>{
 const receipt=await retryOperatorContention(()=>t.write(id,address,abi,method,args,value));
 report.transactions.push({id,hash:receipt.transactionHash,block:receipt.blockNumber});await save();return receipt;
};
try{
 if(action==='freeze'){
  const count=await t.base.readContract({address:source.tournaments,abi:bookAbi,functionName:'count'});
  const last=await t.base.readContract({address:source.tournaments,abi:bookAbi,functionName:'tournament',args:[count]});
  assert(count>=43n&&last.status===3,'The actual current tournament must finish naturally');
  for(const [address,abi,method]of gates)await write('freeze-'+address.toLowerCase()+'-'+method,address,abi,method,[false]);
 }
 const block=await t.base.getBlock();assert(block.hash);const read=canonicalContractReads(t.base,block.hash).read;
 report.block=block.number;report.blockHash=block.hash;
 for(const [address,abi,,method]of gates)assert.equal(await read(address,abi,method),false);
 for(let i=0;i<5;i++)assert.equal(await read(source.pool,poolAbi,'laneMatch',[BigInt(i)]),zeroHash,'Finish existing matches before import');
 assert.equal((await db.query("SELECT count(*)::int AS n FROM agent_pool.engine_jobs WHERE status='pending'")).rows[0].n,0);
 const count=await read(source.tournaments,bookAbi,'count');
 assert.equal((await read(source.tournaments,bookAbi,'tournament',[count])).status,3,'Do not retire an unfinished tournament');
 const resultCount=await read(source.ratings,ratingsAbi,'count'),requests=await read(source.challenges,queueAbi,'count');
 assert.equal(await read(source.pool,poolAbi,'nonce'),resultCount);
 assert.equal(await read(source.ratings,ratingsAbi,'buildGeneration'),0n);
 report.results=resultCount;report.requests=requests;report.tournaments=count;report.sourceRevision=await read(source.ratings,ratingsAbi,'revision');
 report.sourceDelegations=await batch(source.arenas,async(a:any)=>{
  const d=await readHubDelegation(t.base,source.hub,a.app,block.number);
  assert.equal(d.status,1,'Migration must not close the source delegation');assert.equal(d.expiresAt,0n);
  return {app:a.app,epoch:d.epoch,status:d.status,batches:d.batchIndex};
 });
 if(action!=='freeze'){
  const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
  assert.equal(r.prefix,'reusable-agents-20261008-1');assert.equal(r.rulesVersion,17);assert.equal(r.phase,'deployed-closed');
  assert.equal(r.source.manifest.pool.toLowerCase(),source.pool.toLowerCase());assert.equal(r.common.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
  const target=r.common;report.pool=target.pool;
  assert.equal(await read(target.pool,poolAbi,'admissions'),false);assert.equal(await read(target.pool,poolAbi,'publicAdmissions'),false);
  const freezePath=process.env.PONG_RESPONSIVE_FREEZE_PROOF!;assert(/^\/evidence\/freeze-[1-3]\.json$/.test(freezePath));
  const frozen=JSON.parse(await readFile(freezePath,'utf8'));assert(frozen.passed);
  assert.equal(String(resultCount),frozen.results);assert.equal(String(requests),frozen.requests);assert.equal(String(count),frozen.tournaments);
  assert.equal((await t.base.getBlock({blockNumber:BigInt(frozen.block)})).hash,frozen.blockHash);
  if(action==='verify-import'){
   assert.equal(await read(target.pool,poolAbi,'nonce'),resultCount);assert.equal(await read(target.ratings,ratingsAbi,'count'),resultCount);
   assert.equal(await read(target.ratings,ratingsAbi,'genesisTime'),await read(source.ratings,ratingsAbi,'genesisTime'));
   assert.equal(await read(target.ratings,ratingsAbi,'migrationSealed'),true);
   const identities=await read(source.catalog,catalogAbi,'count');assert.equal(await read(target.catalog,catalogAbi,'count'),identities);
   const policy=await read(target.catalog,catalogAbi,'houseCodeHash');report.identities=identities;
   await batch(Array.from({length:Number(identities)},(_,i)=>BigInt(i)),async index=>{
    const agent=await read(source.catalog,catalogAbi,'at',[index]),old=await read(source.catalog,catalogAbi,'identity',[agent]);
    assert.equal(await read(target.catalog,catalogAbi,'at',[index]),agent);
    const changed=Boolean(old.house)&&r.catalogMigration.changed;
    assert.deepEqual(await read(target.catalog,catalogAbi,'identity',[agent]),changed?{...old,qualified:0,codeHash:policy}:old);
    assert.equal(await read(target.catalog,catalogAbi,'participation',[agent]),zeroHash);
    if(old.house)assert.equal(await read(target.catalog,catalogAbi,'house',[old.house-1]),agent);
    for(const [method,arg]of [['registeredBlock',agent],['nonces',old.creator]]as const)
     assert.equal(await read(target.catalog,catalogAbi,method,[arg]),await read(source.catalog,catalogAbi,method,[arg]));
    for(let mode=0;mode<2;mode++){
     assert.deepEqual(await read(target.ratings,ratingsAbi,'ratingOf',[agent,mode]),await read(source.ratings,ratingsAbi,'ratingOf',[agent,mode]));
     assert.equal(await read(target.qualifications,qualificationAbi,'retryAt',[agent,mode]),changed?0n:await read(source.qualifications,qualificationAbi,'retryAt',[agent,mode]));
     assert.equal(await read(target.catalog,catalogAbi,'qualificationEvidence',[agent,mode]),changed?zeroHash:await read(source.catalog,catalogAbi,'qualificationEvidence',[agent,mode]));
    }
   });
   for(let offset=0n;offset<resultCount;offset+=32n){
    const page=await read(source.ratings,ratingsAbi,'resultPage',[offset,32n]);
    // Published and final are distinct. Preserve each state exactly, including
    // corrections that the continuing ledger will synchronize later.
    assert.deepEqual(await read(target.ratings,ratingsAbi,'resultPage',[offset,32n]),page);
   }
   assert.equal(await read(target.tournaments,bookAbi,'count'),count);
   assert.equal(await read(target.tournaments,bookAbi,'nextAt'),await read(source.tournaments,bookAbi,'nextAt'));
   let fixtures=0;
   for(let id=1n;id<=count;id++){
    const book=await read(source.tournaments,bookAbi,'tournament',[id]);assert.deepEqual(await read(target.tournaments,bookAbi,'tournament',[id]),book);
    await batch(Array.from({length:book.league?28:7},(_,i)=>i),async i=>{
     assert.deepEqual(await read(target.tournaments,bookAbi,'fixture',[id,i]),await read(source.tournaments,bookAbi,'fixture',[id,i]));
     const attempts=await read(source.tournaments,bookAbi,'attemptCount',[id,i]);assert.equal(await read(target.tournaments,bookAbi,'attemptCount',[id,i]),attempts);
     for(let n=0;n<Number(attempts);n++)assert.deepEqual(await read(target.tournaments,bookAbi,'attemptRef',[id,i,n]),await read(source.tournaments,bookAbi,'attemptRef',[id,i,n]));
     fixtures++;
    });
   }
   report.fixtures=fixtures;
   assert.equal(await read(target.challenges,queueAbi,'family'),await read(source.challenges,queueAbi,'family'));
   assert.equal(await read(target.challenges,queueAbi,'count'),requests);
   await batch(Array.from({length:Number(requests)},(_,i)=>BigInt(i+1)),async id=>{
    const row=await read(source.challenges,queueAbi,'requests',[id]);assert.deepEqual(await read(target.challenges,queueAbi,'requests',[id]),row);
    assert.equal(await read(target.challenges,queueAbi,'nonces',[row[5]]),await read(source.challenges,queueAbi,'nonces',[row[5]]));
    if(row[3]===1)assert.equal(await read(target.challenges,queueAbi,'pending',[row[0]]),id);
   });
  }else{
   const importPath=process.env.PONG_RESPONSIVE_IMPORT_PROOF!;assert(/^\/evidence\/verify-import-[1-3]\.json$/.test(importPath));
   const preserved=JSON.parse(await readFile(importPath,'utf8'));
   assert(preserved.passed&&preserved.pool===target.pool);
   const validator=await read(target.hub,hubAbi,'defaultValidator'),terms=await read(target.hub,hubAbi,'termsOf',[validator]);
   assert.equal(validator.toLowerCase(),'0xa375cf27ed39491db8302ffc3df4210ad263ef43');
   assert(terms.open&&terms.maxDelegationDuration===0n&&terms.delegationFee<=parseEther('0.01'));
   report.openings=[];
   for(const arena of r.arenas){
    assert.equal(keccak256((await t.base.getCode({address:arena.app}))!),arena.runtimeHash);
    const before=await readHubDelegation(t.base,target.hub,arena.app);
    const id='initial-open-'+arena.app.toLowerCase();
    const known=await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',['reusable-agents-20261008-1:public:'+id]);
    assert(known.rowCount||before.status===0&&before.epoch===0n,'Only a never-opened arena may use this operation');
    const receipt=await write(id,target.pool,poolAbi,'openReusableArena',[arena.app],terms.delegationFee);
    const after=await readHubDelegation(t.base,target.hub,arena.app);assert(after.status===1&&after.epoch===1n&&after.expiresAt===0n);
    report.openings.push({app:arena.app,epoch:after.epoch,baseBlock:after.baseBlock,hash:receipt.transactionHash});await save();
   }
  }
 }
 assert.equal((await t.base.getBlock({blockNumber:block.number})).hash,block.hash);report.passed=true;
}catch(error){report.error=String((error as any)?.shortMessage??(error as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await db.end();await t.close();console.log(JSON.stringify({action,passed:report.passed,transactions:report.transactions.length,error:report.error}));}
