// Isolated PostgreSQL namespace, fake RPC, no signing or transaction dispatch.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {independentWriter} from '../relayer/src/independent-writer';
assert.equal(process.env.INDEPENDENT_WRITER_TEST,'isolated-vps');
const schema='independent_test_'+randomBytes(6).toString('hex');assert(/^independent_test_[a-f0-9]{12}$/.test(schema));
const admin=new Pool({connectionString:process.env.DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
const journalSchema=schema+'_journal';await admin.query(`CREATE SCHEMA ${journalSchema}`);
const db=new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`,max:12});
const journal=new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${journalSchema}`,max:12});
let simulationError:any,calls=0,sends=0;
const hash='0x'+'a'.repeat(64);
const base:any={getChainId:async()=>10143,call:async()=>{calls++;await new Promise(r=>setTimeout(r,10));if(simulationError)throw simulationError;return {data:'0x'};},
 getTransactionReceipt:async({hash}:any)=>({transactionHash:hash,status:'success'}),sendRawTransaction:async()=>{sends++;throw Error('No network writes in this fixture');}};
let writer:Awaited<ReturnType<typeof independentWriter>>|undefined;
const report:any={at:new Date().toISOString(),checks:[]};
try{
 writer=await independentWriter(db,base,journal);writer.stop();
 const target='0x0000000000000000000000000000000000000020';
 const requests=await Promise.all(Array.from({length:40},(_,i)=>writer!.enqueue(target,'0x12345678',0n,1,'observed-state-'+i)));
 assert.equal(new Set(requests.map(r=>r.id)).size,1);assert.equal(Number((await db.query('SELECT count(*) FROM independent_operations')).rows[0].count),1);
 report.checks.push('40 concurrent contexts enqueue one immutable operation');
 await db.query("UPDATE independent_operations SET status='pending',hash=$1",['0x'+'a'.repeat(64)]);
 const before=calls,result=await writer.enqueue(target,'0x12345678',0n,1,'reconnect');assert.equal(result.status,'pending');assert.equal(result.hash,'0x'+'a'.repeat(64));assert.equal(calls,before);
 report.checks.push('Uncertain submitted operation reused without simulation or replacement');
 simulationError={name:'ContractFunctionRevertedError'};await assert.rejects(writer.enqueue(target,'0x12345679'),/contract rejected/i);
 simulationError={name:'HttpRequestError'};await assert.rejects(writer.enqueue(target,'0x12345680'));assert.equal(Number((await db.query('SELECT count(*) FROM independent_operations')).rows[0].count),1);
 report.checks.push('Rejected signatures and RPC failures never enter the unsigned queue');
 assert.equal(Number((await journal.query('SELECT count(*) FROM il_lifecycle_jobs')).rows[0].count),0);
 assert.equal((await db.query("SELECT to_regclass('il_lifecycle_jobs') AS table_name")).rows[0].table_name,null);
 report.checks.push('Private business storage does not create a second operator nonce journal');
 // Simulate a crash after signing/journalling but before linking the queue row.
 await db.query("UPDATE independent_operations SET status='queued',hash=NULL");
 await journal.query("INSERT INTO il_lifecycle_jobs(id,app,owner,nonce,raw,hash,status) VALUES($1,$2,$3,900000,'fixture',$4,'confirmed')",['independent:'+requests[0].id,target,writer.account.toLowerCase(),hash]);
 await writer.observe();assert.equal((await writer.get(requests[0].id))?.status,'confirmed');assert.equal((await writer.get(requests[0].id))?.hash,hash);
 report.checks.push('Cross-database restart recovers the confirmed original hash without re-signing');
 // A different queue owns this pending transaction; our dispatcher must not
 // even parse its bytes, let alone resend or allocate another nonce.
 await journal.query("INSERT INTO il_lifecycle_jobs(id,app,owner,nonce,raw,hash,status) VALUES('independent:another-queue',$1,$2,900001,'not-our-bytes',$3,'pending')",[target,writer.account.toLowerCase(),'0x'+'b'.repeat(64)]);
 await writer.dispatch();assert.equal(sends,0);
 assert.equal((await journal.query("SELECT status FROM il_lifecycle_jobs WHERE id='independent:another-queue'")).rows[0].status,'pending');
 report.checks.push('A pending operation owned by another queue blocks dispatch without resend');
 report.passed=true;
}finally{writer?.stop();await Promise.all([db.end(),journal.end()]);await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.query(`DROP SCHEMA ${journalSchema} CASCADE`);await admin.end();await writeFile('artifacts/independent-candidate/writer-regression-separated.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
