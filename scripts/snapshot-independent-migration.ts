// Read-only export. A live or contested source is a draft, never a migration gate.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,encodeAbiParameters,encodeFunctionData,keccak256,zeroHash,type Address} from 'viem';
import {roomsChaosAbi as abi} from '../shared/abi-PongRoomsTestnet';
import {roomsLifecycleHubAbi} from '../shared/abi-rooms-lifecycle';
import {decodeHubDelegation} from '../shared/rooms-hub';
import {roomsRankingCandidates} from '../relayer/src/rooms-ranking';
const source=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
const base=createPublicClient({transport:http(process.env.RPC_URL,{timeout:15000,retryCount:0})});
assert.equal(await base.getChainId(),10143);const block=await base.getBlock();
const call=(name:string,args:readonly unknown[]=[]):Promise<any>=>base.readContract({address:source.app,abi,functionName:name,args,blockNumber:block.number} as any);
const delegation=decodeHubDelegation(await base.request({method:'eth_call',params:[{to:source.hub,data:encodeFunctionData({abi:roomsLifecycleHubAbi,functionName:'delegationOf',args:[source.app,zeroHash]})},`0x${block.number.toString(16)}`]}));
const db=new Pool({connectionString:process.env.DATABASE_URL}),c=await db.connect();
let profiles:any[],players:Address[][],pairs:any[];
try{
 await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 profiles=(await c.query('SELECT player,handle,avatar FROM profiles ORDER BY player')).rows;
 players=await Promise.all([0,1].map(mode=>roomsRankingCandidates(c,[source.app,...(source.previousClassic?[source.previousClassic]:[])],mode)));
 pairs=(await c.query("SELECT DISTINCT lower(offer->>'a') AS a,lower(offer->>'b') AS b,COALESCE(offer->>'mode','0')::int AS mode FROM il_offers WHERE app=$1 AND offer->>'ranked'='true'",[source.app.toLowerCase()])).rows;
 await c.query('COMMIT');
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await db.end();}
const handles=new Set<string>(),accounts=new Set<string>();
for(const p of profiles){assert(/^0x[\da-f]{40}$/i.test(p.player));assert(/^[a-z][a-z0-9_]{2,19}$/i.test(p.handle));assert(Number.isInteger(p.avatar)&&p.avatar>=0&&p.avatar<12);assert(!handles.has(p.handle.toLowerCase())&&!accounts.has(p.player.toLowerCase()));handles.add(p.handle.toLowerCase());accounts.add(p.player.toLowerCase());}
const ratings=[];for(let mode=0;mode<2;mode++)for(const player of players[mode]){const rating=await call('ratingOf',[player,mode]);ratings.push({player,mode,...rating});}
// Verify the storage layout before reading the private mapping's public slots.
const artifact=JSON.parse(await readFile('contracts/out/PongRoomsTestnet.sol/PongRoomsTestnetRelease.json','utf8'));
const layout=JSON.parse(await readFile('artifacts/independent-candidate/source-storage-layout.json','utf8'));
const words=layout.storage.find((s:any)=>s.label==='words');assert(words&&words.type.startsWith('t_mapping'));
const code=await base.getBytecode({address:source.app,blockNumber:block.number});assert(code);
const mask=(text:string)=>{for(const refs of Object.values(artifact.deployedBytecode.immutableReferences||{}) as any[])for(const r of refs)text=text.slice(0,2+r.start*2)+'0'.repeat(r.length*2)+text.slice(2+(r.start+r.length)*2);return text.toLowerCase();};
const runtime=(text:string)=>{const bytes=Number.parseInt(text.slice(-4),16);assert(bytes>0&&bytes<500&&text.length>(bytes+2)*2,'Missing Solidity metadata trailer');return mask(text).slice(0,-(bytes+2)*2);};
assert(runtime(code)===runtime(artifact.deployedBytecode.object),'Source runtime differs from the audited storage layout. Export rejected; verify the deployed build before migration.');
const pairSeeds=[],seen=new Set<string>(),day=block.timestamp/86400n;
for(const p of pairs){assert(/^0x[\da-f]{40}$/i.test(p.a)&&/^0x[\da-f]{40}$/i.test(p.b)&&[0,1].includes(p.mode));
 const [a,b]=[p.a,p.b].sort() as Address[];
 const pair=keccak256(encodeAbiParameters([{type:'address'},{type:'address'},{type:'uint256'},{type:'uint8'}],[a,b,day,p.mode]));if(seen.has(pair))continue;seen.add(pair);
 const key=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'},{type:'uint256'},{type:'uint256'}],[source.app,3n,BigInt(pair),0n]));
 const slot=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'}],[key,BigInt(words.slot)]));
 const n=BigInt(await base.getStorageAt({address:source.app,slot,blockNumber:block.number})||'0x0');assert(n<=8n,'Invalid repeat count');if(n)pairSeeds.push({pair,count:Number(n),a,b,mode:p.mode,day:String(day)});
}
const active=await call('activeCount'),genesis=await call('genesisTime');
assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash,'Source block reorganized');
const profileFreeze=process.env.PONG_PROFILE_MIGRATION_FREEZE==='true';
const report={version:1,chainId:10143,source:source.app,hub:source.hub,sourceBlock:String(block.number),sourceHash:block.hash,sourceCodeHash:keccak256(code),genesis:String(genesis),epoch:String(delegation.epoch),ready:delegation.status===0&&active===0n&&profileFreeze,profileFreeze,active:String(active),delegationStatus:delegation.status,profiles,ratings,pairSeeds,createdAt:new Date().toISOString()};
const text=JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2);
await mkdir('artifacts/independent-migration',{recursive:true});await writeFile('artifacts/independent-migration/snapshot.json',text+'\n');
console.log(JSON.stringify({ready:report.ready,source:source.app,block:report.sourceBlock,profiles:profiles.length,ratings:ratings.length,pairs:pairSeeds.length,evidence:keccak256(new TextEncoder().encode(text+'\n'))}));
