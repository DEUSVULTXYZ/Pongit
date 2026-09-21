// Read-only migration inventory. Canonical draft; never closes admissions or
// supplies a migration/opening verdict while games and registrations are live.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,decodeFunctionResult,keccak256,type Address,type Abi,type Hex} from 'viem';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {agentPublishedRatingsAbi as ratingsAbi} from '../shared/abi-AgentPublishedRatings';
import {agentChallengesAbi as challengeAbi} from '../shared/abi-AgentChallenges';
import {agentQualificationsAbi as qualificationAbi} from '../shared/abi-AgentQualifications';

const [poolText,out]=process.argv.slice(2);assert(/^0x[\da-f]{40}$/i.test(poolText)&&out&&process.env.RPC_URL);
const pool=poolText as Address;
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
assert.equal(await base.getChainId(),10143);const block=await base.getBlock();assert(block.hash);
const anchor={blockHash:block.hash,requireCanonical:true} as const;
async function read(address:Address,abi:Abi,functionName:string,args:readonly unknown[]=[]):Promise<any>{
 const data=encodeFunctionData({abi,functionName,args});
 const raw=await (base.request as any)({method:'eth_call',params:[{to:address,data},anchor]});
 return decodeFunctionResult({abi,functionName,data:raw});
}
async function runtime(address:Address){
 const code=await (base.request as any)({method:'eth_getCode',params:[address,anchor]}) as Hex;
 assert(code!=='0x','Contract missing at canonical source block');return keccak256(code);
}
const report:any={at:new Date().toISOString(),chainId:10143,block:String(block.number),blockHash:block.hash,pool,
 snapshotComplete:false,migrationReady:false,identities:[],pendingRequests:[],tournaments:[],ratings:[],blockers:[],
 scope:'Canonical read-only inventory, not an opening or migration authorization. No signatures or grants exported.'};
