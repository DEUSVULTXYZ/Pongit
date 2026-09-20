import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionResult,keccak256,parseTransaction,zeroAddress,zeroHash,type Hex} from 'viem';
import {generatePrivateKey} from 'viem/accounts';
import {createPoolEngine,POOL_COMMAND_GAS} from '../relayer/src/agents/pool-engine';
import {roomsLifecycleHubAbi} from '../shared/abi-rooms-lifecycle';
import {resultFixture} from './fixtures/reusable-result';

const app='0x0000000000000000000000000000000000000011';
function fixture(){
 const jobs:any[]=[],sent:Hex[]=[],receipts=new Map<Hex,any>();let nonce=0,status=1,epoch=1n,connectError=false,reorg=false;
 let behavior:'ok'|'lost-after-execution'|'lost-before-execution'|'429'|'generic'|'cap'='ok';
 let logs:any[]=[],archiveError=false;const archived:any[]=[];
 const receipt=(raw:Hex)=>({transactionHash:keccak256(raw),status:'0x1',blockNumber:'0x40',blockHash:zeroHash,logs});
 const node:any={getTransactionCount:async()=>nonce,getTransactionReceipt:async({hash}:{hash:Hex})=>receipts.get(hash)??null,request:async(r:any)=>{
  if(r.method==='interlude_session')return{app,epoch:String(epoch),chainId:4242,baseBlock:20};
  assert.equal(r.method,'interlude_sendTransaction');const raw=r.params[0];sent.push(raw);
  if(behavior==='429')throw Object.assign(Error('busy'),{status:429});
  if(behavior==='generic')throw Error('transaction rejected before execution: duplicate request');
  if(behavior==='cap')throw Error('transaction rejected before execution: transaction gas limit is greater than the cap');
  if(behavior==='lost-before-execution')throw Error('response lost');
  if(!receipts.has(keccak256(raw))){assert.equal(parseTransaction(raw).nonce,nonce);nonce++;receipts.set(keccak256(raw),receipt(raw));}
  if(behavior==='lost-after-execution')throw Error('response lost');return receipts.get(keccak256(raw));
 }};
 const fields=roomsLifecycleHubAbi[0].outputs[0].components;
 const base:any={getBlock:async(options?:any)=>({number:50n,hash:options&&reorg?keccak256('0x01'):zeroHash,timestamp:1000n}),request:async()=>{
  const d:any=Object.fromEntries(fields.map(f=>[f.name,f.type==='address'?zeroAddress:f.type==='bytes32'?zeroHash:/^uint(8|16|32)$/.test(f.type)?0:0n]));
  Object.assign(d,{status,epoch,expiresAt:10000n,baseBlock:20n});return encodeFunctionResult({abi:roomsLifecycleHubAbi,functionName:'delegationOf',result:d});
 }};
 const db:any={connect:async()=>{if(connectError)throw Error('database unavailable');return{query:async()=>({rows:[{ok:true}]}),release(){}};},query:async(sql:string,a:any[])=>{
  if(sql.startsWith('SELECT'))return{rows:jobs.filter(j=>sql.includes('operation=$3')?j.epoch===a[1]&&j.operation===a[2]:j.status==='pending').slice(0,1)};
  if(sql.startsWith('INSERT')){jobs.push({app:a[0],id:a[1],operation:a[2],epoch:a[3],signer:a[4],nonce:a[5],raw:a[6],hash:a[7],status:'pending'});return{rowCount:1};}
  if(sql.includes("SET status='obsolete'")){for(const j of jobs)if(BigInt(j.epoch)<=BigInt(a[1])&&j.status==='pending'){j.status='obsolete';j.resolution=a[2];}return{rowCount:1};}
  const j=jobs.find(j=>j.id===a[1]);assert(j);j.status=sql.includes("SET status='refused'")?'refused':a[2];j.resolution=sql.includes("SET status='refused'")?a[2]:a[3];return{rowCount:1};
 }};
 const receiptIds:bigint[]=[],readIds:bigint[]=[];
 const feed:any={watch:()=>()=>{},read:async(id:bigint)=>{readIds.push(id);return{id,phase:2};},receipt:async(id:bigint)=>{receiptIds.push(id);return{id,phase:2};},invalidate(){}};
 const key=generatePrivateKey();const make=(id=1n,series=false,reusable=false)=>createPoolEngine(db,base,zeroAddress,app,'https://fixture.example',key,{epoch,id},undefined,{node,feed,series,reusable,archive:async(results)=>{if(archiveError)throw Error('archive unavailable');archived.push(...results);}});
 return{make,jobs,sent,receipts,receiptIds,readIds,archived,logs:(value:any[])=>{logs=value;},archiveError:(value:boolean)=>{archiveError=value;},reorg:(value:boolean)=>{reorg=value;},behavior:(b:typeof behavior)=>{behavior=b;},status:(s:number)=>{status=s;},epoch:(e:bigint)=>{epoch=e;},dbError:(b:boolean)=>{connectError=b;}};
}
test('lost executed response reconciles exact receipt without another command or nonce',async()=>{
 const f=fixture(),e=f.make();f.behavior('lost-after-execution');await assert.rejects(e.send('first','tick',[1n]),/lost/);
 assert.equal(f.jobs[0].status,'pending');assert.equal(parseTransaction(f.jobs[0].raw).gas,POOL_COMMAND_GAS);
 f.behavior('ok');await assert.rejects(e.send('next','tick',[1n]),/Previous command reconciled/);
 assert.equal(f.sent.length,1);assert.equal(f.jobs.length,1);assert.equal(f.jobs[0].status,'observed');
 await e.send('next','tick',[1n]);assert.equal(parseTransaction(f.jobs[1].raw).nonce,1);e.close();
});
test('lost unexecuted response resends identical bytes instead of replacing the nonce',async()=>{
 const f=fixture(),e=f.make();f.behavior('lost-before-execution');await assert.rejects(e.send('first','tick',[1n]));
 f.behavior('ok');await e.send('first','tick',[1n]);assert.equal(f.sent.length,2);assert.equal(f.sent[0],f.sent[1]);assert.equal(f.jobs.length,1);e.close();
});
test('429 and generic refusal retain uncertainty, permanent gas refusal retains its full journal',async()=>{
 for(const reason of ['429','generic','cap'] as const){
  const f=fixture(),e=f.make();f.behavior(reason);await assert.rejects(e.send('first','tick',[1n]));
  assert.equal(f.jobs[0].status,reason==='cap'?'refused':'pending');assert.equal(keccak256(f.jobs[0].raw),f.jobs[0].hash);
  if(reason==='cap'){f.behavior('ok');await e.send('after-reviewed-limit','tick',[1n]);assert.equal(f.jobs.length,2);assert.equal(f.jobs[0].nonce,f.jobs[1].nonce);}
  e.close();
 }
});
test('a verified closed epoch retires uncertainty without resending into the next epoch',async()=>{
 const f=fixture();let e=f.make();f.behavior('lost-before-execution');await assert.rejects(e.send('first','tick',[1n]));e.close();
 f.status(0);e=f.make();await assert.rejects(e.send('late','tick',[1n]),/lifecycle/);assert.equal(f.jobs[0].status,'obsolete');assert.equal(f.sent.length,1);e.close();
 f.status(1);f.epoch(2n);f.behavior('ok');e=f.make();await e.send('new','tick',[1n]);assert.equal(f.jobs[1].epoch,'2');assert.equal(f.jobs[1].nonce,'0');e.close();
});
test('a database interruption releases the local writer guard and changed operation data is refused',async()=>{
 const f=fixture(),e=f.make();f.dbError(true);await assert.rejects(e.send('first','tick',[1n]),/database/);
 f.dbError(false);await e.send('first','tick',[1n]);await assert.rejects(e.send('first','start'),/cannot change/);e.close();
});

