// Retire the completed, failed September 18 qualification without discarding
// games or changing any human arena. This cannot renew a delegation.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,keccak256,parseAbi,zeroHash} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {agentArcadeAbi as abi} from '../shared/abi-PongAgentArcade';
import {agentArchiveAbi as archiveAbi} from '../shared/abi-AgentResultArchive';

assert.equal(process.env.PONG_AGENT_RETIRE,'completed-september18-lab');
const step=process.argv[2];assert(['check','close','release'].includes(step));
const app='0x3ff9be7d8c3fbea0dc617f9cd59ff141fb6725db';
const hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595';
const prefix='agent-arcade-lifecycle-20260918-4';
const t=await chainTools(prefix),db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:2});
const report:any={at:new Date().toISOString(),app,epoch:'21',step,passed:false,results:[]};
try {
 const m=JSON.parse(await readFile('/retired-source/manifest.json','utf8'));
 const archive=JSON.parse(await readFile('/retired-source/archive.json','utf8'));
 assert.equal(m.app,app);assert.equal(m.epoch,'21');assert.equal(m.enabled,false);assert.equal(m.qualified,false);
 assert.equal(m.hub.toLowerCase(),hub.toLowerCase());assert.equal(archive.app,app);
 assert.equal(archive.archive,'0xb25353a7816157d8b3470f33ade44e6bfe729eef');
 assert.equal(keccak256((await t.base.getCode({address:app}))!),'0x29cf6ecc61965d349d93c1ac3e2681f63f4bbc87ebbf0d24cf8070df7729f90a');
 assert.equal((await t.base.readContract({address:app,abi,functionName:'operator'})).toLowerCase(),t.account.address.toLowerCase());
 assert.equal((await t.base.readContract({address:archive.archive,abi:archiveAbi,functionName:'game'})).toLowerCase(),app);
 const control=(await db.query('SELECT admissions,extract(epoch FROM now()-updated_at) AS age FROM agent_arcade.control WHERE app=$1',[app])).rows[0];
 assert(control&&!control.admissions&&Number(control.age)>=60,'Drain admissions and existing offers first');
 const active=(await db.query("SELECT id FROM agent_arcade.matches WHERE app=$1 AND status IN ('preparing','offered','active','publishing')",[app])).rows;
 assert.equal(active.length,0,'Let every existing game finish');
 assert.equal((await db.query("SELECT 1 FROM agent_arcade.engine_jobs WHERE app=$1 AND state IN ('prepared','uncertain')",[app])).rowCount,0,'Reconcile all uncertain engine commands');
 let d=await readHubDelegation(t.base,hub,app);assert.equal(d.epoch,21n);
 const rows=(await db.query('SELECT id,status,result,publication FROM agent_arcade.matches WHERE app=$1 AND epoch=21 ORDER BY id',[app])).rows;
 assert.equal(rows.length,18,'Review unexpected games after the drain');
 for(const row of rows){
  assert.equal(row.status,'complete');assert.equal(row.publication?.state,'published');
  const hash=await t.base.readContract({address:app,abi,functionName:'resultHashes',args:[BigInt(row.id)]});
  assert.notEqual(hash,zeroHash);assert.equal(hash,row.result?.hash);
  const saved=await t.base.readContract({address:archive.archive,abi:archiveAbi,functionName:'recordedHash',args:[BigInt(row.id)]});
  if(saved!==hash){
   assert.notEqual(step,'release','Archive before closing');
   if(step==='close')await t.write(`retirement-archive-${row.id}-${hash.slice(2)}`,archive.archive,archiveAbi,'recordMatch',[BigInt(row.id)]);
  }
  report.results.push({id:String(row.id),hash,archived:saved===hash||step==='close'});
 }
 if(step==='release'){
  assert([0,2].includes(d.status),'Wait for an uncontested closure');
  const close=(await t.db.query('SELECT hash,status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':retirement-close-21'])).rows[0];
  assert.equal(close?.status,'confirmed');assert.equal((await t.base.getTransactionReceipt({hash:close.hash})).status,'success');
  if(d.status===2)assert((await t.base.getBlock()).timestamp>=d.stakeUnlockAt,'Respect the actual challenge window');
  else assert((await t.db.query('SELECT id FROM il_lifecycle_jobs WHERE id=$1',[prefix+':retirement-release-21'])).rowCount);
  report.hash=(await t.write('retirement-release-21',hub,parseAbi(['function releaseStake(address,bytes32)']),'releaseStake',[app,zeroHash])).transactionHash;
  d=await readHubDelegation(t.base,hub,app);assert.equal(d.status,0);
 }else{
  assert.equal(d.status,1);
  const node=createPublicClient({transport:http(m.node,{retryCount:0,timeout:12000})});
  const session:any=await node.request({method:'interlude_session',params:[]} as any);
  assert.equal(session.app.toLowerCase(),app);assert.equal(BigInt(session.epoch),21n);
  assert.equal(BigInt(session.committedBatches),d.batchIndex);assert.equal(session.pendingDiffs.length,0);
  const health=await(await fetch(m.node+'/health',{signal:AbortSignal.timeout(12000)})).json();
  assert(!health.halted&&health.pendingDiffs===0);
  assert.equal(await node.readContract({address:app,abi,functionName:'activeCount'}),0n);
  assert.equal(await t.base.readContract({address:app,abi,functionName:'activeCount'}),0n);
  for(const row of rows)assert.equal(await node.readContract({address:app,abi,functionName:'resultHashes',args:[BigInt(row.id)]}),row.result.hash);
  await t.base.simulateContract({account:t.account.address,address:app,abi,functionName:'closeEngine'});
  report.batches=String(d.batchIndex);report.pendingDiffs=0;report.simulation='passed';
  if(step==='close'){
   // The legacy lifecycle checks this tombstone before any renewal.
   await writeFile('/retired-source/retired.json',JSON.stringify({app,epoch:'21',at:report.at,reason:'Completed failed qualification; results archived; no renewal'}),{mode:0o600});
   report.hash=(await t.write('retirement-close-21',app,abi,'closeEngine')).transactionHash;
   d=await readHubDelegation(t.base,hub,app);assert.equal(d.status,2);
  }
 }
 report.status=d.status;report.releaseAt=String(d.stakeUnlockAt);report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].slice(0,220);process.exitCode=1;}
finally{
 await mkdir('/diagnostics/reusable/retirement-sept18',{recursive:true});
 await writeFile(`/diagnostics/reusable/retirement-sept18/${step}.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({step,passed:report.passed,error:report.error,status:report.status,hash:report.hash,releaseAt:report.releaseAt,results:report.results.length}));
 await db.end();await t.close();
}
