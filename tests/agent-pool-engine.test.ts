import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionResult,keccak256,parseTransaction,zeroAddress,zeroHash,type Hex,type Address} from 'viem';
import {reusableAgentArenaAbi} from '../shared/abi-ReusableAgentArena';
import {generatePrivateKey} from 'viem/accounts';
import {createPoolEngine,POOL_COMMAND_GAS} from '../relayer/src/agents/pool-engine';
import {roomsLifecycleHubAbi} from '../shared/abi-rooms-lifecycle';
import {resultFixture} from './fixtures/reusable-result';
import {NO_LEASE_HUB} from '../shared/hub-lease';

const app='0x0000000000000000000000000000000000000011';
function fixture(hub:Address=zeroAddress,expiresAt=10000n){
 const jobs:any[]=[],sent:Hex[]=[],receipts=new Map<Hex,any>();let nonce=0,status=1,epoch=1n,connectError=false,reorg=false,now=0;
 let blockGate:Promise<void>|undefined,blockError=false;
 let behavior:'ok'|'lost-after-execution'|'lost-before-execution'|'429'|'generic'|'cap'|'halt'='ok';
 let publication:any={app,epoch:'1',ok:true,halted:null,committedBatches:1};
 let logs:any[]=[],archiveError=false,receiptReads=0,nonceReads=0,reset=false,feedError=false,currentId=0n;const archived:any[]=[];
 const receipt=(raw:Hex)=>({transactionHash:keccak256(raw),status:'0x1',blockNumber:'0x40',blockHash:zeroHash,logs});
 const node:any={readContract:async({functionName}:any)=>functionName==='resultCommitment'?[epoch,0,zeroHash]:[currentId?epoch:0n,currentId],getTransactionCount:async()=>{nonceReads++;return nonce;},getTransactionReceipt:async({hash}:{hash:Hex})=>{receiptReads++;return receipts.get(hash)??null;},request:async(r:any)=>{
  if(r.method==='interlude_session')return{app,epoch:String(epoch),chainId:4242,baseBlock:20};
  assert.equal(r.method,'interlude_sendTransaction');const raw=r.params[0];sent.push(raw);
  if(behavior==='429')throw Object.assign(Error('busy'),{status:429});
  if(behavior==='generic')throw Error('transaction rejected before execution: duplicate request');
  if(behavior==='cap')throw Error('transaction rejected before execution: transaction gas limit is greater than the cap');
  if(behavior==='halt')throw Error('this session is over and the node is no longer accepting transactions: batch 1 could not be settled');
  if(behavior==='lost-before-execution')throw Error('response lost');
  if(!receipts.has(keccak256(raw))){assert.equal(parseTransaction(raw).nonce,nonce);nonce++;receipts.set(keccak256(raw),receipt(raw));}
  if(behavior==='lost-after-execution')throw Error('response lost');return receipts.get(keccak256(raw));
 }};
 const fields=roomsLifecycleHubAbi[0].outputs[0].components;
 const base:any={getBlock:async(options?:any)=>{await blockGate;if(blockError)throw Error('RPC unavailable');return{number:50n,hash:options&&reorg?keccak256('0x01'):zeroHash,timestamp:1000n};},request:async()=>{
  const d:any=Object.fromEntries(fields.map(f=>[f.name,f.type==='address'?zeroAddress:f.type==='bytes32'?zeroHash:/^uint(8|16|32)$/.test(f.type)?0:0n]));
  Object.assign(d,{status,epoch,expiresAt,baseBlock:20n});return encodeFunctionResult({abi:roomsLifecycleHubAbi,functionName:'delegationOf',result:d});
 }};
 const db:any={connect:async()=>{if(connectError)throw Error('database unavailable');return{query:async()=>({rows:[{ok:true}]}),release(){}};},query:async(sql:string,a:any[])=>{
  if(sql.startsWith('SELECT'))return{rows:jobs.filter(j=>sql.includes('id<>$5')?j.id!==a[4]&&j.epoch===a[1]&&(j.status==='pending'||j.signer===a[2]&&String(j.nonce)===String(a[3])&&!['refused','obsolete'].includes(j.status)):sql.includes('operation=$3')?j.epoch===a[1]&&j.operation===a[2]:j.status==='pending').slice(0,1)};
  if(sql.startsWith('INSERT')){
   if(jobs.some(j=>j.app===a[0]&&j.epoch===a[3]&&String(j.nonce)===String(a[5])&&!['refused','obsolete'].includes(j.status)))throw Error('pool_used_nonce');
   jobs.push({app:a[0],id:a[1],operation:a[2],epoch:a[3],signer:a[4],nonce:a[5],raw:a[6],hash:a[7],status:'pending'});return{rowCount:1};}
  if(sql.includes("SET status='obsolete'")){for(const j of jobs)if(BigInt(j.epoch)<=BigInt(a[1])&&j.status==='pending'){j.status='obsolete';j.resolution=a[2];}return{rowCount:1};}
  const j=jobs.find(j=>j.id===a[1]);assert(j);j.status=sql.includes("SET status='refused'")?'refused':a[2];j.resolution=sql.includes("SET status='refused'")?a[2]:a[3];return{rowCount:1};
 }};
 const receiptIds:bigint[]=[],readIds:bigint[]=[];
 const feed:any={watch:()=>()=>{},read:async(id:bigint)=>{readIds.push(id);return{id,phase:2,reset};},receipt:async(id:bigint)=>{if(feedError)throw Error('snapshot gap');receiptIds.push(id);return{id,phase:2};},invalidate(){}};
 const key=generatePrivateKey();const make=(id=1n,series=false,reusable=false,publicationProbe?:'epoch-marker-v1')=>createPoolEngine(db,base,hub,app,'https://fixture.example',key,{epoch,id},undefined,{node,feed,series,reusable,publicationProbe,now:()=>now,publicationFetch:async()=>{if(publication instanceof Error)throw publication;return new Response(JSON.stringify(publication));},archive:async(results)=>{if(archiveError)throw Error('archive unavailable');archived.push(...results);}});
 return{make,jobs,sent,receipts,receiptIds,readIds,archived,publication:(v:any)=>{publication=v;},nonce:(v:number)=>{nonce=v;},currentId:(v:bigint)=>{currentId=v;},now:(v:number)=>{now=v;},blockError:(v:boolean)=>{blockError=v;},blockGate:(v:Promise<void>|undefined)=>{blockGate=v;},receiptReads:()=>receiptReads,nonceReads:()=>nonceReads,reset:()=>{reset=true;},feedError:(v:boolean)=>{feedError=v;},logs:(value:any[])=>{logs=value;},archiveError:(value:boolean)=>{archiveError=value;},reorg:(value:boolean)=>{reorg=value;},behavior:(b:typeof behavior)=>{behavior=b;},status:(s:number)=>{status=s;},epoch:(e:bigint)=>{epoch=e;},dbError:(b:boolean)=>{connectError=b;}};
}

