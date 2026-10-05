// Read-only snapshot of the existing PUBLIC human season. Never use a private trial.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,keccak256,encodeAbiParameters,maxUint256} from 'viem';
import {monadTestnet} from 'viem/chains';
import {publicIndependentManifest} from '../shared/independent';
import {independentReader} from '../shared/independent-read';
import {readHubDelegation} from '../shared/rooms-hub';

const source=publicIndependentManifest(JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8')));
assert.equal(source.lobby.toLowerCase(),'0x5dbea9692d443e04e1bd0b74fb307b079a5cb212');
assert.equal(source.hub.toLowerCase(),'0x3ef8327f69e09cf721772f345e2a887ea22cd595');
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:20000})});
const db=new Pool({connectionString:process.env.PONG_INDEPENDENT_DATABASE_URL});
const stringify=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2);
try{
 const block=await base.getBlock(),r=independentReader(base,source,block.number);
 const [count,revision,building,slot0,slot1]=await Promise.all([r.ratings('count'),r.ratings('revision'),r.ratings('buildGeneration'),r.lobby('slot',[0n]),r.lobby('slot',[1n])]);
 const results:any[]=[];for(let offset=0n;offset<count;offset+=50n)results.push(...(await r.ratings('resultPage',[offset,50n]))[0]);
 const ratings:any[]=[];for(let mode=0;mode<2;mode++){
  for(let offset=0n;;offset+=100n){const [players,total]=await r.ratings('playerPage',[mode,offset,100n]);
   for(const player of players)ratings.push({player,mode,...await r.ratings('ratingOf',[player,mode])});
   if(offset+100n>=total)break;
  }
 }
 const original=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_SNAPSHOT!,'utf8'));
 // Original seeds are included even if an account has never played since import.
 const pairCounts=new Map<string,number>(original.pairSeeds.map((p:any)=>[p.pair,p.count]));
 for(const e of [...results].reverse())if(e.latest.ranked&&e.latest.status===3){
  const v=e.latest,[a,b]=[v.a,v.b].sort((a:string,b:string)=>a.toLowerCase().localeCompare(b.toLowerCase()));
  const pair=keccak256(encodeAbiParameters([{type:'address'},{type:'address'},{type:'uint256'},{type:'uint8'}],[a,b,BigInt(e.at)/86400n,v.mode]));
  pairCounts.set(pair,Math.min(8,(pairCounts.get(pair)||0)+1));
 }
 const roomIds=(await db.query('SELECT id FROM independent_rooms WHERE lobby=$1',[source.lobby.toLowerCase()])).rows;
 const rooms=[];for(const {id} of roomIds)if(BigInt(id)!==maxUint256)rooms.push({id,room:await r.lobby('room',[BigInt(id)])});
 const pending=(await db.query("SELECT id,status FROM independent_operations WHERE status IN ('queued','pending')")).rows;
 const unsettled=(await db.query('SELECT id,player FROM independent_bettors WHERE lobby=$1 AND NOT settled',[source.lobby.toLowerCase()])).rows;
 const arenas=[];for(const a of source.arenas)arenas.push({app:a.app,delegation:await readHubDelegation(base,source.hub,a.app,block.number),reserved:await r.lobby('reservedMatch',[a.app]),bound:await r.arena(a.app,'boundMatch')});
 const codeHashes:Record<string,string>={};for(const at of [source.lobby,source.ratings,source.family,source.profiles,source.privateData,source.vault,source.market])codeHashes[at]=keccak256((await base.getCode({address:at,blockNumber:block.number}))!);
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash,'Snapshot reorganized');
 const snapshot={schema:'public-human-continuation-v1',chainId:10143,source,sourceBlock:String(block.number),sourceHash:block.hash,sourceTimestamp:String(block.timestamp),codeHashes,
  count:String(count),revision:String(revision),buildGeneration:String(building),slots:[String(slot0),String(slot1)],genesis:source.genesis,
  ratings,pairSeeds:[...pairCounts].map(([pair,count])=>({pair,count})),profiles:original.profiles,results,rooms,pending,unsettled,arenas,
  ready:slot0===0n&&slot1===0n&&building===0n&&results.every(e=>e.finality)&&pending.length===0&&arenas.every(a=>a.reserved===0n),createdAt:new Date().toISOString()};
 await writeFile(process.env.PONG_HUMAN_MIGRATION_OUTPUT!,stringify(snapshot)+'\n',{flag:'wx',mode:0o600});
 console.log(stringify({ready:snapshot.ready,block:snapshot.sourceBlock,results:results.length,ratings:ratings.length,allFinal:results.every(e=>e.finality),pending:pending.length,unsettled:unsettled.length,rooms:rooms.map(v=>({id:v.id,status:v.room.status,expires:v.room.expires,members:v.room.members,proposal:v.room.proposal})),arenas:arenas.map(a=>({app:a.app,status:a.delegation.status,reserved:a.reserved}))}));
}finally{await db.end();}
