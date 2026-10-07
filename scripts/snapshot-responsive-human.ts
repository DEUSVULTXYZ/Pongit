// Read-only audit of the public human source. Never substitutes a private season.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,keccak256,decodeFunctionData,encodeAbiParameters,maxUint256,type Address,type Hex} from 'viem';
import {monadTestnet} from 'viem/chains';
import {publicIndependentManifest} from '../shared/independent';
import {independentReader} from '../shared/independent-read';
import {independentRules} from '../shared/independent-rules';
import {previousIndependentManifests} from '../shared/independent-history-scope';
import {abi as ratingAbi} from '../shared/abi-independent-PublishedRatings';
import {humanSeedState,humanPlayerSeedSlot,humanPairSeedSlot,packedHumanSeed,type HumanSeedCall} from '../shared/human-seed-audit';
import {verifyHistoricalRuntime} from '../shared/historical-runtime';
import {readHubDelegation} from '../shared/rooms-hub';

assert.equal(process.env.PONG_RESPONSIVE_HUMAN,'audit-public-rules18-20261007');
const raw=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8')),source=publicIndependentManifest(raw);
assert.equal(source.lobby.toLowerCase(),'0x71a49c00ba733724cb33d7590134d4ae96426156');
assert.equal(source.rulesVersion,14);
const previous=previousIndependentManifests(raw.previous,source);assert(previous.length<8);
const originalBytes=await readFile(process.env.PONG_INDEPENDENT_SNAPSHOT!,'utf8'),original=JSON.parse(originalBytes);
const db=new Pool({connectionString:process.env.PONG_INDEPENDENT_DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:10000});
const operatorDb=new Pool({connectionString:process.env.PONG_OPERATOR_DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:10000});
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:20000})});
const stringify=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2);
async function boundedMap<A,B>(values:readonly A[],read:(value:A)=>Promise<B>):Promise<B[]>{
 const result:B[]=[];for(let i=0;i<values.length;i+=8)result.push(...await Promise.all(values.slice(i,i+8).map(read)));return result;
}
try{
 assert.equal(await base.getChainId(),10143);
 const block=await base.getBlock(),reader=independentReader(base,source,block.number);
 const read=(fn:any,args:any[]=[])=>base.readContract({address:source.ratings,abi:ratingAbi,functionName:fn,args,blockNumber:block.number} as any) as Promise<any>;
 const owner=await read('migrationOwner') as Address,seal=await read('migrationEvidence') as Hex;
 assert.equal(owner.toLowerCase(),'0x369158ac444278541322643e46e0d5b45ac21c4c');
 assert.equal(await read('migrationSealed'),true);assert.equal(seal,keccak256(new TextEncoder().encode(originalBytes)),'Original snapshot seal differs');
 const artifact=JSON.parse(await readFile('contracts/out/PublishedRatings.sol/PublishedRatings.json','utf8'));
 assert.equal(artifact.storageLayout.storage.find((s:any)=>s.label==='seeds').slot,'4');
 assert.equal(artifact.storageLayout.storage.find((s:any)=>s.label==='pairSeeds').slot,'7');
 const runtime=await verifyHistoricalRuntime(source.ratings,artifact,a=>base.getCode({address:a,blockNumber:block.number}),async(s,n)=>JSON.parse(await readFile(`contracts/out/${s.split('/').at(-1)}/${n}.json`,'utf8')));
 const jobs=(await operatorDb.query("SELECT hash,nonce,status FROM il_lifecycle_jobs WHERE lower(app)=$1 AND owner=$2 ORDER BY nonce",[source.ratings.toLowerCase(),owner.toLowerCase()])).rows;
 assert(jobs.length>1,'Need canonical deployment and seal receipts');
 const journal=await Promise.all(jobs.map(async j=>({j,tx:await base.getTransaction({hash:j.hash}),receipt:await base.getTransactionReceipt({hash:j.hash})})));
 const creation=journal.find(x=>x.receipt.contractAddress?.toLowerCase()===source.ratings.toLowerCase());assert(creation);
 const sealCall=journal.find(x=>x.tx.to?.toLowerCase()===source.ratings.toLowerCase()&&decodeFunctionData({abi:ratingAbi,data:x.tx.input}).functionName==='sealMigration');assert(sealCall);
 assert.equal(creation.receipt.status,'success');assert.equal(sealCall.receipt.status,'success');
 assert(sealCall.receipt.blockNumber-creation.receipt.blockNumber<=4096n,'Audit window requires separate bounded review');
 const calls:HumanSeedCall[]=[],transactions:any[]=[];let sealed=false,previousHash:Hex|undefined;
 let scannedBlocks=0;
 const seedBlock=(blockNumber:bigint)=>base.getBlock({blockNumber,includeTransactions:true});
 console.log(stringify({phase:'seed-window',first:creation.receipt.blockNumber,last:sealCall.receipt.blockNumber}));
 // Examine every canonical transaction, not just the operator's local journal.
 // Bound transport concurrency without skipping blocks or changing transaction order.
 for(let first=creation.receipt.blockNumber;first<=sealCall.receipt.blockNumber;first+=8n){
  const numbers:bigint[]=Array.from({length:Number((sealCall.receipt.blockNumber-first+1n)<8n?sealCall.receipt.blockNumber-first+1n:8n)},(_,i)=>first+BigInt(i));
  const blocks:Awaited<ReturnType<typeof seedBlock>>[]=await Promise.all(numbers.map(seedBlock));
  for(const b of blocks){
  const n=b.number;
  if(previousHash)assert.equal(b.parentHash,previousHash,'Discontinuous canonical seed window');
  previousHash=b.hash;scannedBlocks++;
  for(const tx of b.transactions){
   if(tx.to?.toLowerCase()!==source.ratings.toLowerCase())continue;
   const receipt=await base.getTransactionReceipt({hash:tx.hash});assert.equal(receipt.blockHash,b.hash);
   if(receipt.status!=='success')continue;
   const d=decodeFunctionData({abi:ratingAbi,data:tx.input});
   if(!['seed','seedPairCounts','sealMigration'].includes(d.functionName))continue;
   assert(!sealed&&tx.from.toLowerCase()===owner.toLowerCase(),'Unexpected seed writer or post-seal write');
   if(d.functionName==='seed'){const [accounts,mode,values]=d.args;calls.push({kind:'players',accounts:[...accounts],mode,values:values.map(v=>({...v}))});}
   if(d.functionName==='seedPairCounts'){const [pairs,values]=d.args;calls.push({kind:'pairs',pairs:[...pairs],values:[...values]});}
   if(d.functionName==='sealMigration'){assert.equal(d.args[0],seal);sealed=true;}
   transactions.push({hash:tx.hash,block:String(n),blockHash:b.hash,method:d.functionName,nonce:tx.nonce});
  }
  }
 }
 assert.equal(previousHash,sealCall.receipt.blockHash);assert.equal(scannedBlocks,Number(sealCall.receipt.blockNumber-creation.receipt.blockNumber+1n));
 assert.equal((await base.getBlock({blockNumber:creation.receipt.blockNumber})).hash,creation.receipt.blockHash);
 assert(sealed);const seeds=humanSeedState(calls);
 console.log(stringify({phase:'seed-window-verified',blocks:scannedBlocks,transactions:transactions.length}));
 assert.equal(seeds.players.size,original.ratings.length);assert.equal(seeds.pairs.size,original.pairSeeds.length);
 for(const v of original.ratings)assert.deepEqual(seeds.players.get(`${v.player.toLowerCase()}:${v.mode}`),{elo:v.elo,played:v.played,wins:v.wins,season:v.season});
 for(const p of original.pairSeeds)assert.equal(seeds.pairs.get(p.pair.toLowerCase()),p.count);
 const ratings:any[]=[];
 for(let mode=0;mode<2;mode++)for(let offset=0n;;offset+=100n){
  const [players,total]=await reader.ratings('playerPage',[mode,offset,100n]);
  assert(total<=2000n,'Human rating population exceeds this bounded audit');
  console.log(stringify({phase:'rating-page',mode,offset,total,returned:players.length}));
  ratings.push(...await boundedMap(players as Address[],async player=>{
   const seed=seeds.players.get(`${player.toLowerCase()}:${mode}`);
   const [storage,rating]=await Promise.all([base.getStorageAt({address:source.ratings,slot:humanPlayerSeedSlot(player,mode),blockNumber:block.number}),reader.ratings('ratingOf',[player,mode])]);
   assert.equal(BigInt(storage??'0x0'),seed?packedHumanSeed(seed):0n,'Original seed storage changed');
   return {player,mode,...rating};
  }));
  if(offset+100n>=total)break;
 }
 await boundedMap([...seeds.pairs],async([pair,count])=>assert.equal(BigInt(await base.getStorageAt({address:source.ratings,slot:humanPairSeedSlot(pair),blockNumber:block.number})??'0x0'),BigInt(count)));
 const count=await reader.ratings('count'),revision=await reader.ratings('revision'),buildGeneration=await reader.ratings('buildGeneration'),results:any[]=[];
 console.log(stringify({phase:'ledger',count,revision}));
 for(let i=0n;i<count;i+=50n)results.push(...(await reader.ratings('resultPage',[i,50n]))[0]);
 const slots=[await reader.lobby('slot',[0n]),await reader.lobby('slot',[1n])];
 console.log(stringify({phase:'business-database',slots}));
 const roomIds=(await db.query('SELECT id FROM independent_rooms WHERE lobby=$1',[source.lobby.toLowerCase()])).rows;
 const rooms=await boundedMap(roomIds.filter(({id})=>BigInt(id)!==maxUint256),async({id})=>({id,room:await reader.lobby('room',[BigInt(id)])}));
 const pending=(await db.query("SELECT id,status FROM independent_operations WHERE status IN ('queued','pending')")).rows;
 const socialCommands=(await db.query("SELECT data FROM independent_operations WHERE target=$1 AND status='confirmed'",[source.lobby.toLowerCase()])).rows;
 const actors=new Set<Address>(ratings.map(r=>r.player));let blockCommands=0;
 for(const row of socialCommands){
  const call=decodeFunctionData({abi:independentRules(source).lobby,data:row.data});
  if(call.functionName!=='relay')continue;
  actors.add(call.args[0]);
  if(decodeFunctionData({abi:independentRules(source).lobby,data:call.args[1]}).functionName==='blockPlayer')blockCommands++;
 }
 const socialRows=await boundedMap([...actors],async player=>{
  const queue=await reader.lobby('queueOf',[player]);let invitations=0;
  for(let offset=0n;;offset+=32n){
   const [ids,total]=await reader.lobby('invitationPage',[player,true,offset,32n]);assert(total<=2000n);
   const values=await boundedMap(ids as bigint[],id=>reader.lobby('invitation',[id]));
   invitations+=values.filter(v=>v.status===1&&BigInt(v.expires)>=block.timestamp).length;
   if(offset+32n>=total)break;
  }
  return{player,queue:queue[1]>0n&&queue[2]>=block.timestamp,invitations};
 });
 const social={observedActors:actors.size,confirmedCommands:socialCommands.length,blockCommands,
  activeQueues:socialRows.filter(r=>r.queue).length,pendingInvitations:socialRows.reduce((n,r)=>n+r.invitations,0),
  auditScope:'Canonical reads for accounts in the retained relay journal and rating registry; not a claim that arbitrary external transactions were enumerated'};
 console.log(stringify({phase:'arenas',rooms:rooms.length,pending:pending.length}));
 const arenas=await boundedMap(source.arenas,async a=>({app:a.app,reserved:await reader.lobby('reservedMatch',[a.app]),delegation:await readHubDelegation(base,source.hub,a.app,block.number)}));
 const addresses=[...new Set([source,...previous].flatMap(m=>[m.lobby,m.ratings,m.family,m.profiles,m.privateData,m.vault,m.market]))];
 const codeHashes:Record<string,Hex>=Object.fromEntries(await boundedMap(addresses,async address=>[address,keccak256((await base.getCode({address,blockNumber:block.number}))!)] as const));
 // Existing numeric result ids include their namespace. Do not reuse any generation.
 const highest=results.reduce((n,e)=>BigInt(e.first.id)>>128n>n?BigInt(e.first.id)>>128n:n,1n);
 assert(highest<(1n<<128n)-1n);
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash);
 const snapshot={schema:'responsive-human-ordered-v1',source,previous,chainId:10143,sourceBlock:block.number,sourceHash:block.hash,sourceTimestamp:block.timestamp,codeHashes,
  sourceSeal:seal,seedCalls:calls,seedDigest:seeds.digest,seedTransactions:transactions,seedWindow:{first:creation.receipt.blockNumber,last:sealCall.receipt.blockNumber,blocks:scannedBlocks},seedRuntime:runtime.verified,ratings,results,count,revision,buildGeneration,
  nextGeneration:highest+1n,slots,rooms,pending,social,arenas,profiles:original.profiles,genesis:source.genesis,
  ready:slots.every(s=>s===0n)&&buildGeneration===0n&&pending.length===0&&arenas.every(a=>a.reserved===0n)
   &&social.blockCommands===0&&social.activeQueues===0&&social.pendingInvitations===0,createdAt:new Date().toISOString()};
 await writeFile(process.env.PONG_HUMAN_MIGRATION_OUTPUT!,stringify(snapshot)+'\n',{flag:'wx',mode:0o600});
 console.log(stringify({ready:snapshot.ready,block:block.number,count,revision,seedTransactions:transactions.length,originalPlayerSeeds:seeds.players.size,pairSeeds:seeds.pairs.size,nextGeneration:snapshot.nextGeneration,pending:pending.length}));
}finally{await db.end();await operatorDb.end();}