function historicalHalt(f:ReturnType<typeof fixture>){
 const job=f.jobs[0];job.status='refused';job.resolution={kind:'permanent-pre-execution-refusal',reason:'this session is over and the node is no longer accepting transactions',latestNonce:job.nonce};return job;
}

test('v3 no-lease sessions retain the three-second lifecycle fence and stop on closure',async()=>{
 const f=fixture(NO_LEASE_HUB,0n),e=f.make(0n,false,true,'epoch-marker-v1');
 await e.probePublication();assert.equal(f.sent.length,1);
 f.now(3001);f.status(2);
 await assert.rejects(e.probePublication(),/own lifecycle recovery/);
 assert.equal(f.sent.length,1);e.close();
});

test('zero expiry is invalid on unknown/legacy hubs and finite v3 expiry remains binding',async()=>{
 for(const [hub,expiry] of [[zeroAddress,0n],[NO_LEASE_HUB,1000n]] as const){
  const f=fixture(hub,expiry),e=f.make(0n,false,true,'epoch-marker-v1');
  await assert.rejects(e.probePublication(),/own lifecycle recovery/);
  assert.equal(f.sent.length,0);assert.equal(f.jobs.length,0);e.close();
 }
 const f=fixture(NO_LEASE_HUB,0n),e=f.make(0n,false,true,'epoch-marker-v1');f.epoch(2n);
 await assert.rejects(e.probePublication(),/own lifecycle recovery/);assert.equal(f.sent.length,0);e.close();
});

