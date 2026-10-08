import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setImmediate as turn} from 'node:timers/promises';
import {createPublicClient,custom,keccak256,parseTransaction,type Hex} from 'viem';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {writerIdentity} from '../shared/scoped-writer';
import {independentWriter} from '../relayer/src/independent-writer';

async function fixture(mode:'confirmed'|'missing'|'mismatch',eager=true){
 const directory=await mkdtemp(join(tmpdir(),'pongit-writer-wake-'));
 const keyFile=join(directory,'ephemeral.json'),privateKey=generatePrivateKey(),owner=privateKeyToAccount(privateKey).address;
 await writeFile(keyFile,JSON.stringify({privateKey}),{mode:0o600});
 const scope={keyFile,address:owner,allowCall:()=>{}},prefix=writerIdentity(owner,scope).prefix;
 const oldHash=`0x${'11'.repeat(32)}` as Hex,target=`0x${'22'.repeat(20)}` as const;
 const jobs:any[]=[{id:prefix+'first',hash:oldHash,nonce:0,status:'pending'}];
 const operations:any[]=[{id:'first',hash:oldHash,status:'pending'},
  {id:'second',target,data:'0x1234',value:'0',priority:1,status:'queued'}];
 const signed:Hex[]=[],locks:boolean[]=[];let held=false,receipts=0;
 const result=(rows:any[]=[],rowCount=rows.length)=>({rows,rowCount});
 const db:any={connect:async()=>({...db,release(){}}),async query(sql:string,p:any[]=[]){
  if(sql.startsWith('CREATE '))return result();
  if(sql==='SELECT owner FROM independent_writer_binding WHERE id=1')return result([{owner:owner.toLowerCase()}]);
  if(sql.startsWith('INSERT INTO independent_writer_binding'))return result([{owner:owner.toLowerCase()}]);
  if(sql.startsWith('SELECT pg_try_advisory_lock')){assert(!held);held=true;locks.push(true);return result([{ok:true}]);}
  if(sql.startsWith('SELECT pg_advisory_unlock')){assert(held);held=false;return result();}
  if(sql.startsWith('SELECT id,hash FROM il_lifecycle_jobs'))return result(jobs.filter(j=>j.status==='pending').map(j=>({id:j.id,hash:j.hash})));
  if(sql.startsWith('SELECT * FROM il_lifecycle_jobs'))return result(jobs.filter(j=>j.status==='pending').slice(0,1));
  if(sql.startsWith('UPDATE il_lifecycle_jobs')){const j=jobs.find(j=>j.id===p[0]&&j.status==='pending');if(j)j.status=p[1];return result([],j?1:0);}
  if(sql.startsWith('SELECT id FROM independent_operations'))return result(operations.filter(o=>['queued','pending'].includes(o.status)).map(o=>({id:o.id})));
  if(sql.startsWith('SELECT id,status,hash FROM il_lifecycle_jobs'))return result(jobs.filter(j=>p[1].includes(j.id)));
  if(sql.startsWith('SELECT * FROM independent_operations'))return result(operations.filter(o=>o.status==='queued').slice(0,1));
  if(sql.startsWith('INSERT INTO il_lifecycle_jobs')){
   assert(held,'Nonce allocation needs its original signer lock');assert(!jobs.some(j=>j.status==='pending'));
   assert(!jobs.some(j=>j.nonce===p[3]));jobs.push({id:p[0],nonce:p[3],raw:p[4],hash:p[5],status:'pending'});return result([],1);
  }
  if(sql.startsWith('UPDATE independent_operations')){
   const o=operations.find(o=>sql.includes('WHERE hash=$1')?o.hash===p[0]:o.id===p[0]);
   if(o){if(sql.includes("SET status='pending'")){o.status='pending';o.hash=p[1];}
    else{o.status=p[1];if(sql.includes('hash=$3'))o.hash=p[2];}}
   return result([],o?1:0);
  }
  throw Error('Unexpected database operation in writer integration fixture');
 }};
 const values:any={eth_chainId:'0x279f',eth_getTransactionCount:'0x1',eth_estimateGas:'0x186a0',eth_maxPriorityFeePerGas:'0x2',eth_gasPrice:'0x12',
  eth_getBlockByNumber:{number:'0x1',timestamp:'0x1',gasLimit:'0x1c9c380',gasUsed:'0x0',baseFeePerGas:'0xf',transactions:[]}};
 const requests:string[]=[];
 const base=createPublicClient({chain:monadTestnet,transport:custom({request:async({method}:any)=>{requests.push(method);assert(method in values,'Unexpected RPC '+method);return values[method];}},{retryCount:0})});
 const client={...base,getTransactionReceipt:async({hash}:any)=>{receipts++;
  if(mode==='missing'||hash!==oldHash)throw Error('Receipt not found');
  return {transactionHash:mode==='mismatch'?`0x${'33'.repeat(32)}`:hash,status:'success'};
 },sendRawTransaction:async({serializedTransaction}:any)=>{
  assert(held);assert.equal(jobs.at(-1).raw,serializedTransaction,'Persist before broadcast');
  signed.push(serializedTransaction);return keccak256(serializedTransaction);
 }};
 let writer:Awaited<ReturnType<typeof independentWriter>>;
 try{writer=await independentWriter(db,client as any,db,scope,{eager});}
 catch(error){await rm(directory,{recursive:true,force:true});throw error;}
 return {writer,jobs,operations,signed,locks,requests,receipts:()=>receipts,
  close:async()=>{await writer.close();assert(!held);await rm(directory,{recursive:true,force:true});}};
}

test('verified receipt wakes the same nonce owner without waiting for a timer',async(t)=>{
 t.mock.timers.enable({apis:['setInterval']});const f=await fixture('confirmed');
 try{
  await Promise.all([f.writer.observe(),f.writer.observe()]);
  await f.writer.close(); // Drain the already-woken task, without any timer tick.
  assert.equal(f.signed.length,1,JSON.stringify({status:f.writer.status(),requests:f.requests,locks:f.locks}));assert.equal(f.jobs[0].status,'confirmed');
  assert.equal(parseTransaction(f.signed[0]).nonce,1);assert.equal(f.locks.length,1);
  assert.equal(f.operations[1].status,'pending');
 }finally{await f.close();}
});
test('missing or mismatched receipts preserve pending nonce and never wake a new signature',async(t)=>{
 t.mock.timers.enable({apis:['setInterval']});
 for(const mode of ['missing','mismatch'] as const){const f=await fixture(mode);
  try{await f.writer.observe();for(let i=0;i<3;i++)await turn();assert.equal(f.jobs[0].status,'pending');assert.equal(f.signed.length,0);assert.equal(f.locks.length,0);}
  finally{await f.close();}
 }
});
test('a stopped writer can reconcile receipts but does not restart dispatch',async(t)=>{
 t.mock.timers.enable({apis:['setInterval']});const f=await fixture('confirmed');
 try{f.writer.stop();await f.writer.observe();await turn();assert.equal(f.jobs[0].status,'confirmed');assert.equal(f.signed.length,0);}
 finally{await f.close();}
});
