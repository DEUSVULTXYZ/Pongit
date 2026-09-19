import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {parseAbi,encodeFunctionData,keccak256,zeroHash} from 'viem';
import {engineJobIdentity,engineReceiptOutcome,quarantineTerminalTicks,reconcileEngineJobs,retireClosedEpochJobs,retireRefusedEngineJob} from '../relayer/src/rooms-engine-recovery';
import {EnginePublicationUnavailable} from '../shared/service-error';
import {roomsChaosAbi} from '../shared/abi-PongRoomsTestnet';
const abi=parseAbi(['function tick(uint256 id)','function concede(uint256 id)']);
const app='0x0000000000000000000000000000000000000011';
const signer=privateKeyToAccount(generatePrivateKey());
async function journal(action='tick'){
 const raw=await signer.signTransaction({chainId:4242,type:'eip1559',nonce:276,to:app,data:encodeFunctionData({abi,functionName:action as 'tick',args:[12n]}),gas:15000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
 const job={app,id:'saved',epoch:'1',nonce:'276',raw,hash:keccak256(raw),status:'pending'};
 const updates:any[]=[];
 const db={query:async(sql:string,args:any[])=>{if(sql.startsWith('SELECT'))return {rows:[job]};updates.push({sql,args});return {rowCount:1};}} as any;
 return {job,db,updates};
}
const snap:any=[];snap[2]=3n;snap[6]=app;snap[12]={scoreA:2,scoreB:7};
const resultHash=`0x${'12'.repeat(32)}`;
test('missing receipt never resolves or rebroadcasts a pending command',async()=>{
 const {db,updates}=await journal();
 await reconcileEngineJobs({db,app,receipt:async()=>null});
 assert.equal(updates.length,0);
 await reconcileEngineJobs({db,app,receipt:async()=>{throw Error('429');}});
 assert.equal(updates.length,0);
});
test('published terminal tick is quarantined with evidence, not marked failed',async()=>{
 const {db,job,updates}=await journal();
 const identity=await engineJobIdentity(job,abi,signer.address);
 assert.equal(identity.action,'tick');assert.equal(identity.matchId,'12');assert.equal(identity.signer,signer.address.toLowerCase());
 assert.deepEqual(identity.args,[12n]);
 await quarantineTerminalTicks({db,app,abi,signer:signer.address,epoch:1n,snapshot:async()=>snap,resultHash:async()=>resultHash});
 assert.match(updates[0].sql,/quarantined/);assert.equal(updates[0].args[5].resultHash,resultHash);
 assert.equal(updates.length,1);assert(!updates[0].sql.includes('raw='));
});

test('a recovered pressure receipt keeps its original match and full command identity',async()=>{
 const pressure={matchId:42n,rally:1,resumeAt:3000000n,paidA:0n,paidB:3000000000000000n,sourceBlock:99n,checkpoint:zeroHash,expires:123456n};
 const data=encodeFunctionData({abi:roomsChaosAbi,functionName:'submitPressure',args:[pressure,'0x1234']});
 const raw=await signer.signTransaction({chainId:4242,type:'eip1559',nonce:9,to:app,data,gas:15000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
 const identity=await engineJobIdentity({app,id:'old',epoch:'1',nonce:'9',raw,hash:keccak256(raw),status:'pending'},roomsChaosAbi,signer.address);
 assert.equal(identity.matchId,'42');assert.equal(identity.data,data);assert.equal(identity.action,'submitPressure');
 assert.notEqual(identity.data,encodeFunctionData({abi:roomsChaosAbi,functionName:'tick',args:[43n]}));
 assert.equal((identity.args![0] as any).resumeAt,3000000n);
});

test('unknown execution status stays uncertain on the direct send path too',()=>{
 const hash=keccak256('0x1234');
 assert.equal(engineReceiptOutcome(null,hash),null);
 assert.equal(engineReceiptOutcome({transactionHash:hash,status:'pending'},hash),null);
 assert.throws(()=>engineReceiptOutcome({transactionHash:zeroHash,status:'success'},hash));
 assert.equal(engineReceiptOutcome({transactionHash:hash,status:'0x1'},hash),'observed');
 assert.equal(engineReceiptOutcome({transactionHash:hash,status:'0x0'},hash),'failed');
});
test('unpublished or contested result, new epoch and non-tick all retain uncertainty',async()=>{
 for(const scenario of ['unpublished','different','active','epoch','action']){
 const {db,updates}=await journal(scenario==='action'?'concede':'tick');
 await assert.rejects(quarantineTerminalTicks({db,app,abi,signer:signer.address,epoch:scenario==='epoch'?2n:1n,
 snapshot:async()=>scenario==='active'?Object.assign([...snap],{2:2n}):snap,
 resultHash:async(_id,published)=>published&&scenario==='unpublished'?zeroHash:published&&scenario==='different'?`0x${'13'.repeat(32)}`:resultHash}));
 assert.equal(updates.length,0,scenario);
 }
});
test('receipt resolves execution only when its hash and status are known',async()=>{
 const {db,updates,job}=await journal();
 await assert.rejects(reconcileEngineJobs({db,app,receipt:async()=>({transactionHash:zeroHash,status:'success'})}));
 await reconcileEngineJobs({db,app,receipt:async()=>({transactionHash:job.hash,status:'unknown'})});
 assert.equal(updates.length,0);
 await reconcileEngineJobs({db,app,receipt:async()=>({transactionHash:job.hash,status:'reverted'})});
 assert.equal(updates[0].args[2],'failed');assert.equal(updates[0].args[3].kind,'receipt');
});

// A command the node refuses before executing it (the agent arcade's rule, 8a9f17b).
const capRefusal={name:'RpcRequestError',message:'RPC Request failed.',details:'transaction rejected before execution: transaction gas limit is greater than the cap',code:-32000};
const haltRefusal={name:'RpcRequestError',message:'RPC Request failed.',details:'this session is over and the node is no longer accepting transactions: batch 191 could not be settled (commit relay failed: 502 Bad Gateway)',code:-32000};
test('a refused command is retired only when the node also confirms its nonce unused',async()=>{
 for(const error of [capRefusal,haltRefusal,new EnginePublicationUnavailable(haltRefusal)]){
  const {db,job,updates}=await journal();
  assert.equal(await retireRefusedEngineJob({db,app,job,error,latestNonce:async()=>276}),true);
  assert.equal(updates.length,1);
  const [{sql,args}]=updates;
  assert.match(sql,/DELETE FROM il_engine_jobs WHERE app=\$1 AND id=\$2 AND hash=\$3 AND nonce=\$4 AND status='pending'/);
  assert.match(sql,/INSERT INTO il_engine_refusals/,'the exact bytes and the reason are kept for review');
  assert.deepEqual(args.slice(0,4),[app,job.id,job.hash,'276']);
  assert.match(args[4],/rejected before execution|no longer accepting transactions/);assert.equal(args[5],'276');
 }
 const {db,job}=await journal();
 assert.equal(await retireRefusedEngineJob({db,app,job,error:capRefusal,latestNonce:async()=>276n}),true,'a bigint count');
});
test('a refused command whose nonce moved, or could not be read, or any other failure stays pending',async()=>{
 const cases:[string,unknown,()=>Promise<number>][]=[
  ['the count moved: it ran',capRefusal,async()=>277],
  ['the count is behind',capRefusal,async()=>275],
  ['the count cannot be read (halted node offline)',haltRefusal,async()=>{throw new TypeError('fetch failed');}],
  ['a lost response',new TypeError('fetch failed'),async()=>276],
  ['a timeout',{name:'TimeoutError',message:'The operation was aborted due to timeout'},async()=>276],
  ['the local 30 s publication gate: the bytes never left',new EnginePublicationUnavailable(),async()=>276],
  ['a rate limit',Object.assign(new Error('The game node is limiting requests.'),{status:429}),async()=>276],
  ['nonce too low',{details:'nonce too low'},async()=>276],
 ];
 for(const [name,error,latestNonce] of cases){
  const {db,job,updates}=await journal();
  assert.equal(await retireRefusedEngineJob({db,app,job,error,latestNonce}),false,name);
  assert.equal(updates.length,0,name);
 }
});
test('once the hub has released an epoch, its pending commands no longer block the next one',async()=>{
 // After a forceClose of a halted node nobody can refuse or confirm a pending
 // command. The lifecycle retires it with the quarantined ones at release; the
 // relayer does the same when the hub and node already serve a later epoch.
 const updates:any[]=[];const db={query:async(sql:string,args:any[])=>{updates.push({sql,args});return {rowCount:2};}} as any;
 assert.equal(await retireClosedEpochJobs({db,app,closedThrough:6n,kind:'epoch-closed'}),2);
 const [{sql,args}]=updates;
 assert.match(sql,/SET status='obsolete'/);assert.match(sql,/epoch<=\$2/);assert.match(sql,/status IN \('pending','quarantined'\)/);
 assert.match(sql,/previousStatus/,'what it was stays in the resolution');assert(!/raw=/.test(sql),'the bytes stay in the journal');
 assert.equal(args[0],app);assert.equal(args[1],'6');assert.equal(JSON.parse(args[2]).kind,'epoch-closed');
});
