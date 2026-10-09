import test from 'node:test';
import assert from 'node:assert/strict';
import {sponsorIntakeWindow} from '../relayer/src/sponsor-intake-window';
const pending=()=>{let resolve!:()=>void,reject!:(e:unknown)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};

test('already validating admissions finish together before dispatch',async()=>{
 const window=sponsorIntakeWindow(),one=pending(),two=pending();let dispatched=false;
 const a=window.track(()=>one.promise),b=window.track(()=>two.promise);
 const dispatch=window.join(Date.now()).then(()=>{dispatched=true;});
 one.resolve();await a;assert.equal(dispatched,false);
 two.resolve();await b;await dispatch;assert.equal(dispatched,true);assert.equal(window.size,0);
});
test('failed admission does not starve valid queued work',async()=>{
 const window=sponsorIntakeWindow(),one=pending();const work=window.track(()=>one.promise);
 const failed=assert.rejects(work,/rejected/),dispatch=window.join(Date.now());one.reject(Error('rejected'));
 await Promise.all([failed,dispatch]);assert.equal(window.size,0);
});
test('an overlapping late validation joins without dropping an admitted peer',async()=>{
 const window=sponsorIntakeWindow(),one=pending(),late=pending();const a=window.track(()=>one.promise);
 let dispatched=false;const dispatch=window.join(Date.now()).then(()=>{dispatched=true;});
 const b=window.track(()=>late.promise);one.resolve();await a;
 await new Promise(resolve=>setImmediate(resolve));assert.equal(dispatched,false);
 late.resolve();await b;await dispatch;assert.equal(window.size,0);
});

test('overlapping arrivals never extend the oldest durable deadline',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});
 const window=sponsorIntakeWindow(),one=pending(),late=pending();const a=window.track(()=>one.promise);
 let dispatched=false;const dispatch=window.join(9700).then(()=>{dispatched=true;});
 t.mock.timers.tick(500);const b=window.track(()=>late.promise);one.resolve();await a;
 await new Promise(resolve=>setImmediate(resolve));assert.equal(dispatched,false);
 t.mock.timers.tick(199);await Promise.resolve();assert.equal(dispatched,false);
 t.mock.timers.tick(1);await dispatch;assert.equal(dispatched,true);
 assert.equal(window.size,1);late.resolve();await b;
});
test('hung validation stops delaying at original durable deadline',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});const window=sponsorIntakeWindow(),one=pending();
 const a=window.track(()=>one.promise);let dispatched=false;const work=window.join(9700).then(()=>{dispatched=true;});
 t.mock.timers.tick(699);await Promise.resolve();assert.equal(dispatched,false);
 t.mock.timers.tick(1);await work;assert.equal(dispatched,true);one.resolve();await a;
});
test('restart, isolated and expired queues wait for no future arrivals',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});const window=sponsorIntakeWindow();
 await window.join(10000);const one=pending(),a=window.track(()=>one.promise);
 await window.join(9000);await window.join(NaN);one.resolve();await a;
});
