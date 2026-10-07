// Read-only preservation gate before initial openings. Does not approve admission.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,keccak256,type Address} from 'viem';
import {publicIndependentManifest} from '../shared/independent';
import {independentReader} from '../shared/independent-read';
import {previousIndependentManifests} from '../shared/independent-history-scope';
import {abi as continuityAbi} from '../shared/abi-independent-ContinuingHumanRatings';
import {humanSeedState,humanPlayerSeedSlot,humanPairSeedSlot,packedHumanSeed} from '../shared/human-seed-audit';
import {readHubDelegation} from '../shared/rooms-hub';

assert.equal(process.env.PONG_PUBLIC_HUMAN_MIGRATION,'public-responsive-human-20261007');
const bytes=await readFile(process.env.PONG_INDEPENDENT_SNAPSHOT!,'utf8'),snapshot=JSON.parse(bytes);
const raw=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8')),m=publicIndependentManifest(raw);
assert.equal(snapshot.schema,'responsive-human-ordered-v1');assert.equal(snapshot.ready,true);
assert.equal(m.rulesVersion,18);assert.equal(m.ratingsContinuity,'ordered-human-v1');
const migrationHash=keccak256(new TextEncoder().encode(bytes));assert.equal(raw.migrationHash,migrationHash);
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
const report:any={at:new Date().toISOString(),source:snapshot.source.lobby,target:m.lobby,migrationHash,passed:false};
try{
 assert.equal(await base.getChainId(),10143);const block=await base.getBlock();
 const r=independentReader(base,m,block.number),old=independentReader(base,snapshot.source,block.number);
 const previous=previousIndependentManifests(raw.previous,m);
 assert.deepEqual(previous,[publicIndependentManifest(snapshot.source),...previousIndependentManifests(snapshot.previous,snapshot.source)]);
 for(const k of ['family','profiles','privateData'] as const)assert.equal(m[k].toLowerCase(),snapshot.source[k].toLowerCase());
 for(const [address,hash]of Object.entries(snapshot.codeHashes))assert.equal(keccak256((await base.getCode({address:address as Address,blockNumber:block.number}))!),hash);
 const read=(name:string)=>base.readContract({address:m.ratings,abi:continuityAbi,functionName:name,blockNumber:block.number} as any);
 assert.equal((await read('predecessor') as string).toLowerCase(),snapshot.source.ratings.toLowerCase());
 assert.equal(await read('seedAudit'),migrationHash);assert.equal(await read('seedDigest'),snapshot.seedDigest);
 assert.equal(await r.ratings('migrationSealed'),true);assert.equal(await r.ratings('buildGeneration'),0n);
 assert.equal(String(await old.ratings('count')),snapshot.count);assert.equal(String(await old.ratings('revision')),snapshot.revision);
 assert.equal(String(await r.ratings('count')),snapshot.count);
 for(const id of [0n,1n]){assert.equal(await old.lobby('slot',[id]),0n);assert.equal(await r.lobby('slot',[id]),0n);}
 for(const e of snapshot.results)assert.deepEqual(await r.ratings('entry',[BigInt(e.first.id)]),await old.ratings('entry',[BigInt(e.first.id)]));
 for(const row of snapshot.ratings)assert.deepEqual(await r.ratings('ratingOf',[row.player,row.mode]),await old.ratings('ratingOf',[row.player,row.mode]));
 const seeds=humanSeedState(snapshot.seedCalls);
 for(const [key,value]of seeds.players){const [player,mode]=key.split(':');
  assert.equal(BigInt(await base.getStorageAt({address:m.ratings,slot:humanPlayerSeedSlot(player as Address,Number(mode)),blockNumber:block.number})??'0x0'),packedHumanSeed(value));
 }
 for(const [pair,count]of seeds.pairs)assert.equal(BigInt(await base.getStorageAt({address:m.ratings,slot:humanPairSeedSlot(pair),blockNumber:block.number})??'0x0'),BigInt(count));
 report.arenas=[];
 for(const a of m.arenas){
  assert.equal(await r.arena(a.app,'RULES_VERSION'),18n);assert.equal((await r.arena(a.app,'lobby')).toLowerCase(),m.lobby.toLowerCase());
  const pinned=raw.arenas.find((v:any)=>v.app.toLowerCase()===a.app.toLowerCase())?.runtimeHash;
  assert(typeof pinned==='string'&&/^0x[\da-f]{64}$/i.test(pinned),'Missing pinned arena runtime');
  assert.equal(keccak256((await base.getCode({address:a.app,blockNumber:block.number}))!),pinned);
  const d=await readHubDelegation(base,m.hub,a.app,block.number);assert.equal(d.status,0,'This gate precedes initial opening');
  report.arenas.push({app:a.app,status:d.status});
 }
 assert.equal((await base.getBlock({blockNumber:BigInt(snapshot.sourceBlock)})).hash,snapshot.sourceHash);
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash);
 Object.assign(report,{block:String(block.number),historicalLobbies:previous.map(p=>p.lobby),results:snapshot.results.length,ratings:snapshot.ratings.length,
  originalSeeds:seeds.players.size,pairSeeds:seeds.pairs.size,financialAddressesRetained:true,passed:true});
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].slice(0,250);process.exitCode=1;}
await writeFile('/evidence/preservation-audit.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
