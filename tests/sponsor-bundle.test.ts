import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPublicClient,custom,encodeFunctionData,keccak256,parseTransaction,type Address,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {independentWriter} from '../relayer/src/independent-writer';
import {bundlePoolAdmissions,batchPoolChallenge,poolOperationId,validatePoolSignedCall,strictPoolAdmissionEstimates} from '../shared/agent-pool-sponsor';
import {agentChallengesAbi} from '../shared/abi-AgentChallenges';
import type {AgentPoolManifest} from '../shared/agent-pool';

const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const m={version:5,rulesVersion:17,challengeAdmission:'atomic-v1',pool:addr(1),challenges:addr(2),catalog:addr(3),family:addr(4)} as AgentPoolManifest;
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'pongit-sponsor-bundle-')),keyFile=join(directory,'ephemeral.json'),privateKey=generatePrivateKey();
 const owner=privateKeyToAccount(privateKey).address;await writeFile(keyFile,JSON.stringify({privateKey}),{mode:0o600});
 const operations=[10,11,12,13].map(player=>{
  const call=batchPoolChallenge(m,{to:m.challenges,data:encodeFunctionData({abi:agentChallengesAbi,functionName:'command',
   args:[addr(player),1,addr(50),1,0n,0n,9999999999n,`0x${'ab'.repeat(65)}`]})});
  return{id:poolOperationId(call),target:call.to.toLowerCase(),data:call.data,value:'0',priority:1,status:'queued',hash:undefined as Hex|undefined};
 });
 const jobs:any[]=[],groups:any[]=[],broadcasts:Hex[]=[];let held=false,receipt:'missing'|'success'|'reverted'='missing';
 const faults={update:false,send:false,estimate:false,denyLock:false,revertFirst:false};
 const result=(rows:any[]=[],rowCount=rows.length)=>({rows:structuredClone(rows),rowCount});
 const db:any={connect:async()=>({...db,release(){}}),async query(sql:string,p:any[]=[]){
  if(sql.startsWith('CREATE '))return result();
  if(sql.startsWith('SELECT owner FROM independent_writer_binding')||sql.startsWith('INSERT INTO independent_writer_binding'))return result([{owner:owner.toLowerCase()}]);
  if(sql.startsWith('SELECT pg_try_advisory_lock')){assert(!held);if(faults.denyLock)return result([{ok:false}]);held=true;return result([{ok:true}]);}
  if(sql.startsWith('SELECT pg_advisory_unlock')){assert(held);held=false;return result();}
  if(sql.startsWith('SELECT id,hash FROM il_lifecycle_jobs')||sql.startsWith('SELECT * FROM il_lifecycle_jobs'))return result(jobs.filter(j=>j.status==='pending'));
  if(sql.startsWith('SELECT id,status,hash FROM il_lifecycle_jobs'))return result(jobs.filter(j=>sql.includes('id=ANY')?p[1].includes(j.id):j.id===p[0]&&j.owner===p[1]));
  if(sql.startsWith('INSERT INTO il_lifecycle_jobs')){assert(held);assert(!jobs.some(j=>j.status==='pending'||j.nonce===p[3]||j.id===p[0]));jobs.push({id:p[0],app:p[1],owner:p[2],nonce:p[3],raw:p[4],hash:p[5],status:'pending'});return result([],1);}
  if(sql.startsWith('UPDATE il_lifecycle_jobs')){const job=jobs.find(j=>j.id===p[0]&&j.status==='pending');if(job)job.status=p[1];return result([],job?1:0);}
  if(sql.startsWith('SELECT b.id FROM independent_operation_batches'))return result(groups.filter(g=>operations.some(o=>g.members.includes(o.id)&&['queued','pending'].includes(o.status))).slice(0,1));
  if(sql.startsWith('SELECT * FROM independent_operation_batches'))return result(groups.filter(g=>g.id===p[0]));
  if(sql.startsWith('SELECT id FROM independent_operation_batches'))return result(groups.filter(g=>g.members.some((id:string)=>p[0].includes(id))));
  if(sql.startsWith('INSERT INTO independent_operation_batches')){if(!groups.some(g=>g.id===p[0]))groups.push({id:p[0],target:p[1],data:p[2],value:p[3],members:p[4]});return result([],1);}
  if(sql.startsWith('DELETE FROM independent_operation_batches')){groups.splice(groups.findIndex(g=>g.id===p[0]),1);return result([],1);}
  if(sql.startsWith('SELECT id FROM independent_operations'))return result(operations.filter(o=>['queued','pending'].includes(o.status)));
  if(sql.startsWith('SELECT * FROM independent_operations')){
   if(sql.includes('id=ANY'))return result(p[0].flatMap((id:string)=>operations.filter(o=>o.id===id)));
   if(sql.includes('WHERE id=$1'))return result(operations.filter(o=>o.id===p[0]));
   return result(operations.filter(o=>o.status==='queued').slice(0,Number(sql.match(/LIMIT (\d+)/)![1])));
  }
  if(sql.startsWith('UPDATE independent_operations')){
   if(faults.update){faults.update=false;throw Error('lost business database response');}
   const rows=operations.filter(o=>sql.includes('WHERE id=ANY')?p[0].includes(o.id):sql.includes('WHERE hash=$1')?o.hash===p[0]:o.id===p[0]);
   for(const o of rows){if(!['queued','pending'].includes(o.status))continue;
    if(sql.includes("SET status='pending'")){o.status='pending';o.hash=p[1];}
    else if(sql.includes("SET status='failed'"))o.status='failed';
    else{o.status=p[1];if(sql.includes('hash=$3'))o.hash=p[2];}
   }return result([],rows.length);
  }
  throw Error('Unexpected database operation in bundle integration');
 }};
 const values:any={eth_chainId:'0x279f',eth_getTransactionCount:()=>`0x${jobs.filter(j=>j.status!=='pending').length.toString(16)}`,
  eth_estimateGas:'0x1e8480',eth_maxPriorityFeePerGas:'0x2',eth_gasPrice:'0x12',
  eth_getBlockByNumber:{number:'0x1',timestamp:'0x1',gasLimit:'0x1c9c380',gasUsed:'0x0',baseFeePerGas:'0xf',transactions:[]}};
 const base=createPublicClient({chain:monadTestnet,transport:custom({request:async({method}:any)=>{
  assert(method in values);return typeof values[method]==='function'?values[method]():values[method];}},{retryCount:0})});
 const client={...base,estimateGas:async(tx:any)=>{
  if(faults.estimate)throw Error('429');
  // Both the containing batch and the first individual action revert.
  if(faults.revertFirst&&tx.data.includes(operations[0].data.slice(2,10))&&tx.data.includes('ab'.repeat(65))
   &&tx.data.includes(addr(10).slice(2)))throw Object.assign(Error('revoked intent'),{name:'ExecutionRevertedError'});
  return 2_000_000n;
 },getTransactionReceipt:async({hash}:any)=>{if(receipt==='missing')throw Error('Receipt not found');return{transactionHash:hash,status:receipt};},
 sendRawTransaction:async({serializedTransaction}:any)=>{assert(held);assert.equal(jobs.at(-1).raw,serializedTransaction);broadcasts.push(serializedTransaction);if(faults.send)throw Error('lost send response');return keccak256(serializedTransaction);}};
 const scope={keyFile,address:owner,allowCall:(to:Address,data:Hex,value:bigint)=>{assert.equal(value,0n);validatePoolSignedCall(m,{to,data});},
  strictEstimate:(to:Address,data:Hex,value:bigint)=>strictPoolAdmissionEstimates(m,{to,data}).map(c=>({...c,value})),
  bundle:(calls:any)=>bundlePoolAdmissions(m,calls)};
 let writer=await independentWriter(db,client as any,db,scope);
 return{operations,jobs,groups,broadcasts,faults,get writer(){return writer;},setReceipt:(value:typeof receipt)=>{receipt=value;},
  restart:async()=>{await writer.close();writer=await independentWriter(db,client as any,db,scope);},
  close:async()=>{await writer.close();assert(!held);await rm(directory,{recursive:true,force:true});}};
}