test('state-changing publication preflight resumes exact bytes after a lost response and never invents a game frame',async()=>{
 const f=fixture();let e=f.make(0n,false,true,'epoch-marker-v1');f.behavior('lost-after-execution');
 await assert.rejects(e.probePublication(),/response lost/);const job=f.jobs[0],raw=job.raw;
 const decoded=decodeFunctionData({abi:reusableAgentArenaAbi,data:parseTransaction(raw).data!});
 assert.equal(decoded.functionName,'preparePublication');assert.deepEqual(decoded.args,[1n]);assert.equal(job.operation,'publication-marker-v1');
 e.close();e=f.make(0n,false,true,'epoch-marker-v1');f.behavior('ok');await e.probePublication();await e.probePublication();
 assert.equal(f.jobs.length,1);assert.equal(f.sent.length,1);assert.equal(job.status,'observed');assert.deepEqual(f.receiptIds,[]);assert.deepEqual(f.readIds,[]);
 e.close();const game=f.make(17n,false,true,'epoch-marker-v1');await game.send('start','start',[1n,17n]);
 assert.equal(f.jobs[1].nonce,'1');game.close();
});

test('state-changing preflight preserves RPC uncertainty, refuses another game and binds each new epoch',async()=>{
 const f=fixture();let e=f.make(0n,false,true,'epoch-marker-v1');f.behavior('429');
 await assert.rejects(e.probePublication());assert.equal(f.jobs[0].status,'pending');const raw=f.jobs[0].raw;
 f.behavior('ok');await e.probePublication();assert.equal(f.sent[1],raw);e.close();
 f.currentId(17n);e=f.make(0n,false,true,'epoch-marker-v1');await assert.rejects(e.probePublication(),/admitted match/);e.close();
 f.currentId(0n);f.epoch(2n);f.nonce(0);e=f.make(0n,false,true,'epoch-marker-v1');await e.probePublication();
 assert.equal(f.jobs.length,2);assert.equal(f.jobs[1].epoch,'2');
 const decoded=decodeFunctionData({abi:reusableAgentArenaAbi,data:parseTransaction(f.jobs[1].raw).data!});assert.deepEqual(decoded.args,[2n]);e.close();
});

test('a recovered halt resumes the exact historical start, preserving its nonce and refusal proof',async()=>{
 const f=fixture();let e=f.make(214n,false,true);f.behavior('halt');
 await assert.rejects(e.send('start','start',[1n,214n]),/no longer accepting/);
 const job=historicalHalt(f),raw=job.raw,hash=job.hash,proof=job.resolution;e.close();
 e=f.make(214n,false,true);f.behavior('ok');await e.send('start','start',[1n,214n]);
 assert.equal(f.jobs.length,1);assert.equal(job.status,'observed');assert.equal(job.hash,hash);
 assert.deepEqual(f.sent,[raw,raw]);assert.deepEqual(job.resolution.recoveredFrom.previous,proof);
 await e.send('next','tick',[1n,214n]);assert.equal(f.jobs[1].nonce,'1');e.close();
});

test('new reusable publication halts keep the command pending instead of declaring its nonce reusable',async()=>{
 const f=fixture(),e=f.make(214n,false,true);f.behavior('halt');
 await assert.rejects(e.send('start','start',[1n,214n]));assert.equal(f.jobs[0].status,'pending');
 f.behavior('ok');await e.send('start','start',[1n,214n]);assert.equal(f.sent[0],f.sent[1]);e.close();
});

test('historical halt recovery requires healthy exact-app and exact-epoch publication evidence',async()=>{
 for(const evidence of [new Error('health timeout'),{app,epoch:'1',ok:false,halted:'paused',committedBatches:0},{app:zeroAddress,epoch:'1',ok:true,committedBatches:1},{app,epoch:'2',ok:true,committedBatches:1}]){
  const f=fixture(),e=f.make(214n,false,true);f.behavior('halt');await assert.rejects(e.send('start','start',[1n,214n]));
  const job=historicalHalt(f);f.behavior('ok');f.publication(evidence);
  await assert.rejects(e.send('start','start',[1n,214n]));assert.equal(job.status,'refused');assert.equal(f.sent.length,1);e.close();
 }
});

test('recovery never competes with another pending command or a claimed nonce',async()=>{
 for(const status of ['pending','observed']){
  const f=fixture(),e=f.make(214n,false,true);f.behavior('halt');await assert.rejects(e.send('start','start',[1n,214n]));
  const job=historicalHalt(f);f.jobs.push({...job,id:'other',operation:'other',status});f.behavior('ok');
  await assert.rejects(e.send('start','start',[1n,214n]),/another command/);assert.equal(job.status,'refused');assert.equal(f.sent.length,1);e.close();
 }
});

