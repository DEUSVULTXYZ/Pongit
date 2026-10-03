// Canonical, read-only gate before migrating the completed private season.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {monadTestnet} from 'viem/chains';
import {canonicalContractReads} from '../shared/canonical-contract-reads';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {agentPublishedRatingsAbi as ratingsAbi} from '../shared/abi-AgentPublishedRatings';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {agentChallengesAbi as queueAbi} from '../shared/abi-AgentChallenges';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {readHubDelegation} from '../shared/rooms-hub';
import {privateSyncCompleted} from './private-sync-continuation';

assert.equal(process.env.PONG_SYNC_SOURCE_VERIFY,'read-only-private');
const r=JSON.parse(await readFile('/metadata/reusable.json','utf8'));
const completed=privateSyncCompleted(r,process.env.PONG_PRIVATE_SYNC_CONTINUATION);
const expectedPool=completed.pool,expectedResults=completed.results,expectedTournaments=completed.tournaments;
// A continuation inherits tournament references, not the predecessor's physical
// result storage. Resolve each immutable arena to its original pool.
const origins=[{pool:r.common.pool,arenas:r.arenas},...(r.source?.manifest?[r.source.manifest,...(r.source.manifest.history??[])]:[])];
const release=JSON.parse(await readFile('/evidence/sync-release-1.json','utf8'));
assert(release.passed&&release.arenas.length===5&&release.pool.toLowerCase()===expectedPool);
const output=process.env.PONG_SYNC_SOURCE_REPORT??'/evidence/sync-source-final.json';
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:8000})});
assert.equal(await base.getChainId(),10143);
const block=await base.getBlock();assert(block.hash);
const read=canonicalContractReads(base,block.hash).read;
const report:any={at:new Date().toISOString(),block:String(block.number),blockHash:block.hash,pool:r.common.pool,passed:false,
 scope:'Private source canonical release, terminal result finality and tournament preservation. No writes or public migration.',arenas:[],tournaments:[],ratings:[]};
try{
 for(const name of ['admissions','publicAdmissions'])assert.equal(await read(r.common.pool,poolAbi,name),false);
 assert.equal(await read(r.common.tournaments,bookAbi,'admissions'),false);
 assert.equal(await read(r.common.challenges,queueAbi,'admissions'),false);
 for(let lane=0;lane<5;lane++)assert.equal((await read(r.common.pool,poolAbi,'laneRecord',[lane])).ref.id,0n);
 for(const row of release.arenas){
  const d=await readHubDelegation(base,r.common.hub,row.app,block.number);assert.equal(d.status,0);assert.equal(String(d.epoch),String(row.epoch));
  const root=await read(r.common.verifier,verifierAbi,'finalizedRoots',[row.app,BigInt(row.epoch)]);
  assert.equal(root[0],row.root[2]);assert.equal(String(root[1]),String(row.root[1]));report.arenas.push({app:row.app,epoch:String(d.epoch),root});
 }
 assert.equal(await read(r.common.pool,poolAbi,'nonce'),expectedResults);
 assert.equal(await read(r.common.ratings,ratingsAbi,'count'),expectedResults);
 assert.equal(await read(r.common.ratings,ratingsAbi,'buildGeneration'),0n);
 let seen=0;
 for(let offset=0n;offset<expectedResults;offset+=50n){
  const [entries,total]=await read(r.common.ratings,ratingsAbi,'resultPage',[offset,50n]);
  assert.equal(total,expectedResults);assert.equal(entries.length,Number(expectedResults-offset>50n?50n:expectedResults-offset));
  assert(entries.every((e:any)=>e.finality),'Source result finality is still reconciling');seen+=entries.length;
 }
 assert.equal(seen,Number(expectedResults));report.results=seen;
 assert.equal(await read(r.common.catalog,catalogAbi,'count'),8n);
 for(const bot of r.bots){
  assert.equal((await read(r.common.catalog,catalogAbi,'identity',[bot.agent])).qualified,3);
  assert.equal(BigInt(await read(r.common.catalog,catalogAbi,'participation',[bot.agent])),0n);
  for(let mode=0;mode<2;mode++)report.ratings.push({agent:bot.agent,mode,value:await read(r.common.ratings,ratingsAbi,'ratingOf',[bot.agent,mode])});
 }
 assert.equal(await read(r.common.tournaments,bookAbi,'count'),expectedTournaments);
 for(let id=1n;id<=expectedTournaments;id++){
  const tournament=await read(r.common.tournaments,bookAbi,'tournament',[id]);assert.equal(tournament.status,3);
  const fixtures=[];
  for(let i=0;i<(tournament.league?28:7);i++){
   const f=await read(r.common.tournaments,bookAbi,'fixture',[id,i]);assert(f.bound&&f.resolved&&f.published.finality,'Tournament finality is still reconciling');
   const owners=origins.filter(m=>m.arenas.some((a:any)=>a.app.toLowerCase()===f.ref.arena.toLowerCase()));
   assert.equal(owners.length,1,'Historical arena must have exactly one canonical origin');
   const result=await read(owners[0].pool,poolAbi,'result',[f.ref]);assert(result.finality&&result.hash===f.published.hash);
   fixtures.push({index:i,ref:f.ref,pool:owners[0].pool,hash:result.hash,score:[result.scoreA,result.scoreB]});
  }
  report.tournaments.push({id,tournament,fixtures});
 }
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash);
 report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,180);process.exitCode=1;}
await writeFile(output,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2),{flag:'wx'});
console.log(JSON.stringify({passed:report.passed,block:report.block,arenas:report.arenas.length,tournaments:report.tournaments.length,error:report.error}));
