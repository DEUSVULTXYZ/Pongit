// Read-only public-source preservation audit. Never prints signed commands.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,keccak256,decodeFunctionData,encodeAbiParameters,type Address} from 'viem';
import {Pool} from 'pg';
import {publicIndependentManifest} from '../shared/independent';
import {independentReader} from '../shared/independent-read';
import {independentRules} from '../shared/independent-rules';
import {readHubDelegation} from '../shared/rooms-hub';
const snapshot=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_SNAPSHOT!,'utf8'));
const m=publicIndependentManifest(JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8')));
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
const db=new Pool({connectionString:process.env.PONG_INDEPENDENT_DATABASE_URL});
const report:any={at:new Date().toISOString(),source:snapshot.source.lobby,target:m.lobby,passed:false};
try{
 const block=await base.getBlock(),r=independentReader(base,m,block.number),old=independentReader(base,snapshot.source,block.number);
 assert.equal(m.hub.toLowerCase(),'0x98922c6e5e4bea62761c71d2401c7ec2c26ec43e');
 for(const k of ['family','profiles','privateData'] as const){assert.equal(m[k].toLowerCase(),snapshot.source[k].toLowerCase());assert.equal(keccak256((await base.getCode({address:m[k],blockNumber:block.number}))!),snapshot.codeHashes[snapshot.source[k]]);}
 for(const v of snapshot.ratings)assert.deepEqual(await r.ratings('ratingOf',[v.player,v.mode]),await old.ratings('ratingOf',[v.player,v.mode]));
 assert.equal(String(await old.ratings('count')),snapshot.count);assert.equal(String(await old.ratings('revision')),snapshot.revision);
 assert.equal(await r.ratings('migrationSealed'),true);
 assert.equal(await r.ratings('migrationEvidence'),keccak256(new TextEncoder().encode(await readFile(process.env.PONG_INDEPENDENT_SNAPSHOT!,'utf8'))));
 const layout=JSON.parse(await readFile('/evidence/ratings-storage-layout.json','utf8'));
 const slot=layout.storage.find((v:any)=>v.label==='pairSeeds').slot;
 for(const seed of snapshot.pairSeeds){const at=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'}],[seed.pair,BigInt(slot)]));assert.equal(BigInt((await base.getStorageAt({address:m.ratings,slot:at,blockNumber:block.number}))!),BigInt(seed.count));}
 const operations=(await db.query("SELECT data FROM independent_operations WHERE target=$1 AND status='confirmed'",[snapshot.source.lobby.toLowerCase()])).rows;
 let blocks=0;const owners=new Set<Address>();
 for(const row of operations){const call=decodeFunctionData({abi:independentRules(snapshot.source).lobby,data:row.data});if(call.functionName!=='relay')continue;
  owners.add(call.args![0] as Address);const inner=decodeFunctionData({abi:independentRules(snapshot.source).lobby,data:call.args![1] as `0x${string}`});if(inner.functionName==='blockPlayer')blocks++;
 }
 report.confirmedSocialCommands=operations.length;report.blockCommands=blocks;
 assert.equal(blocks,0,'Explicit block preferences require compatible preservation before declaring migration complete');
 let pendingInvitations=0;
 for(const owner of owners)for(let offset=0n;;offset+=32n){const [ids,total]=await old.lobby('invitationPage',[owner,true,offset,32n]);for(const id of ids){const v=await old.lobby('invitation',[id]);if(v.status===1&&v.expires>=block.timestamp)pendingInvitations++;}if(offset+32n>=total)break;}
 assert.equal(pendingInvitations,0,'Preserve pending invitations');
 report.pendingInvitations=pendingInvitations;report.ratings=snapshot.ratings.length;report.pairSeeds=snapshot.pairSeeds.length;report.historicalResults=snapshot.count;
 report.arenas=[];for(const a of m.arenas){const d=await readHubDelegation(base,m.hub,a.app,block.number);report.arenas.push({app:a.app,epoch:String(d.epoch),status:d.status,batches:String(d.batchIndex)});assert.equal(d.status,1);}
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash);report.block=String(block.number);report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].slice(0,250);process.exitCode=1;}
finally{await db.end();await writeFile('/evidence/preservation-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
