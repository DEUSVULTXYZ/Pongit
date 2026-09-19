import {test} from 'node:test';import assert from 'node:assert/strict';
import {PoolObservations} from '../relayer/src/agents/pool-observations';
const app='0x0000000000000000000000000000000000000011';
const state=(extra:any={})=>({id:1n,phase:2,revision:1n,state:{mode:1,t:0n,scoreA:0,scoreB:0},...extra}) as any;
test('records only active revealed effects, ignores old snapshots and preserves exact arena epochs',async()=>{
 const rows:any[][]=[],db:any={query:async(_:string,args:any[])=>{rows.push(args);}};let now=10000;
 const one=new PoolObservations(db,app,{epoch:1n,id:1n},()=>now),two=new PoolObservations(db,app,{epoch:2n,id:1n},()=>now);
 one.observe(state({chaos:{physics:{t:1500000n,effects:[{id:3,startsAt:1000,expiresAt:2000},{id:7,startsAt:2000,expiresAt:3000},{id:9,startsAt:0,expiresAt:1500}]}}}));
 await one.flush();assert.deepEqual(rows[0][9],[3]);assert.equal(rows[0][1],'1');
 now+=1200;one.observe(state({revision:0n}));assert.equal(rows.length,1);
 two.observe(state());await two.flush();assert.equal(rows[1][1],'2');assert.deepEqual(rows[1][9],[]);
 one.observe(state({id:99n,revision:99n}));assert.equal(rows.length,2);
});
test('a slow database keeps one latest sample, retains effects and publishes terminal observations',async()=>{
 const rows:any[][]=[];let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const db:any={query:async(_:string,args:any[])=>{rows.push(args);if(rows.length===1)await gate;}};
 const o=new PoolObservations(db,app,{epoch:1n,id:1n},()=>10000);
 o.observe(state());
 o.observe(state({revision:2n,chaos:{physics:{t:1000n,effects:[{id:2,startsAt:0,expiresAt:1000}]}}}));
 o.observe(state({revision:3n,phase:3,state:{mode:1,t:50000n,scoreA:7,scoreB:2}}));
 release();await o.flush();assert.equal(rows.length,2);assert.equal(rows[1][4],3);assert.deepEqual(rows[1][9],[2]);
 assert.equal(rows[1][7],7);
});
test('failed observation storage is visible and a following sample retries without blocking controls',async()=>{
 let fail=true,errors=0,reads=0;const db:any={query:async()=>{reads++;if(fail)throw Error('database unavailable');}};
 const o=new PoolObservations(db,app,{epoch:1n,id:1n},()=>10000,()=>errors++);
 o.observe(state());await assert.rejects(o.flush(),/incomplete/);assert.equal(errors,1);
 fail=false;o.observe(state({revision:2n}));await o.flush();assert.equal(reads,2);
});
