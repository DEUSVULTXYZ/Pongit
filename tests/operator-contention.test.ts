import assert from 'node:assert/strict';
import {test} from 'node:test';
import {retryOperatorContention} from '../shared/operator-contention';

test('operator contention waits for the other writer and preserves this operation',async()=>{
 let calls=0,clock=0;const bytes='exact-original-intent';
 const result=await retryOperatorContention(async()=>{
  calls++;if(calls<3)assert.equal(1,0,'Reconcile the existing operator transaction first');
  return bytes;
 },{now:()=>clock,sleep:async ms=>{clock+=ms;}});
 assert.equal(result,bytes);assert.equal(calls,3);assert.equal(clock,2000);
});
test('operator contention is bounded and does not retry uncertain network results',async()=>{
 let clock=0,calls=0;
 await assert.rejects(retryOperatorContention(async()=>{
  calls++;assert(false,'Operator is busy; retry without creating another operation');
 },{timeoutMs:2000,now:()=>clock,sleep:async ms=>{clock+=ms;}}),/Operator is busy/);
 assert.equal(calls,3);
 for(const error of [Error('response lost'),Error('Reconcile the existing operator transaction first'),new assert.AssertionError({message:'Operator nonce is in use'})]){
  calls=0;await assert.rejects(retryOperatorContention(async()=>{calls++;throw error;}),e=>e===error);assert.equal(calls,1);
 }
});
