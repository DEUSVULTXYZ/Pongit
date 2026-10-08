import test from 'node:test';
import assert from 'node:assert/strict';
import {rpcReadPriority} from '../relayer/src/rpc-read-priority';
import {rpcScheduler} from '../relayer/src/rpc-scheduler';

test('a player joining a queued background read inherits foreground priority without a second dispatch',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const scheduler=rpcScheduler(75),seen:Array<{name:string;at:number}>=[];
 await scheduler.acquire(false);
 const old=Array.from({length:12},(_,i)=>scheduler.acquire(false).then(()=>seen.push({name:'old'+i,at:Date.now()})));
 const slot=scheduler.reserve(false),hint=rpcReadPriority(false);
 const unsubscribe=hint.subscribe(()=>slot.promote());
 const shared=slot.done.then(()=>{unsubscribe();seen.push({name:'shared',at:Date.now()});});
 hint.promote();hint.promote();
 for(let i=0;i<13;i++){t.mock.timers.tick(75);await Promise.resolve();}
 await Promise.all([...old,shared]);
 assert.equal(seen[0].name,'shared');assert.equal(seen.length,13);
 assert.deepEqual(seen.map(s=>s.at),Array.from({length:13},(_,i)=>1075+i*75));
 assert.equal(slot.promote(),false);assert.deepEqual(scheduler.pending(),{interactive:0,history:0});
});

test('a shared hint survives a provider retry but never promotes history or bypasses cooldown',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const scheduler=rpcScheduler(75);await scheduler.acquire(false);scheduler.throttle(2000);
 const hint=rpcReadPriority(false),history=scheduler.reserve(true),control=scheduler.reserve(false,true);
 let notices=0;const unwatch=hint.subscribe(()=>{notices++;assert(!history.promote());assert(!control.promote());});
 hint.promote();unwatch();hint.promote();assert.equal(notices,1);
 const retry=scheduler.reserve(false);let done=false;
 const off=hint.subscribe(()=>retry.promote());const completion=retry.done.then(()=>{done=true;off();});
 t.mock.timers.tick(1999);await Promise.resolve();assert(!done);
 for(let i=0;i<4;i++){t.mock.timers.tick(100);await Promise.resolve();}
 await Promise.all([history.done,control.done,completion]);assert(done);
});
