import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256,zeroHash,type Hex} from 'viem';
import {generatePrivateKey} from 'viem/accounts';
import {independentEngine} from '../relayer/src/independent-engine';
import {resultFixture} from './fixtures/reusable-result';

const app='0x0000000000000000000000000000000000000012';
function fixture(version:4|12|14=12){
 const jobs:any[]=[],sent:Hex[]=[],receipts=new Map<string,any>();let nonce=0,lose=false,pendingAhead=false,onCall=()=>{};
 let logs:any[]=[],archiveError=false;const archived:any[]=[];
 const db:any={connect:async()=>({query:async()=>({rows:[{ok:true}]}),release:()=>{}}),query:async(sql:string,v:any[]=[])=>{
  if(sql.startsWith('SELECT DISTINCT epoch'))return{rows:jobs.filter(j=>BigInt(j.epoch)<BigInt(v[1])&&['pending','quarantined'].includes(j.status)).map(j=>({epoch:j.epoch}))};
  if(sql.startsWith('SELECT * FROM il_engine_jobs')&&sql.includes('request_key'))return {rows:jobs.filter(j=>j.epoch===v[1]&&j.request_key===v[2]&&['observed','confirmed'].includes(j.status))};
  if(sql.startsWith('SELECT * FROM il_engine_jobs'))return {rows:jobs.filter(j=>j.status==='pending')};
  if(sql.startsWith('INSERT INTO il_engine_jobs'))jobs.push({app:v[0],id:v[1],nonce:v[2],raw:v[3],hash:v[4],epoch:v[5],signer:v[6],action:v[7],match_id:v[8],request_key:v[9],status:'pending'});
  if(sql.startsWith("UPDATE il_engine_jobs SET status='obsolete'")){for(const j of jobs)if(j.epoch===v[1]&&['pending','quarantined'].includes(j.status)){j.status='obsolete';j.resolution=JSON.parse(v[2]);}}
  else if(sql.startsWith('UPDATE il_engine_jobs')){const j=jobs.find(j=>j.id===v[1]);assert(j);j.status=v[2];}
  return {rows:[]};
 }};
 const node:any={call:async()=>{onCall();},getTransactionCount:async(o:any)=>nonce+(pendingAhead&&o.blockTag==='pending'?1:0),
  getTransactionReceipt:async({hash}:any)=>{if(!receipts.has(hash))throw Error('not found');return receipts.get(hash);},
  request:async({method,params}:any)=>{assert.equal(method,'interlude_sendTransaction');const raw=params[0];sent.push(raw);nonce++;
   const r={transactionHash:keccak256(raw),status:'0x1',blockHash:zeroHash,blockNumber:'0x40',logs};receipts.set(r.transactionHash,r);
   if(lose){lose=false;throw Error('response lost after execution');}return r;
  }};
 const feed:any={invalidate:()=>{},watch:()=>()=>{},read:async(id:bigint)=>({id}),receipt:async(id:bigint)=>({id})};
 const engine=independentEngine(db,{} as any,app,'https://private.invalid',generatePrivateKey(),undefined,{rulesVersion:version,node,feed,
  ...(version===14?{archive:async(results:any[])=>{if(archiveError)throw Error('archive unavailable');archived.push(...results);}}:{})});
 engine.bind(10n,2n);
 return {engine,jobs,sent,archived,logs:(v:any[])=>logs=v,archiveError:(v:boolean)=>archiveError=v,lose:()=>lose=true,ahead:()=>pendingAhead=true,changeDuringSimulation:()=>onCall=()=>{engine.bind(11n,3n);}};
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

test('reusable human completion stays unresolved until archived, including read-only reconciliation',async()=>{
 const f=fixture(14),result=resultFixture(14,app,10n,2n);f.logs(result.logs);f.archiveError(true);
 await assert.rejects(f.engine.send('tick',[2n,10n]),/archive unavailable/);
 assert.equal(f.jobs[0].status,'pending');assert.equal(f.sent.length,1);
 await assert.rejects(f.engine.reconcile(),/archive unavailable/);assert.equal(f.jobs[0].status,'pending');
 f.archiveError(false);await f.engine.reconcile();
 assert.equal(f.jobs[0].status,'observed');assert.equal(f.sent.length,1);assert.equal(f.archived[0].canonical,result.canonical);
 f.engine.stop();
});

test('reusable human writer rejects stale outer and embedded references before journaling',async()=>{
 const f=fixture(14);
 for(const [epoch,id,requestEpoch] of [[1n,10n,2n],[2n,11n,2n],[2n,10n,1n]]){
  await assert.rejects(f.engine.send('submitRandomness',[epoch,id,requestEpoch<<64n,'0x12']),/epoch|another match/);
 }
 await f.engine.send('tick',[2n,10n]);assert.equal(f.sent.length,1);assert.equal(f.jobs.length,1);
 f.engine.stop();
 assert.throws(()=>independentEngine({} as any,{} as any,app,'https://private.invalid',generatePrivateKey(),undefined,{rulesVersion:14}),/durable result archive/);
});

test('a restart in a newer epoch retires an old uncertain command only against its sealed final root',async()=>{
 const f=fixture(14);f.lose();await assert.rejects(f.engine.send('tick',[2n,10n]),/response lost/);
 f.engine.bind(11n,3n);const original=f.jobs[0].hash;
 await assert.rejects(f.engine.retireOlder(3n,async()=>false),/sealed final root/);assert.equal(f.jobs[0].status,'pending');
 await assert.rejects(f.engine.retireOlder(3n,async()=>{throw Error('RPC unavailable');}),/unavailable/);assert.equal(f.jobs[0].status,'pending');
 await f.engine.retireOlder(3n,async epoch=>{assert.equal(epoch,2n);return true;});
 assert.equal(f.jobs[0].status,'obsolete');assert.equal(f.jobs[0].hash,original);assert.equal(f.jobs[0].resolution.kind,'sealed-epoch');
 assert.equal(f.sent.length,1);f.engine.stop();
});