test('reorganized closure evidence preserves the exact uncertain command and sends nothing',async()=>{
 const f=fixture();let e=f.make();f.behavior('lost-before-execution');await assert.rejects(e.send('first','tick',[1n]));e.close();
 const raw=f.jobs[0].raw;f.status(0);f.reorg(true);e=f.make();
 await assert.rejects(e.send('late','tick',[1n]),/publication changed/);
 assert.equal(f.jobs[0].status,'pending');assert.equal(f.jobs[0].raw,raw);assert.equal(f.sent.length,1);
 f.reorg(false);await assert.rejects(e.send('late','tick',[1n]),/lifecycle/);
 assert.equal(f.jobs[0].status,'obsolete');assert.equal(f.sent.length,1);e.close();
});

test('series reconciles an executed previous-match command without importing its snapshot',async()=>{
 for(const action of ['tick','start','advanceSeries'] as const){
  const f=fixture();let e=f.make(1n,true);f.behavior('lost-after-execution');
  await assert.rejects(e.send('same-label',action,action==='start'?[]:[1n]),/lost/);e.close();
  const raw=f.jobs[0].raw;e=f.make(2n,true);f.behavior('ok');
  await assert.rejects(e.send('same-label','tick',[2n]),{code:'POOL_RECONCILED'});
  assert.equal(f.sent.length,1);assert.equal(f.jobs[0].raw,raw);assert.deepEqual(f.receiptIds,[]);assert.deepEqual(f.readIds,[2n]);
  await e.send('same-label','tick',[2n]);assert.equal(f.jobs.length,2);assert.equal(f.jobs[1].nonce,'1');
  assert.equal(f.jobs[0].operation,'match:1:same-label');assert.equal(f.jobs[1].operation,'match:2:same-label');e.close();
 }
});

