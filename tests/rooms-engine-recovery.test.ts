import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {parseAbi,encodeFunctionData,keccak256,zeroHash} from 'viem';
import {engineJobIdentity,engineReceiptOutcome,quarantineTerminalTicks,reconcileEngineJobs} from '../relayer/src/rooms-engine-recovery';
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
