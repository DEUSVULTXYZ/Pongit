// Retire only the verified, idle historical epoch before its final migration.
// This never renews the old app, changes admissions or chooses game results.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createPublicClient,http,parseAbi,zeroHash,keccak256} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {roomsEventsAbi as abi} from '../shared/abi-PongChaosEvents';

assert.equal(process.env.PONG_HUMAN_MIGRATION_RETIRE,'approved-idle-source-epoch7');
const step=process.argv[2];assert(['check','close','release'].includes(step));
const app='0x78d3341e3452d7ec1add9371de3008639eed8eb0',hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595';
const config=await(await fetch('https://pongit.xyz/api/interlude/config',{signal:AbortSignal.timeout(12000)})).json();
assert.equal(config.app.toLowerCase(),app);assert.equal(config.admission,false);assert.equal(config.maintenance?.operatorHold,true);
const t=await chainTools('human-migration-20260921');
const report:any={at:new Date().toISOString(),app,epoch:'7',step,passed:false};
try{
 const draft=JSON.parse(await readFile(process.env.PONG_MIGRATION_VERIFIED_DRAFT!,'utf8'));
 assert.equal(draft.source,app);assert.equal(draft.epoch,'7');assert(draft.verifiedRuntimes?.[app]);
 assert.equal(keccak256((await t.base.getCode({address:app}))!),draft.sourceCodeHash);
 const block=await t.base.getBlock(),d=await readHubDelegation(t.base,hub,app,block.number);
 assert.equal(d.epoch,7n);assert.equal(d.batchIndex,6n,'Review any further publication');
 assert.equal(await t.base.readContract({address:app,abi,functionName:'activeCount'}),0n);
 assert.equal((await t.base.readContract({address:app,abi:parseAbi(['function operator() view returns(address)']),functionName:'operator'})).toLowerCase(),t.account.address.toLowerCase());
 const pending=await t.db.query("SELECT id FROM il_engine_jobs WHERE app=$1 AND status IN ('pending','quarantined')",[app]);
 assert.equal(pending.rowCount,0,'Resolve every uncertain old command first');
 if(step==='release'){
  assert([0,2].includes(d.status),'A challenged source cannot be migrated');
  const closed=(await t.db.query('SELECT hash,status FROM il_lifecycle_jobs WHERE id=$1',['human-migration-20260921:epoch7-close'])).rows[0];
  assert.equal(closed?.status,'confirmed');assert.equal((await t.base.getTransactionReceipt({hash:closed.hash})).status,'success');
  if(d.status===2)assert(block.timestamp>=d.stakeUnlockAt,'Wait for the actual hub deadline');
  else assert((await t.db.query('SELECT id FROM il_lifecycle_jobs WHERE id=$1',['human-migration-20260921:epoch7-release'])).rowCount);
  const receipt=await t.write('epoch7-release',hub,parseAbi(['function releaseStake(address,bytes32)']),'releaseStake',[app,zeroHash]);
  assert.equal((await readHubDelegation(t.base,hub,app)).status,0);report.hash=receipt.transactionHash;
 }else{
  assert.equal(d.status,1);assert(block.timestamp>=d.expiresAt,'Only the expired, idle source is in scope');
  const node=createPublicClient({transport:http('https://il-78d3341e3452d7ec.fly.dev',{retryCount:0,timeout:15000})});
  const session:any=await node.request({method:'interlude_session',params:[]} as any);
  assert.equal(session.app.toLowerCase(),app);assert.equal(BigInt(session.epoch),7n);
  assert.equal(BigInt(session.committedBatches),d.batchIndex);assert.deepEqual(session.pendingDiffs,[]);
  assert.equal(await node.readContract({address:app,abi,functionName:'activeCount'}),0n);
  for(const row of draft.ratings){
   const args=[row.player,row.mode] as const;
   assert.deepEqual(await node.readContract({address:app,abi,functionName:'ratingOf',args}),await t.base.readContract({address:app,abi,functionName:'ratingOf',args}));
  }
  await t.base.simulateContract({address:app,abi:parseAbi(['function closeEngine()']),functionName:'closeEngine',account:t.account.address});
  if(step==='close'){
   const receipt=await t.write('epoch7-close',app,parseAbi(['function closeEngine()']),'closeEngine');
   const after=await readHubDelegation(t.base,hub,app);assert.equal(after.status,2);
   report.hash=receipt.transactionHash;report.releaseAt=String(after.stakeUnlockAt);
  }
  report.emptyEngineVerified=true;report.ratingsCompared=draft.ratings.length;
 }
 report.passed=true;
}finally{
 await mkdir('artifacts/human-migration',{recursive:true});
 await writeFile(`artifacts/human-migration/epoch7-${step}.json`,JSON.stringify(report,null,2));
 await t.close();console.log(JSON.stringify(report));
}
