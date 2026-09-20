import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256,zeroHash,type Hex} from 'viem';
import {generatePrivateKey} from 'viem/accounts';
import {independentEngine} from '../relayer/src/independent-engine';

const app='0x0000000000000000000000000000000000000012';
function fixture(version:4|12=12){
 const jobs:any[]=[],sent:Hex[]=[],receipts=new Map<string,any>();let nonce=0,lose=false,pendingAhead=false,onCall=()=>{};
 const db:any={connect:async()=>({query:async()=>({rows:[{ok:true}]}),release:()=>{}}),query:async(sql:string,v:any[]=[])=>{
  if(sql.startsWith('SELECT * FROM il_engine_jobs')&&sql.includes('request_key'))return {rows:jobs.filter(j=>j.epoch===v[1]&&j.request_key===v[2]&&['observed','confirmed'].includes(j.status))};
  if(sql.startsWith('SELECT * FROM il_engine_jobs'))return {rows:jobs.filter(j=>j.status==='pending')};
  if(sql.startsWith('INSERT INTO il_engine_jobs'))jobs.push({app:v[0],id:v[1],nonce:v[2],raw:v[3],hash:v[4],epoch:v[5],signer:v[6],action:v[7],match_id:v[8],request_key:v[9],status:'pending'});
  if(sql.startsWith('UPDATE il_engine_jobs')){const j=jobs.find(j=>j.id===v[1]);assert(j);j.status=v[2];}
  return {rows:[]};
 }};
 const node:any={call:async()=>{onCall();},getTransactionCount:async(o:any)=>nonce+(pendingAhead&&o.blockTag==='pending'?1:0),
  getTransactionReceipt:async({hash}:any)=>{if(!receipts.has(hash))throw Error('not found');return receipts.get(hash);},
  request:async({method,params}:any)=>{assert.equal(method,'interlude_sendTransaction');const raw=params[0];sent.push(raw);nonce++;
   const r={transactionHash:keccak256(raw),status:'0x1',blockHash:zeroHash};receipts.set(r.transactionHash,r);
   if(lose){lose=false;throw Error('response lost after execution');}return r;
  }};
 const feed:any={invalidate:()=>{},watch:()=>()=>{},read:async(id:bigint)=>({id}),receipt:async(id:bigint)=>({id})};
 const engine=independentEngine(db,{} as any,app,'https://private.invalid',generatePrivateKey(),undefined,{rulesVersion:version,node,feed});
 engine.bind(10n,2n);
 return {engine,jobs,sent,lose:()=>lose=true,ahead:()=>pendingAhead=true,changeDuringSimulation:()=>onCall=()=>{engine.bind(11n,3n);}};
}

test('lost execution response resolves the same journal without signing another nonce',async()=>{
 const f=fixture();f.lose();await assert.rejects(f.engine.send('tick',[10n]),/response lost/);
 assert.equal(f.jobs.length,1);assert.equal(f.jobs[0].status,'pending');
 await f.engine.send('tick',[10n]);assert.equal(f.jobs.length,1);assert.equal(f.sent.length,1);assert.equal(f.jobs[0].status,'observed');
 f.engine.stop();
});
test('confirmed owner renewal is deduplicated using the actual observed journal status',async()=>{
 const f=fixture();const renewal={player:app,key:app,epoch:2n,matchId:10n,revision:0n,expires:2000n,deadline:1900n};
 await f.engine.send('renewActive',[renewal,'0x12']);await f.engine.send('renewActive',[renewal,'0x12']);
 assert.equal(f.sent.length,1);assert.equal(f.jobs[0].status,'observed');f.engine.stop();
});
test('stale proofs, wrong matches and a busy nonce cannot enter the new command journal',async()=>{
 const f=fixture();await assert.rejects(f.engine.send('submitRandomness',[10n,1n<<64n,'0x12']),/epoch/);
 await assert.rejects(f.engine.send('tick',[11n]),/another match/);f.ahead();await assert.rejects(f.engine.send('tick',[10n]),/nonce is still in flight/);
 assert.equal(f.jobs.length,0);assert.equal(f.sent.length,0);f.engine.stop();
});
test('changing the arena binding during simulation refuses a fresh signature',async()=>{
 const f=fixture();f.changeDuringSimulation();await assert.rejects(f.engine.send('tick',[10n]),/binding changed before signing/);
 assert.equal(f.jobs.length,0);assert.equal(f.sent.length,0);f.engine.stop();
});
test('a recovered action cannot resolve a different requested command',async()=>{
 const f=fixture();f.lose();await assert.rejects(f.engine.send('start'),/response lost/);
 await assert.rejects(f.engine.send('tick',[10n]),/Previous command reconciled/);
 assert.equal(f.jobs[0].action,'start');assert.equal(f.jobs[0].status,'observed');assert.equal(f.sent.length,1);f.engine.stop();
 const legacy=fixture(4);await assert.rejects(legacy.engine.send('start'),/not supported/);assert.equal(legacy.sent.length,0);legacy.engine.stop();
});