test('series replays only the exact uncertain prior bytes before any next-match action',async()=>{
 const f=fixture();let e=f.make(1n,true);f.behavior('lost-before-execution');
 await assert.rejects(e.send('advance','advanceSeries',[1n]));e.close();
 e=f.make(2n,true);f.behavior('ok');await assert.rejects(e.send('tick','tick',[2n]),{code:'POOL_RECONCILED'});
 assert.equal(f.sent.length,2);assert.equal(f.sent[0],f.sent[1]);assert.equal(f.jobs.length,1);assert.deepEqual(f.receiptIds,[]);e.close();
});

test('series methods stay opt-in and cannot sign an action targeting another current match',async()=>{
 const f=fixture();let e=f.make();await assert.rejects(e.send('advance','advanceSeries',[1n]),/not enabled/);e.close();
 e=f.make(2n,true);await assert.rejects(e.send('wrong','advanceSeries',[1n]),/another match/);
 await assert.rejects(e.send('wrong','tick',[1n]),/another match/);assert.equal(f.sent.length,0);
 await e.send('drain','drainSeries',[2n]);assert.equal(f.jobs.length,1);e.close();
});

test('reusable matches preserve exact pending bytes and never import a previous start receipt',async()=>{
 for(const action of ['start','tick','cancelUnready'] as const){
  const f=fixture();let e=f.make(91n,false,true);f.behavior('lost-after-execution');
  await assert.rejects(e.send('same',action,[1n,91n]),/lost/);e.close();
  const raw=f.jobs[0].raw;e=f.make(92n,false,true);f.behavior('ok');
  await assert.rejects(e.send('same','tick',[1n,92n]),{code:'POOL_RECONCILED'});
  assert.equal(f.sent.length,1);assert.equal(f.jobs[0].raw,raw);assert.deepEqual(f.receiptIds,[]);assert.deepEqual(f.readIds,[92n]);
  await e.send('same','tick',[1n,92n]);assert.equal(f.jobs[1].nonce,'1');
  assert.equal(f.jobs[0].operation,'match:91:same');assert.equal(f.jobs[1].operation,'match:92:same');e.close();
 }
});

test('reusable binding rejects another epoch, match or incompatible series mode before signing',async()=>{
 const f=fixture(),e=f.make(91n,false,true);
 await assert.rejects(e.send('bad','tick',[2n,91n]),/another match or epoch/);
 await assert.rejects(e.send('bad','start',[1n,92n]),/another match or epoch/);
 await assert.rejects(e.send('bad','admit',[{epoch:1n,matchId:92n}]),/another match or epoch/);
 await assert.rejects(e.send('bad','advanceSeries',[91n]),/not enabled/);
 assert.throws(()=>f.make(91n,true,true),/one arena generation/);assert.equal(f.sent.length,0);e.close();
});

test('result archive failure retains the completed command and recovers exact receipt before slot reuse',async()=>{
 const f=fixture(),result=resultFixture(15,app,91n,1n);let e=f.make(91n,false,true);
 f.logs(result.logs);f.archiveError(true);await assert.rejects(e.send('finish','tick',[1n,91n]),/archive unavailable/);e.close();
 assert.equal(f.jobs[0].status,'pending');assert.equal(f.sent.length,1);assert.equal(f.archived.length,0);
 f.archiveError(false);e=f.make(92n,false,true);
 await assert.rejects(e.send('start','start',[1n,92n]),{code:'POOL_RECONCILED'});
 assert.equal(f.jobs.length,1);assert.equal(f.sent.length,1);assert.equal(f.jobs[0].status,'observed');
 assert.equal(f.archived[0].matchId,91n);assert.equal(f.archived[0].canonical,result.canonical);assert.deepEqual(f.receiptIds,[]);e.close();
});

test('a missing terminal commitment cannot acknowledge its command',async()=>{
 const f=fixture(),result=resultFixture(15,app,91n,1n),e=f.make(91n,false,true);
 f.logs(result.logs.slice(1));await assert.rejects(e.send('finish','tick',[1n,91n]),/missing its commitment/);
 assert.equal(f.jobs[0].status,'pending');assert.equal(f.archived.length,0);e.close();
});
