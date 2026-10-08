import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSocketSend} from '../shared/reconcile-socket-send';
const hash=`0x${'12'.repeat(32)}` as const;
const receipt={transactionHash:hash,status:'0x1',blockNumber:'0x42',logs:[]};
const deferred=<T>()=>{let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('normal receipt adds no lookup, resend or latency timer',async()=>{
 let reads=0,copies=0;
 const result=await reconcileSocketSend({hash,send:async()=>receipt,receipt:async()=>{reads++;return null;},repeat:async()=>{copies++;return receipt;},slowMs:5});
 assert.deepEqual(result,{value:receipt});assert.equal(reads,0);assert.equal(copies,0);
});
test('a slow socket resolves by exact receipt without resending',async()=>{
 const original=deferred<typeof receipt>();let copies=0;
 const result=await reconcileSocketSend({hash,send:()=>original.promise,receipt:async()=>receipt,repeat:async()=>{copies++;return receipt;},slowMs:1});
 assert.deepEqual(result,{value:receipt,recovered:'receipt'});assert.equal(copies,0);
 original.reject(Error('late lost response'));
});
test('only a null receipt permits one identical delivery through the existing owner',async()=>{
 const original=deferred<typeof receipt>();let reads=0,copies=0;
 const result=await reconcileSocketSend({hash,send:()=>original.promise,receipt:async()=>{reads++;return null;},repeat:async()=>{copies++;return receipt;},slowMs:1});
 assert.deepEqual(result,{value:receipt,recovered:'repeat'});assert.equal(reads,1);assert.equal(copies,1);
 original.resolve(receipt);
});
test('wrong, malformed and unavailable receipts never authorize a resend',async()=>{
 for(const value of [undefined,{}, {...receipt,transactionHash:`0x${'34'.repeat(32)}`},{...receipt,blockNumber:undefined},{...receipt,status:'pending'}]){
  const original=deferred<typeof receipt>();let copies=0;
  const result=reconcileSocketSend({hash,send:()=>original.promise,receipt:async()=>{setTimeout(()=>original.resolve(receipt),5);return value;},repeat:async()=>{copies++;return receipt;},slowMs:1});
  assert.deepEqual(await result,{value:receipt});assert.equal(copies,0);
 }
 const original=deferred<typeof receipt>();let copies=0;
 const result=reconcileSocketSend({hash,send:()=>original.promise,receipt:async()=>{setTimeout(()=>original.resolve(receipt),5);throw Error('read offline');},repeat:async()=>{copies++;return receipt;},slowMs:1});
 assert.deepEqual(await result,{value:receipt});assert.equal(copies,0);
});
test('an explicit node rejection is never retried by this recovery',async()=>{
 let reads=0,copies=0;const failure=Error('NodeBusyError');
 await assert.rejects(reconcileSocketSend({hash,send:async()=>{throw failure;},receipt:async()=>{reads++;return null;},repeat:async()=>{copies++;return receipt;},slowMs:1}),e=>e===failure);
 assert.equal(reads,0);assert.equal(copies,0);
});
test('a rejection arriving during lookup cannot trigger a second send',async()=>{
 const original=deferred<typeof receipt>(),lookup=deferred<unknown>();let copies=0;
 const result=reconcileSocketSend({hash,send:()=>original.promise,receipt:()=>{original.reject(Error('publication paused'));return lookup.promise;},repeat:async()=>{copies++;return receipt;},slowMs:1});
 await assert.rejects(result,/publication paused/);lookup.resolve(null);assert.equal(copies,0);
});
test('a raced nonce complaint resolves by original hash, never a replacement nonce',async()=>{
 const original=deferred<typeof receipt>();let reads=0,copies=0;
 const result=await reconcileSocketSend({hash,send:()=>original.promise,receipt:async()=>++reads===1?null:receipt,repeat:async()=>{copies++;throw Error('nonce too low');},slowMs:1});
 assert.deepEqual(result,{value:receipt,recovered:'receipt'});assert.equal(copies,1);assert.equal(reads,2);original.reject(Error('lost original'));
});
test('two lost deliveries preserve failure and never loop',async()=>{
 const original=deferred<typeof receipt>();let copies=0,reads=0;
 const result=reconcileSocketSend({hash,send:()=>original.promise,receipt:async()=>{reads++;return null;},repeat:async()=>{copies++;setTimeout(()=>original.reject(Error('original lost')),2);throw Error('copy lost');},slowMs:1});
 await assert.rejects(result,/original lost/);assert.equal(copies,1);assert.equal(reads,2);
});
test('an exact reverted receipt resolves the nonce without converting it to success',async()=>{
 const original=deferred<typeof receipt>();const reverted={...receipt,status:'0x0'};let copies=0;
 const result=await reconcileSocketSend({hash,send:()=>original.promise,receipt:async()=>reverted,repeat:async()=>{copies++;return receipt;},slowMs:1});
 assert.equal(result.value.status,'0x0');assert.equal(copies,0);original.resolve(receipt);
});