try{
 const catalog=await read(pool,poolAbi,'catalog'),book=await read(pool,poolAbi,'tournaments'),ratings=await read(pool,poolAbi,'ratings');
 const challenges=await read(pool,poolAbi,'challenges'),qualifications=await read(pool,poolAbi,'qualifications');
 const family=await read(challenges,challengeAbi,'family');report.common={catalog,book,ratings,challenges,qualifications,family};
 for(const [name,address] of Object.entries({pool,...report.common})){
  report.runtimeHashes??={};report.runtimeHashes[name]=await runtime(address as Address);
 }
 assert.equal((await read(catalog,catalogAbi,'arenaPool')).toLowerCase(),pool.toLowerCase());
 assert.equal((await read(catalog,catalogAbi,'competition')).toLowerCase(),book.toLowerCase());
 assert.equal((await read(book,bookAbi,'authority')).toLowerCase(),pool.toLowerCase());
 assert.equal((await read(ratings,ratingsAbi,'lobby')).toLowerCase(),pool.toLowerCase());
 for(const [address,abi] of [[challenges,challengeAbi],[qualifications,qualificationAbi]] as const){
  assert.equal((await read(address,abi,'pool')).toLowerCase(),pool.toLowerCase());
  assert.equal((await read(address,abi,'catalog')).toLowerCase(),catalog.toLowerCase());
 }
 report.gates={pool:await read(pool,poolAbi,'admissions'),public:await read(pool,poolAbi,'publicAdmissions'),
  tournaments:await read(book,bookAbi,'admissions'),challenges:await read(challenges,challengeAbi,'admissions')};
 report.matchCounter=await read(pool,poolAbi,'nonce');
 report.lanes=[await read(pool,poolAbi,'laneMatch',[0n]),await read(pool,poolAbi,'laneMatch',[1n])];
 report.challengeCursor=await read(challenges,challengeAbi,'cursor');
 report.qualificationCursor=await read(qualifications,qualificationAbi,'cursor');
 if(report.lanes.some((lane:string)=>BigInt(lane)!==0n))report.blockers.push('An assigned lane must finish on its original authority before import.');
 if(Object.values(report.gates).some(Boolean))report.blockers.push('Source admissions are still open.');
 report.catalogRevision=await read(catalog,catalogAbi,'revision');
 const n=await read(catalog,catalogAbi,'count');assert(n<=10000n,'Explicit review required for a larger catalogue');
 const house=await Promise.all(Array.from({length:8},(_,i)=>read(catalog,catalogAbi,'house',[BigInt(i)])));
 const seen=new Set<string>();report.house=house;
 for(let index=0n;index<n;index++){
  const address=await read(catalog,catalogAbi,'at',[index]);assert(!seen.has(address.toLowerCase()));seen.add(address.toLowerCase());
  const identity=await read(catalog,catalogAbi,'identity',[address]);
  if(identity.house)assert.equal(house[identity.house-1].toLowerCase(),address.toLowerCase());
  const participation=await read(catalog,catalogAbi,'participation',[address]);
  const row={address,...identity,participation,registeredBlock:await read(catalog,catalogAbi,'registeredBlock',[address]),
   creatorNonce:await read(catalog,catalogAbi,'nonces',[identity.creator]),qualificationEvidence:[],retryAt:[]} as any;
  for(let mode=0;mode<2;mode++){
   row.qualificationEvidence.push(await read(catalog,catalogAbi,'qualificationEvidence',[address,mode]));
   row.retryAt.push(await read(qualifications,qualificationAbi,'retryAt',[address,mode]));
  }
  if(BigInt(participation)!==0n)report.blockers.push(`Active participation: ${address}`);
  report.identities.push(row);
 }
 report.tournamentCount=await read(book,bookAbi,'count');report.nextAt=await read(book,bookAbi,'nextAt');
 assert(report.tournamentCount<=1000n,'Explicit review required for a larger tournament archive');
 for(let id=1n;id<=report.tournamentCount;id++){
  const t=await read(book,bookAbi,'tournament',[id]);const row:any={id,...t,resolved:0,final:0};
  for(let index=0;index<(t.league?28:7);index++){
   const f=await read(book,bookAbi,'fixture',[id,index]);if(f.resolved)row.resolved++;if(f.resolved&&f.published.finality)row.final++;
  }
  if(t.status!==3)report.blockers.push(`Tournament ${id} not complete.`);
  if(row.final!==(t.league?28:7))report.blockers.push(`Tournament ${id} has non-final fixtures; correction continuity is required.`);
  report.tournaments.push(row);
 }
 report.challengeCount=await read(challenges,challengeAbi,'count');assert(report.challengeCount<=10000n,'Explicit review required for a larger challenge archive');
 for(let id=1n;id<=report.challengeCount;id++){
  const [player,agent,mode,status,at]=await read(challenges,challengeAbi,'requests',[id]);
  if(status===1||status===2)report.pendingRequests.push({id,player,agent,mode,status,at});
 }
 if(report.pendingRequests.length)report.blockers.push('Pending/playing challenges must drain or retain their original authority. Do not cancel or clone them.');
 report.ratingState={genesis:await read(ratings,ratingsAbi,'genesisTime'),generation:await read(ratings,ratingsAbi,'generation'),
  building:await read(ratings,ratingsAbi,'buildGeneration'),revision:await read(ratings,ratingsAbi,'revision'),
  results:await read(ratings,ratingsAbi,'count'),priorMigrationEvidence:await read(ratings,ratingsAbi,'migrationEvidence')};
 if(report.ratingState.building!==0n)report.blockers.push('Ratings correction rebuild is incomplete.');
 assert(report.ratingState.results<=10000n,'Explicit review required for a larger result archive');
 report.results=[];const resultIds=new Set<string>();
 for(let offset=0n;offset<report.ratingState.results;offset+=50n){
  const [page,total]=await read(ratings,ratingsAbi,'resultPage',[offset,50n]);
  assert.equal(total,report.ratingState.results);assert(page.length>0,'Empty result page');
  for(const entry of page){
   // PoolPublication keys the ledger by the complete reference hash, not the
   // pool's sequential match number. Comparing this hash with nonce is invalid.
   const id=String(entry.first.id);assert(!resultIds.has(id)&&entry.first.id>0n,'Duplicate or zero result reference hash');
   assert.equal(entry.latest.id,entry.first.id);assert.equal(entry.latest.ranked,entry.first.ranked);
   resultIds.add(id);report.results.push(entry);
  }
 }
 report.results.reverse();assert.equal(BigInt(report.results.length),report.ratingState.results);
 report.ratingState.rankedResults=report.results.filter((entry:any)=>entry.first.ranked).length;
 report.ratingState.nonFinalResults=report.results.filter((entry:any)=>!entry.finality).length;
 for(let mode=0;mode<2;mode++){
  let offset=0n,total=0n;
  do{
   const [players,count]=await read(ratings,ratingsAbi,'playerPage',[mode,offset,100n]);total=count;
   assert(total<=10000n&&(players.length>0||offset>=total),'Rating page bounds');
   for(const player of players)report.ratings.push({player,mode,...await read(ratings,ratingsAbi,'ratingOf',[player,mode])});
   offset+=BigInt(players.length);
  }while(offset<total);
 }
 report.blockers.push('Verify rating repeat counters and historical correction handling; this inventory does not import them.');
 report.blockers.push('Qualify the replacement contracts, queue/session continuity and real concurrent house instances before activation.');
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash,'Source block reorganized');
 report.snapshotComplete=true;
}catch{
 report.error='Canonical source inventory failed; the partial report is not a migration input.';process.exitCode=1;
}
await writeFile(out,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({snapshotComplete:report.snapshotComplete,migrationReady:false,block:report.block,
 identities:report.identities.length,pendingRequests:report.pendingRequests.length,tournaments:report.tournaments.length,blockers:report.blockers}));
