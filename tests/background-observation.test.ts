import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BackgroundObservation} from '../shared/background-observation';
test('slow metadata refresh does not stop the game, but an expired observation cannot authorize progress',async()=>{
 let now=0,calls=0,resolve!:(value:number)=>void;
 const c=new BackgroundObservation(()=>{calls++;return new Promise<number>(done=>resolve=done);},2000,5000,()=>now);
 const first=c.read();await Promise.resolve();assert.equal(calls,1);resolve(1);assert.equal(await first,1);
 now=2100;assert.equal(await c.read(),1);assert.equal(calls,2);assert.equal(await c.read(),1);assert.equal(calls,2);
 now=5000;let done=false;const expired=c.read().then(v=>{done=true;return v;});await Promise.resolve();assert.equal(done,false);
 resolve(2);assert.equal(await expired,2);assert.equal(calls,2);
});
test('failed refresh preserves the old observation without making it fresh or silently hiding expiry',async()=>{
 let now=0,fail=false,calls=0;
 const c=new BackgroundObservation(async()=>{calls++;if(fail)throw Error('RPC unavailable');return 7;},2000,5000,()=>now);
 assert.equal(await c.read(),7);now=2100;fail=true;assert.equal(await c.read(),7);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);
 now=5000;await assert.rejects(c.read(),/RPC unavailable/);assert.equal(calls,3);
});

test('explicit recovery reads await fresh evidence and coalesce instead of returning a cached halt',async()=>{
 let calls=0,resolve!:(value:boolean)=>void;
 const c=new BackgroundObservation(()=>++calls===1?Promise.resolve(false):new Promise<boolean>(done=>resolve=done),10000,15000);
 assert.equal(await c.read(),false);
 let done=false;const a=c.read(true).then(v=>{done=true;return v;}),b=c.read(true);
 await Promise.resolve();assert.equal(calls,2);assert.equal(done,false);
 resolve(true);assert.deepEqual(await Promise.all([a,b]),[true,true]);
 assert.equal(await c.read(),true);assert.equal(calls,2);
});