test('a resumed command with a lost response stays journaled and reconciles its exact receipt after restart',async()=>{
 const f=fixture();let e=f.make(214n,false,true);f.behavior('halt');await assert.rejects(e.send('start','start',[1n,214n]));
 const job=historicalHalt(f);f.behavior('lost-after-execution');await assert.rejects(e.send('start','start',[1n,214n]),/lost/);
 assert.equal(job.status,'pending');assert.equal(job.resolution.kind,'same-command-recovery');e.close();
 e=f.make(214n,false,true);f.behavior('ok');await e.send('start','start',[1n,214n]);
 assert.equal(f.sent.length,2);assert.equal(job.status,'observed');assert.equal(job.resolution.recoveredFrom.previous.kind,'permanent-pre-execution-refusal');e.close();
});

test('a historical refused nonce consumed without its exact receipt is not resubmitted',async()=>{
 const f=fixture(),e=f.make(214n,false,true);f.behavior('halt');await assert.rejects(e.send('start','start',[1n,214n]));
 const job=historicalHalt(f);f.behavior('ok');f.nonce(1);
 await assert.rejects(e.send('start','start',[1n,214n]),/nonce requires/);assert.equal(job.status,'refused');assert.equal(f.sent.length,1);e.close();
});

test('a historical refusal with its executed receipt is reconciled without resending',async()=>{
 const f=fixture(),e=f.make(214n,false,true);f.behavior('lost-after-execution');await assert.rejects(e.send('start','start',[1n,214n]));
 const job=historicalHalt(f);f.behavior('ok');await e.send('start','start',[1n,214n]);
 assert.equal(job.status,'observed');assert.equal(job.resolution.recoveredFrom.exactReceipt,true);assert.equal(f.sent.length,1);e.close();
});

test('closed epochs and permanent gas refusals cannot use publication recovery',async()=>{
 for(const reason of ['closed','cap']){
  const f=fixture();let e=f.make(214n,false,true);f.behavior(reason==='cap'?'cap':'halt');await assert.rejects(e.send('start','start',[1n,214n]));
  if(reason==='closed'){historicalHalt(f);e.close();f.status(2);e=f.make(214n,false,true);}
  f.behavior('ok');await assert.rejects(e.send('start','start',[1n,214n]),reason==='closed'?/lifecycle/:/refused/);
  assert.equal(f.sent.length,1);assert.equal(f.jobs[0].status,'refused');e.close();
 }
});

test('a publication probe is a single journaled getter, without any game frame',async()=>{
 const f=fixture();let e=f.make(0n,false,true);await e.probePublication();e.close();
 e=f.make(0n,false,true);await e.probePublication();
 assert.equal(f.jobs.length,1);assert.equal(f.sent.length,1);assert.equal(parseTransaction(f.sent[0]).gas,100_000n);
 assert.deepEqual(f.receiptIds,[]);assert.deepEqual(f.readIds,[]);assert.equal(f.jobs[0].status,'observed');e.close();
});

test('a lost probe response is reconciled before a game and preserves its exact nonce',async()=>{
 const f=fixture();let e=f.make(0n,false,true);f.behavior('lost-after-execution');
 await assert.rejects(e.probePublication(),/lost/);e.close();
 e=f.make(91n,false,true);f.behavior('ok');await assert.rejects(e.send('start','start',[1n,91n]),{code:'POOL_RECONCILED'});
 assert.equal(f.sent.length,1);assert.deepEqual(f.readIds,[]);assert.deepEqual(f.receiptIds,[]);
 await e.send('start','start',[1n,91n]);assert.equal(parseTransaction(f.sent[1]).nonce,1);e.close();
});

test('publication probes cannot run in a game or replay an uncertain game command',async()=>{
 const f=fixture();let e=f.make(91n,false,true);await assert.rejects(e.probePublication(),/empty reusable/);
 f.behavior('lost-before-execution');await assert.rejects(e.send('tick','tick',[1n,91n]),/lost/);e.close();
 e=f.make(0n,false,true);await assert.rejects(e.probePublication(),/cannot reconcile a game/);assert.equal(f.sent.length,1);
 f.currentId(91n);await assert.rejects(e.probePublication(),/cannot touch/);assert.equal(f.sent.length,1);e.close();
});

