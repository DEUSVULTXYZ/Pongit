// Read-only canonical migration proof, before any ranked candidate game.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicClient,http,keccak256} from 'viem';
import {abi as ratingsAbi} from '../shared/abi-independent-PublishedRatings';
import {abi as profilesAbi} from '../shared/abi-independent-ProfileRegistry';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';
import {readHubDelegation} from '../shared/rooms-hub';
const m=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));
const source=await readFile(process.env.PONG_INDEPENDENT_SNAPSHOT!,'utf8'),s=JSON.parse(source);
assert.equal(s.ready,true);assert.equal(s.profileFreeze,true);assert.equal(m.migrationHash,keccak256(new TextEncoder().encode(source)));
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0})});assert.equal(await base.getChainId(),10143);
const block=await base.getBlock();
const read=(address:any,abi:any,functionName:string,args:any[]=[])=>base.readContract({address,abi,functionName,args,blockNumber:block.number}) as Promise<any>;
const d=await readHubDelegation(base,s.hub,s.source,block.number);assert.equal(d.status,0);assert.equal(String(d.epoch),s.epoch);
assert.equal((await base.getBlock({blockNumber:BigInt(s.sourceBlock)})).hash,s.sourceHash);
assert.equal(await read(m.ratings,ratingsAbi,'migrationEvidence'),m.migrationHash);
assert.equal(await read(m.ratings,ratingsAbi,'migrationSealed'),true);
assert.equal(await read(m.profiles,profilesAbi,'migrationSealed'),true);
assert.deepEqual((await read(m.lobby,lobbyAbi,'arenaPage')).map((a:string)=>a.toLowerCase()),m.arenas.map((a:any)=>a.app.toLowerCase()));
for(const r of s.ratings){const actual=await read(m.ratings,ratingsAbi,'ratingOf',[r.player,r.mode]);
 for(const field of ['elo','played','wins','season'])assert.equal(String(actual[field]),String(r[field]),`Rating ${field} not preserved`);
}
for(const p of s.profiles){const key=await read(m.profiles,profilesAbi,'handleKey',[p.handle]);
 assert.equal((await read(m.profiles,profilesAbi,'handleOwner',[key])).toLowerCase(),p.player.toLowerCase());
}
const runtimes=[];for(const a of m.arenas){const code=await base.getCode({address:a.app,blockNumber:block.number});assert(code&&code!=='0x');runtimes.push({app:a.app,hash:keccak256(code),bytes:(code.length-2)/2});}
assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash);
const report={at:new Date().toISOString(),passed:true,block:String(block.number),blockHash:block.hash,source:s.source,sourceEpoch:s.epoch,sourceBlock:s.sourceBlock,migrationHash:m.migrationHash,lobby:m.lobby,profiles:s.profiles.length,ratings:s.ratings.length,runtimes};
await mkdir('artifacts/independent-migration',{recursive:true});await writeFile('artifacts/independent-migration/verified.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
