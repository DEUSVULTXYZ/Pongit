import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LobbyClock,QueueElapsed} from '../shared/lobby-clock';
test('offer deadlines use the shared clock while the queue is entirely monotonic and local',()=>{
 let mono=0,wall=100000;const clock=new LobbyClock(()=>mono,()=>wall),queue=new QueueElapsed();
 clock.observe(128000);assert.equal(queue.sample('queue',mono),0);
 mono=3500;assert.equal(queue.sample('queue',mono),3);
 wall=-9000000;mono=5000;assert.equal(clock.now(),133000);
 clock.observe(130000);assert.equal(clock.now(),133000,'old observations never rewind time');
 clock.observe(9000000000);mono=8000;assert.equal(queue.sample('queue',mono),8,'server jumps cannot change queue duration');
});
test('legacy clock fallback progresses and fresh queues reset without inheriting waiting time',()=>{
 const q=new QueueElapsed();assert.equal(q.sample('a',0),0);
 assert.equal(q.sample('a',2000),2);
 assert.equal(q.sample('a',3000),3);
 assert.equal(q.sample(undefined,4000),0);
 assert.equal(q.sample('b',4000),0);
 assert.equal(q.sample('b',7000),3);
});
