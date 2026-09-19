// Isolated disposable PostgreSQL database only. Does not contact a game node.
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {initializePoolObservations,PoolObservations} from '../relayer/src/agents/pool-observations';
const connectionString=process.env.AGENT_DATABASE_URL!;
assert.equal(new URL(connectionString).pathname,'/pool_observation_check');
const db=new Pool({connectionString}),app='0x0000000000000000000000000000000000000011';
const s=(revision:bigint,time:bigint,reset=false)=>({id:1n,phase:2,revision,reset,state:{mode:1,t:time,scoreA:0,scoreB:0}}) as any;
const read=async()=>{const rows=await db.query('SELECT revision,time_us,resets,observers FROM agent_pool.observations WHERE app=$1',[app]);return rows.rows[0];};
try{
 await db.query('CREATE SCHEMA IF NOT EXISTS agent_pool');await initializePoolObservations(db);
 await db.query('DELETE FROM agent_pool.observations WHERE app=$1',[app]);
 let now=Date.now();const one=new PoolObservations(db,app,{epoch:1n,id:1n},()=>now);
 one.observe(s(100n,1000n));await one.flush();
 // A reset followed by forward snapshots can be coalesced while a query waits.
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let held=true;
 const slow:any={query:async(...args:any[])=>{if(held){held=false;await gate;}return (db.query as any)(...args);}};
 const two=new PoolObservations(slow,app,{epoch:1n,id:1n},()=>now);
 two.observe(s(101n,1010n));two.observe(s(4n,40n,true));now+=1500;two.observe(s(5n,50n));release();await two.flush();
 let row=await read();assert.equal(row.revision,'5');assert.equal(row.resets,1);
 // A restarted observer contributes a new reset, without erasing earlier ones.
 const three=new PoolObservations(db,app,{epoch:1n,id:1n},()=>now);
 three.observe(s(2n,20n,true));await three.flush();row=await read();assert.equal(row.resets,2);
 now+=1500;three.observe(s(3n,30n));await three.flush();assert.equal((await read()).resets,2);
 // Stale ordinary reads are not reset evidence.
 const stale=new PoolObservations(db,app,{epoch:1n,id:1n},()=>now);stale.observe(s(0n,0n));await stale.flush();assert.equal((await read()).revision,'3');
 await db.query("UPDATE agent_pool.observations SET last_at=now()-interval '8 days'");await initializePoolObservations(db);
 assert.equal((await db.query('SELECT count(*)::int n FROM agent_pool.observations')).rows[0].n,0);
 console.log(JSON.stringify({passed:true,checks:['coalesced-reset','restart-cumulative-resets','no-duplicate-reset','stale-read-rejected','seven-day-retention']}));
}finally{await db.end();}
