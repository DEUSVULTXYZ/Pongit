import {test} from 'node:test';import assert from 'node:assert/strict';
import {keeperLoop} from '../shared/keeper-loop';
test('persistent keeper reuses state and never overlaps steps, including uncertain retries',async()=>{
 const stop=new AbortController();let count=0,active=0,max=0,nonce=10,pending:number|undefined;const seen:number[]=[],waits:number[]=[];
 await keeperLoop({signal:stop.signal,step:async()=>{
  active++;max=Math.max(max,active);count++;pending??=nonce;seen.push(pending);
  await Promise.resolve();active--;
  if(count===1)throw Error('lost response');
  nonce++;pending=undefined;if(count===3)stop.abort();
 },sleep:async ms=>{waits.push(ms);}});
 assert.equal(max,1);assert.deepEqual(seen,[10,10,11]);assert.deepEqual(waits,[2000,500]);
});
test('stop waits for the current step and does not submit a replacement',async()=>{
 const stop=new AbortController();let calls=0,finish!:()=>void;
 const done=keeperLoop({signal:stop.signal,step:async()=>{calls++;await new Promise<void>(resolve=>{finish=resolve;});}});
 stop.abort();assert.equal(calls,1);finish();await done;assert.equal(calls,1);
});
test('an already stopped keeper does not touch chain state',async()=>{
 const stop=new AbortController();stop.abort();await keeperLoop({signal:stop.signal,step:async()=>assert.fail('unexpected operation')});
});
