// Initial public evaluation only, after exact migration and actual publication.
// No declaration of capacity or 24h qualification is made by this operation.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {keccak256} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {canonicalContractReads} from '../shared/canonical-contract-reads';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi as p} from '../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi as a} from '../shared/abi-ReusableAgentArena';
import {agentCatalogAbi as c} from '../shared/abi-AgentCatalog';
import {agentChallengesAbi as q} from '../shared/abi-AgentChallenges';
import {agentTournamentsAbi as b} from '../shared/abi-AgentTournaments';
import {agentPublishedRatingsAbi as ratings} from '../shared/abi-AgentPublishedRatings';
assert.equal(process.env.PONG_RESPONSIVE_AGENTS,'public-rules17-20261008');
const action=process.argv[2];assert(['challenges','tournaments'].includes(action));
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
assert.equal(r.prefix,'reusable-agents-20261008-1');assert.equal(r.rulesVersion,17);assert.equal(r.phase,'deployed-closed');
assert.equal(r.source.manifest.pool.toLowerCase(),'0x6b09eb398668cb38db5d3a7dd857c33a371ac308');
const proofPath=process.env.PONG_RESPONSIVE_IMPORT_PROOF!;assert(/^\/evidence\/verify-import-[1-3]\.json$/.test(proofPath));
const proof=JSON.parse(await readFile(proofPath,'utf8'));assert(proof.passed&&proof.pool===r.common.pool);
const reviewBytes=await readFile('/metadata/publication-review.json'),review=JSON.parse(reviewBytes.toString());
assert.equal(review.pool,r.common.pool);assert.equal(review.qualification.capacity,false);assert.equal(review.qualification.soak24h,false);
const output=process.env.PONG_RESPONSIVE_REPORT!;assert(new RegExp('^/evidence/'+action+'-[1-3]\\.json$').test(output));
const t=await chainTools('reusable-agents-20261008-1:activate');
const report:any={at:new Date().toISOString(),action,pool:r.common.pool,passed:false,publication:[],transactions:[],qualified:false};
const stringify=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2);
await writeFile(output,stringify(report),{flag:'wx'});const save=()=>writeFile(output,stringify(report)+'\n');
try{
 const block=await t.base.getBlock();assert(block.hash);const read=canonicalContractReads(t.base,block.hash).read;
 report.block=block.number;report.blockHash=block.hash;
 for(const arena of r.arenas){
  const d=await readHubDelegation(t.base,r.common.hub,arena.app,block.number);
  assert(d.status===1&&d.epoch===1n&&d.expiresAt===0n&&d.batchIndex>0n,'New arena must actually publish its marker');
  assert.equal(await read(arena.app,a,'publicationCheckpoint'),d.epoch);
  assert.equal(await read(arena.app,a,'RULES_VERSION'),17n);
  assert.equal(keccak256((await t.base.getCode({address:arena.app,blockNumber:block.number}))!),arena.runtimeHash);
  report.publication.push({app:arena.app,epoch:d.epoch,batches:d.batchIndex});
 }
 for(let i=0;i<8;i++){
  const agent=await read(r.common.catalog,c,'house',[i]),identity=await read(r.common.catalog,c,'identity',[agent]);
  assert.equal(identity.qualified,3);assert.equal(identity.house,i+1);
 }
 if(action==='tournaments'){
  const modes=new Set<number>();
  const added=await read(r.common.ratings,ratings,'count')-BigInt(proof.results);assert(added>=2n);
  // resultPage is newest first. Starting at inheritedCount would accidentally
  // inspect ancient matches and could never prove this deployment's two modes.
  for(let offset=0n;offset<added;offset+=32n){
   const [entries]=await read(r.common.ratings,ratings,'resultPage',[offset,32n]);
   for(const entry of entries)if(entry.latest.status===3&&r.arenas.some((v:any)=>v.app.toLowerCase()===entry.latest.arena.toLowerCase()))modes.add(entry.latest.mode);
  }
  assert(modes.has(0)&&modes.has(1),'Both modes must publish on the new rules before tournament scheduling');
 }
 const write=async(id:string,address:any,abi:any,method:string,args:any[])=>{
  const tx=await retryOperatorContention(()=>t.write(id,address,abi,method,args));
  report.transactions.push({id,hash:tx.transactionHash,block:tx.blockNumber});await save();
 };
 if(action==='challenges'){
  assert.equal(await read(r.common.tournaments,b,'admissions'),false);
  await write('qualification-admissions',r.common.pool,p,'setAdmissions',[true]);
  await write('evaluation-evidence',r.common.pool,p,'qualifyCapacity',['0x'+createHash('sha256').update(reviewBytes).digest('hex')]);
  await write('challenge-admissions',r.common.challenges,q,'setAdmissions',[true]);
  await write('public-admissions',r.common.pool,p,'setPublicAdmissions',[true]);
 }else await write('tournament-admissions',r.common.tournaments,b,'setAdmissions',[true]);
 report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await t.close();console.log(JSON.stringify({action,passed:report.passed,error:report.error,qualified:false}));}
