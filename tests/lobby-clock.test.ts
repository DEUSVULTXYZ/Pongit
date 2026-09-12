import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LobbyClock,QueueElapsed} from '../shared/lobby-clock';
test('the 28 second wall-clock skew cannot freeze a queue or an offer deadline',()=>{
 let mono=0,wall=100000;const clock=new LobbyClock(()=>mono,()=>wall),queue=new QueueElapsed();
 clock.observe(128000);assert.equal(queue.sample('queue',128000,clock.now(),mono),0);
 mono=3500;assert.equal(queue.sample('queue',128000,clock.now(),mono),3);
 wall=-9000000;mono=5000;assert.equal(clock.now(),133000);
 clock.observe(130000);assert.equal(clock.now(),133000,'old observations never rewind time');
 mono=8000;assert.equal(queue.sample('queue',128000,clock.now(),mono),8);
});
test('legacy clock fallback progresses and fresh queues reset without inheriting waiting time',()=>{
 const q=new QueueElapsed();assert.equal(q.sample('a',128000,100000,0),0);
 assert.equal(q.sample('a',128000,102000,2000),2);
 assert.equal(q.sample('a',128000,137000,3000),9);
 assert.equal(q.sample(undefined,0,138000,4000),0);
 assert.equal(q.sample('b',138000,138000,4000),0);
 assert.equal(q.sample('b',138000,138000,7000),3);
});