test('exact acknowledged receipts reuse nonce proof without indefinitely extending its RPC validity',async()=>{
 const f=fixture(),e=f.make();
 for(let i=0;i<6;i++){f.now(i*150);await e.send(`tick-${i}`,'tick',[1n]);}
 assert.equal(f.nonceReads(),2);assert.deepEqual(f.sent.map(raw=>parseTransaction(raw).nonce),[0,1,2,3,4,5]);
 f.now(1000);await e.send('after-validity','tick',[1n]);assert.equal(f.nonceReads(),4);e.close();
 const restarted=f.make();await restarted.send('after-restart','tick',[1n]);assert.equal(f.nonceReads(),6);restarted.close();
});

test('a lost response discards cached nonce proof and reconciles the exact journal first',async()=>{
 const f=fixture(),e=f.make();await e.send('one','tick',[1n]);f.behavior('lost-after-execution');
 await assert.rejects(e.send('two','tick',[1n]),/lost/);const pending=f.jobs[1];assert.equal(pending.nonce,'1');
 f.behavior('ok');await assert.rejects(e.send('three','tick',[1n]),{code:'POOL_RECONCILED'});
 assert.equal(f.sent.length,2);assert.equal(f.jobs[1].hash,pending.hash);
 await e.send('three','tick',[1n]);assert.equal(f.jobs[2].nonce,'2');assert.equal(f.nonceReads(),4);e.close();
});

test('snapshot failures and observed resets invalidate nonce proof without losing confirmed jobs',async()=>{
 const f=fixture(),e=f.make();await e.send('one','tick',[1n]);f.feedError(true);
 await assert.rejects(e.send('two','tick',[1n]),/snapshot gap/);assert.equal(f.jobs[1].status,'observed');
 f.feedError(false);await e.send('three','tick',[1n]);assert.equal(f.nonceReads(),4);
 f.reset();await e.read();await e.send('four','tick',[1n]);assert.equal(f.nonceReads(),6);e.close();
});

test('another journaled writer cannot reuse a cached nonce before the next RPC refresh',async()=>{
 const f=fixture(),a=f.make(),b=f.make();
 await a.send('a-one','tick',[1n]);await b.send('b-one','tick',[1n]);
 await assert.rejects(a.send('a-two','tick',[1n]),/pool_used_nonce/);
 assert.equal(f.sent.length,2);assert.equal(f.jobs.length,2);
 await a.send('a-two','tick',[1n]);assert.equal(parseTransaction(f.sent[2]).nonce,2);
 assert.equal(f.jobs.length,3);a.close();b.close();
});

test('prefetched lifecycle checks do not pause valid ticks and an expired check still blocks the next command',async()=>{
 const f=fixture(),e=f.make();await e.send('first','tick',[1n]);
 let release!:()=>void;f.blockGate(new Promise<void>(resolve=>release=resolve));f.now(2000);
 await e.read();await e.send('within-window','tick',[1n]);assert.equal(f.sent.length,2);
 f.now(3100);let finished=false;const third=e.send('after-expiry','tick',[1n]).then(()=>{finished=true;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);assert.equal(f.sent.length,2);
 release();await third;assert.equal(f.sent.length,3);e.close();
});

test('a prefetched closure immediately invalidates the write window',async()=>{
 const f=fixture(),e=f.make();await e.send('first','tick',[1n]);f.now(2000);f.status(2);
 await e.read();await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(e.send('closed','tick',[1n]),/lifecycle/);assert.equal(f.sent.length,1);e.close();
});

test('a failed background RPC does not revoke a valid fence or extend its original deadline',async()=>{
 const f=fixture(),e=f.make();await e.send('first','tick',[1n]);f.now(1600);f.blockError(true);
 await e.read();await new Promise(resolve=>setImmediate(resolve));
 await e.send('original-window','tick',[1n]);assert.equal(f.sent.length,2);
 f.now(3000);await assert.rejects(e.send('expired','tick',[1n]),/RPC unavailable/);
 assert.equal(f.sent.length,2);assert.equal(f.jobs.length,2,'no unsigned failure consumes a nonce');
 f.blockError(false);await e.send('recovered','tick',[1n]);assert.equal(f.sent.length,3);e.close();
});

test('a new journaled command avoids an impossible receipt lookup; a restarted uncertain one must read it',async()=>{
 const f=fixture();let e=f.make();f.behavior('lost-after-execution');
 await assert.rejects(e.send('first','tick',[1n]),/lost/);assert.equal(f.receiptReads(),0);e.close();
 e=f.make();f.behavior('ok');await e.send('first','tick',[1n]);assert.equal(f.receiptReads(),1);
 assert.equal(f.sent.length,1);assert.equal(f.jobs.length,1);assert.equal(f.jobs[0].status,'observed');e.close();
});
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
