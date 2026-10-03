// Actual isolated PostgreSQL, locally signed fixture transactions, simulated RPC.
// No transaction can leave this process. No real key is read or reported.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {Pool} from 'pg';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {InsufficientFundsError,keccak256,parseTransaction,recoverTransactionAddress,type Hex,type PublicClient} from 'viem';
import {independentWriter} from '../relayer/src/independent-writer';

assert.equal(process.env.SCOPED_WRITER_TEST,'isolated-postgres-fake-rpc');
const schema='scoped_writer_'+randomBytes(6).toString('hex');
assert(/^scoped_writer_[a-f0-9]{12}$/.test(schema));
const schemas=[schema,schema+'_second',schema+'_journal'];
const admin=new Pool({connectionString:process.env.DATABASE_URL});
const root=await mkdtemp(join(tmpdir(),'pongit-writer-'));
const target='0x0000000000000000000000000000000000000020';
const report:{at:string;scope:string;checks:string[];passed?:boolean;error?:string}={at:new Date().toISOString(),scope:'Actual temporary PostgreSQL schemas; simulated chain; no network transaction submission',checks:[]};
const pools:Pool[]=[],writers:Awaited<ReturnType<typeof independentWriter>>[]=[];
// viem verifies the wallet chain before local signing. Keep even that read on
// loopback; a fixture must not depend on a public RPC being reachable.
const signingRpc=createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;
 const rpc=JSON.parse(body);res.setHeader('content-type','application/json');
 res.end(JSON.stringify({jsonrpc:'2.0',id:rpc.id,...(rpc.method==='eth_chainId'?{result:'0x279f'}:{error:{code:-32601,message:'Unexpected fixture method'}})}));
});
await new Promise<void>(resolve=>signingRpc.listen(0,'127.0.0.1',resolve));
const signingAddress=signingRpc.address();assert(signingAddress&&typeof signingAddress==='object');
process.env.RPC_URL=`http://127.0.0.1:${signingAddress.port}`;
try{
 for(const name of schemas)await admin.query(`CREATE SCHEMA ${name}`);
 for(const name of schemas)pools.push(new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${name}`,max:12}));
 const [db,second,journal]=pools;
 const makeScope=async(name:string)=>{
  const privateKey=generatePrivateKey(),address=privateKeyToAccount(privateKey).address,keyFile=join(root,name+'.json');
  await writeFile(keyFile,JSON.stringify({privateKey}),{mode:0o600});
  return{address,keyFile,allowCall:(to:string,data:Hex,value:bigint)=>{assert.equal(to.toLowerCase(),target);assert.match(data,/^0x123456[0-9a-f]{2}$/);assert.equal(value,0n);}};
 };
 const one=await makeScope('one'),two=await makeScope('two');
 let visible=false,loseResponse=true,funded=true,sends=0,executions=0;
 const nonces=new Map<string,number>(),seen=new Set<Hex>();
 const base={
  getChainId:async()=>10143,
  call:async()=>({data:'0x'}),
  getTransactionCount:async({address}:{address:string})=>nonces.get(address.toLowerCase())??0,
  getBlock:async()=>({gasLimit:30_000_000n,baseFeePerGas:1n}),
  request:async()=> '0x1',estimateGas:async()=>21_000n,
  getTransactionReceipt:async({hash}:{hash:Hex})=>{if(!visible||!seen.has(hash))throw Error('Response unavailable');return{transactionHash:hash,status:'success'};},
  sendRawTransaction:async({serializedTransaction:raw}:{serializedTransaction:Hex})=>{
   if(!funded)throw new InsufficientFundsError();
   sends++;const hash=keccak256(raw),owner=(await recoverTransactionAddress({serializedTransaction:raw as Parameters<typeof recoverTransactionAddress>[0]["serializedTransaction"]})).toLowerCase(),tx=parseTransaction(raw);
   if(!seen.has(hash)){assert.equal(tx.nonce,nonces.get(owner)??0);nonces.set(owner,(tx.nonce??0)+1);seen.add(hash);executions++;}
   if(loseResponse){loseResponse=false;throw Error('Response lost after execution');}return hash;
  },
 } as unknown as PublicClient;
 const start=async(storage:Pool,scope:typeof one)=>{const w=await independentWriter(storage,base,journal,scope);w.stop();writers.push(w);return w;};
 let writer=await start(db,one);
 const intake=await Promise.all(Array.from({length:40},(_,i)=>writer.enqueue(target,'0x12345678',0n,1,'context-'+i)));
 assert.equal(new Set(intake.map(x=>x.id)).size,1);
 await Promise.all([writer.dispatch(),writer.dispatch()]);assert.equal(executions,1);
 const pending=await writer.get(intake[0].id);assert.equal(pending?.status,'pending');assert(pending.hash);
 await writer.enqueue(target,'0x12345679');await writer.close();
 writer=await start(db,one);await writer.observe();assert.equal((await writer.get(intake[0].id))?.status,'pending');
 await writer.dispatch();assert.equal(executions,1);assert.equal(sends,2);
 assert.equal((await writer.get(intake[0].id))?.hash,pending.hash);
 report.checks.push('40 intake races and parallel dispatch sign once; restart and lost receipt resend the identical transaction without a new nonce');
 const peer=await start(second,two);const peerOperation=await peer.enqueue(target,'0x12345680');await peer.dispatch();
 assert.equal(executions,2);assert.equal((await peer.get(peerOperation.id))?.status,'pending');
 report.checks.push('A pending sponsor does not hold the independent maintenance signer');
 await assert.rejects(start(db,two),/belongs to another signer/);
 await assert.rejects(writer.enqueue(target,'0xdeadbeef'));await assert.rejects(writer.enqueue(target,'0x12345681',1n));
 report.checks.push('Queue binding rejects changed keys; scoped policy rejects another selector and any value');
 visible=true;await Promise.all([writer.observe(),peer.observe()]);
 assert.equal((await writer.get(intake[0].id))?.status,'confirmed');assert.equal((await peer.get(peerOperation.id))?.status,'confirmed');
 await writer.dispatch();await writer.observe();assert.equal(executions,3);
 const rows=(await journal.query('SELECT owner,nonce,status FROM il_lifecycle_jobs ORDER BY owner,nonce')).rows;
 assert.deepEqual(rows.filter(r=>r.owner===one.address.toLowerCase()).map(r=>Number(r.nonce)),[0,1]);
 assert(rows.every(r=>r.status==='confirmed'));
 report.checks.push('Confirmation resumes the next nonce exactly once; separate roles retain separate nonce sequences in the shared journal');
 funded=false;
 const unfunded=await writer.enqueue(target,'0x12345684');await writer.dispatch();
 const retained=await writer.get(unfunded.id);assert.equal(retained?.status,'pending');assert(retained.hash);
 assert.equal(writer.status().code,'OPERATOR_GAS_UNAVAILABLE');assert.equal(writer.status().available,false);
 await writer.dispatch();assert.equal(executions,3);assert.equal((await writer.get(unfunded.id))?.hash,retained.hash);
 funded=true;await writer.dispatch();await writer.observe();
 assert.equal((await writer.get(unfunded.id))?.status,'confirmed');assert.equal((await writer.get(unfunded.id))?.hash,retained.hash);assert.equal(executions,4);
 assert.equal(writer.status().available,true);assert.equal(writer.status().code,undefined);
 report.checks.push('Gas rejection reports unavailable sponsorship, retains the signed nonce/hash and confirms that same operation after funding');
 let release!:()=>void,entered!:()=>void;
 const started=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});
 const original=base.call;
 (base as any).call=async()=>{entered();await gate;return{data:'0x'};};
 const queued=writer.enqueue(target,'0x12345682');await started;
 let closed=false;const closing=writer.close().then(()=>{closed=true;});
 await new Promise(r=>setTimeout(r,30));assert.equal(closed,false);
 await assert.rejects(writer.enqueue(target,'0x12345683'),/stopping/);
 release();await queued;await closing;(base as any).call=original;
 report.checks.push('Shutdown rejects new intake and drains the operation already accepted before database connections close');
 await peer.close();
 const eager=await independentWriter(second,base,journal,two,{eager:true});writers.push(eager);
 const beforeEager=executions,startedEager=performance.now();
 const maintenance=await journal.connect();await maintenance.query('SELECT pg_advisory_lock(701340)');
 try{
 const eagerOperation=await eager.enqueue(target,'0x12345685');
 while(performance.now()-startedEager<600&&(await eager.get(eagerOperation.id))?.status!=='confirmed')await new Promise(r=>setTimeout(r,5));
 assert.equal((await eager.get(eagerOperation.id))?.status,'confirmed','Durable intake should wake dispatch and receipt observation before their fallback intervals');
 assert.equal(executions,beforeEager+1);
 await Promise.all([eager.dispatch(),eager.observe(),eager.dispatch()]);assert.equal(executions,beforeEager+1);
 }finally{await maintenance.query('SELECT pg_advisory_unlock(701340)');maintenance.release();}
 eager.stop();const stopped=await eager.enqueue(target,'0x12345686');await new Promise(r=>setTimeout(r,40));
 assert.equal((await eager.get(stopped.id))?.status,'queued','Explicit stop disables eager work as well as timers');
 assert.equal(executions,beforeEager+1);
 report.checks.push('Scoped eager intake confirms before fallback intervals, remains single-writer under parallel wakeups, and respects stop');
 report.checks.push('A held legacy lifecycle lock does not delay the independently journalled player signer');
 report.passed=true;
}catch(error){report.passed=false;report.error=(error as Error).message;process.exitCode=1;}
finally{
 await Promise.allSettled(writers.map(w=>w.close()));await Promise.all(pools.map(p=>p.end()));
 for(const name of schemas)await admin.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
 await admin.end();await rm(root,{recursive:true,force:true});
 await new Promise<void>(resolve=>signingRpc.close(()=>resolve()));
 const output=process.env.SCOPED_WRITER_REPORT??'artifacts/qualification/20260928/scoped-writer.json';
 await mkdir(join(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
