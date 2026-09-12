// Re-submit only the exact journaled raw. Never sign or allocate a new nonce.
import {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
assert.equal(process.env.PONG_INDEPENDENT_WRITE,'authorized-testnet');
const m=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));
assert.equal(m.production,false);
const db=new Pool({connectionString:process.env.DATABASE_URL});
for(const arena of m.arenas){
 const row=(await db.query("SELECT nonce,hash,raw FROM il_engine_jobs WHERE app=$1 AND status='pending' ORDER BY nonce LIMIT 1",[arena.app.toLowerCase()])).rows[0];
 if(!row)continue;
 const response=await fetch(arena.node||`https://il-${arena.app.slice(2,18).toLowerCase()}.fly.dev`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'interlude_sendTransaction',params:[row.raw]}),signal:AbortSignal.timeout(12000)});
 const body=await response.json() as any;
 console.log(JSON.stringify({at:new Date().toISOString(),arena:arena.app,nonce:row.nonce,hash:row.hash,http:response.status,error:body.error,receipt:body.result?{status:body.result.status,transactionHash:body.result.transactionHash}:null}).replace(/0x[\da-f]{130,}/gi,'[signed data omitted]'));
}
await db.end();
