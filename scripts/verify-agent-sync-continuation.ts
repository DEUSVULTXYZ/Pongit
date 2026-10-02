// Read-only preservation gate for the isolated optimized continuation. This is
// deliberately not a verifier for the public season or an admission switch.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {monadTestnet} from 'viem/chains';
import {canonicalContractReads} from '../shared/canonical-contract-reads';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {agentPublishedRatingsAbi as ratingsAbi} from '../shared/abi-AgentPublishedRatings';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {agentChallengesAbi as queueAbi} from '../shared/abi-AgentChallenges';
import {agentQualificationsAbi as qualificationAbi} from '../shared/abi-AgentQualifications';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {privateSyncContinuation} from './private-sync-continuation';

assert.equal(process.env.PONG_SYNC_CONTINUATION_VERIFY,'read-only-private');
const r=JSON.parse(await readFile('/metadata/reusable.json','utf8'));
assert(privateSyncContinuation(r,'private-sync-20261002'));
const m=validateAgentPoolManifest(JSON.parse(await readFile('/metadata/manifest.json','utf8')));
assert.equal(m.pool.toLowerCase(),r.common.pool.toLowerCase());
assert(!m.enabled&&!m.tournamentsEnabled&&m.verifiedCapacity===0);
assert.deepEqual(m.history,[r.source.manifest]);
const source=r.source.manifest,target=r.common;
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:8000})});
assert.equal(await base.getChainId(),10143);
const block=await base.getBlock();assert(block.hash);
const read=canonicalContractReads(base,block.hash).read;
const report:any={at:new Date().toISOString(),block:String(block.number),blockHash:block.hash,sourcePool:source.pool,pool:target.pool,
 passed:false,identities:0,ratings:0,results:0,tournaments:0,fixtures:0,requests:0,
 scope:'Canonical private continuation preservation before any admission. No writes or public migration.'};
try{
 for(const pool of [source.pool,target.pool]){
  for(const field of ['admissions','publicAdmissions'])assert.equal(await read(pool,poolAbi,field),false);
  for(let lane=0;lane<5;lane++)assert.equal((await read(pool,poolAbi,'laneRecord',[lane])).ref.id,0n);
 }
 assert.equal(await read(target.pool,poolAbi,'nonce'),await read(source.pool,poolAbi,'nonce'));
 assert.equal(await read(target.pool,poolAbi,'nonce'),34n);
 for(const common of [source,target]){
  assert.equal(await read(common.tournaments,bookAbi,'admissions'),false);
  assert.equal(await read(common.challenges,queueAbi,'admissions'),false);
 }
 assert.equal(await read(target.catalog,catalogAbi,'count'),8n);
 assert.equal(await read(target.catalog,catalogAbi,'houseController'),await read(source.catalog,catalogAbi,'houseController'));
 for(let index=0;index<8;index++){
  const agent=await read(source.catalog,catalogAbi,'house',[index]);
  assert.equal(await read(target.catalog,catalogAbi,'house',[index]),agent);
  const original=await read(source.catalog,catalogAbi,'identity',[agent]);
  assert.deepEqual(await read(target.catalog,catalogAbi,'identity',[agent]),original);
  assert.equal(original.qualified,3);
  for(const [field,args] of [['registeredBlock',[agent]],['participation',[agent]],['nonces',[original.creator]]] as const)
   assert.deepEqual(await read(target.catalog,catalogAbi,field,args),await read(source.catalog,catalogAbi,field,args));
  for(let mode=0;mode<2;mode++){
   assert.deepEqual(await read(target.catalog,catalogAbi,'qualificationEvidence',[agent,mode]),await read(source.catalog,catalogAbi,'qualificationEvidence',[agent,mode]));
   assert.deepEqual(await read(target.qualifications,qualificationAbi,'retryAt',[agent,mode]),await read(source.qualifications,qualificationAbi,'retryAt',[agent,mode]));
   assert.deepEqual(await read(target.ratings,ratingsAbi,'ratingOf',[agent,mode]),await read(source.ratings,ratingsAbi,'ratingOf',[agent,mode]));
   report.ratings++;
  }
  report.identities++;
 }
 const [entries,total]=await read(source.ratings,ratingsAbi,'resultPage',[0n,50n]);
 assert.equal(total,34n);assert.equal(entries.length,34);
 assert.deepEqual(await read(target.ratings,ratingsAbi,'resultPage',[0n,50n]),[entries,total]);
 assert.equal(await read(target.ratings,ratingsAbi,'genesisTime'),await read(source.ratings,ratingsAbi,'genesisTime'));
 assert.equal(await read(target.ratings,ratingsAbi,'migrationSealed'),true);report.results=entries.length;
 assert.equal(await read(target.tournaments,bookAbi,'count'),2n);
 assert.equal(await read(target.tournaments,bookAbi,'nextAt'),await read(source.tournaments,bookAbi,'nextAt'));
 for(let id=1n;id<=2n;id++){
  assert.deepEqual(await read(target.tournaments,bookAbi,'tournament',[id]),await read(source.tournaments,bookAbi,'tournament',[id]));
  for(let index=0;index<7;index++){
   assert.deepEqual(await read(target.tournaments,bookAbi,'fixture',[id,index]),await read(source.tournaments,bookAbi,'fixture',[id,index]));
   report.fixtures++;
  }
  report.tournaments++;
 }
 assert.equal(await read(target.challenges,queueAbi,'family'),await read(source.challenges,queueAbi,'family'));
 const count=await read(source.challenges,queueAbi,'count');assert(count<=32n);
 assert.equal(await read(target.challenges,queueAbi,'count'),count);
 for(let id=1n;id<=count;id++){
  assert.deepEqual(await read(target.challenges,queueAbi,'requests',[id]),await read(source.challenges,queueAbi,'requests',[id]));report.requests++;
 }
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash);
 report.passed=true;
}catch(error){
 report.error=String((error as any)?.shortMessage??(error as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,200);
 process.exitCode=1;
}
await writeFile('/evidence/continuation-preservation.json',JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
