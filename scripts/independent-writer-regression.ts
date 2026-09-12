// Isolated PostgreSQL namespace, fake RPC, no signing or transaction dispatch.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {independentWriter} from '../relayer/src/independent-writer';
assert.equal(process.env.INDEPENDENT_WRITER_TEST,'isolated-vps');
const schema='independent_test_'+randomBytes(6).toString('hex');assert(/^independent_test_[a-f0-9]{12}$/.test(schema));
const admin=new Pool({connectionString:process.env.DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
const db=new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`,max:12});
let simulationError:any,calls=0;
const base:any={getChainId:async()=>10143,call:async()=>{calls++;await new Promise(r=>setTimeout(r,10));if(simulationError)throw simulationError;return {data:'0x'};}};
let writer:Awaited<ReturnType<typeof independentWriter>>|undefined;
const report:any={at:new Date().toISOString(),checks:[]};
try{
 writer=await independentWriter(db,base);writer.stop();
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
 assert.equal(Number((await db.query('SELECT count(*) FROM il_lifecycle_jobs')).rows[0].count),0);report.passed=true;
}finally{writer?.stop();await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await writeFile('artifacts/independent-candidate/writer-regression.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