test('four durable independent admissions use one journalled nonce and one exact receipt',async(t)=>{
 t.mock.timers.enable({apis:['setInterval']});const f=await fixture();try{
  await f.writer.dispatch();assert.equal(f.jobs.length,1);assert.equal(f.broadcasts.length,1);assert.equal(parseTransaction(f.broadcasts[0]).nonce,0);
  assert(f.operations.every(o=>o.status==='pending'&&o.hash===f.jobs[0].hash));
  f.setReceipt('success');await f.writer.observe();assert(f.operations.every(o=>o.status==='confirmed'));
  await f.writer.dispatch();assert.equal(f.jobs.length,1);
 }finally{await f.close();}
});
test('a lost broadcast or crash before queue hashes update resends the identical group after restart',async(t)=>{
 t.mock.timers.enable({apis:['setInterval']});
 for(const point of ['send','update'] as const){const f=await fixture();try{
  f.faults[point]=true;await f.writer.dispatch();assert.equal(f.jobs.length,1);const raw=f.jobs[0].raw;
  await f.restart();f.faults.send=false;await f.writer.dispatch();assert.equal(f.jobs.length,1);assert.equal(f.broadcasts.at(-1),raw);
  f.setReceipt('success');await f.writer.observe();assert(f.operations.every(o=>o.status==='confirmed'&&o.hash===f.jobs[0].hash));
 }finally{await f.close();}}
});
test('unsigned groups survive RPC failure without losing original intents or allocating a nonce',async(t)=>{
 t.mock.timers.enable({apis:['setInterval']});const f=await fixture();try{
  f.faults.estimate=true;await f.writer.dispatch();assert.equal(f.groups.length,1);assert.equal(f.jobs.length,0);assert(f.operations.every(o=>o.status==='queued'));
  const id=f.groups[0].id;await f.restart();f.faults.estimate=false;await f.writer.dispatch();assert.equal(f.groups[0].id,id);assert.equal(f.jobs.length,1);
 }finally{await f.close();}
});
test('tampered group metadata and a competing signer lock cannot cause a second signature',async(t)=>{
 t.mock.timers.enable({apis:['setInterval']});const f=await fixture();try{
  f.faults.denyLock=true;await f.writer.dispatch();assert.equal(f.jobs.length,0);f.faults.denyLock=false;
  await f.writer.dispatch();const count=f.broadcasts.length,original=f.groups[0].data;
  f.groups[0].data='0x1234';await f.restart();await f.writer.dispatch();assert.equal(f.broadcasts.length,count);assert.equal(f.jobs.length,1);
  f.groups[0].data=original;await f.writer.dispatch();assert.equal(f.broadcasts.length,count+1);assert.equal(f.jobs.length,1);
 }finally{await f.close();}
});
test('a confirmed journal after a crash reconciles children instead of signing again',async(t)=>{
 t.mock.timers.enable({apis:['setInterval']});const f=await fixture();try{
  await f.writer.dispatch();f.jobs[0].status='confirmed';for(const o of f.operations){o.status='queued';o.hash=undefined;}
  await f.restart();await f.writer.dispatch();assert.equal(f.jobs.length,1);assert.equal(f.broadcasts.length,1);assert(f.operations.every(o=>o.status==='confirmed'));
 }finally{await f.close();}
});
test('a reverted inclusion fails each original operation without reusing its nonce',async(t)=>{
 t.mock.timers.enable({apis:['setInterval']});const f=await fixture();try{
  await f.writer.dispatch();f.setReceipt('reverted');await f.writer.observe();await f.writer.dispatch();assert.equal(f.jobs.length,1);assert(f.operations.every(o=>o.status==='failed'));
 }finally{await f.close();}
});
test('a decoded pre-signing rejection dissolves only the unsigned group and retires only the invalid first intent',async(t)=>{
 t.mock.timers.enable({apis:['setInterval']});const f=await fixture();try{
  f.faults.revertFirst=true;await f.writer.dispatch();assert.equal(f.jobs.length,0);assert.equal(f.groups.length,0);assert.equal(f.operations[0].status,'failed');assert(f.operations.slice(1).every(o=>o.status==='queued'));
  await f.writer.dispatch();assert.equal(f.jobs.length,1);assert(f.operations.slice(1).every(o=>o.status==='pending'));
 }finally{await f.close();}
});
