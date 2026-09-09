import {test} from "node:test";
import assert from "node:assert/strict";
import {engineRead, engineReadRetryMs} from "../shared/engine-read";

test("overlapping reads coalesce and retain their original observation time",async()=>{
  let calls=0,now=100;
  const read=engineRead(async()=>({observedAt:now,call:++calls}),100,()=>now);
  const [a,b]=await Promise.all([read(),read()]);assert.equal(calls,1);assert.equal(a,b);
  now=150;assert.equal(await read(),a);assert.equal(a.observedAt,100);
  now=201;assert.equal((await read()).call,2);
});
test("a post-write read cannot be satisfied or overwritten by an older in-flight read",async()=>{
  let release!:(value:number)=>void,calls=0;
  const read=engineRead(()=>++calls===1?new Promise<number>(r=>release=r):Promise.resolve(2));
  const old=read();assert.equal(await read(true),2);release(1);assert.equal(await old,1);
  assert.equal(await read(),2);assert.equal(calls,2);
});
test("failed reads are not cached and HTTP 429 keeps the server cooldown",async()=>{
  let calls=0;const read=engineRead(async()=>{if(++calls===1)throw Error('unavailable');return 2;});
  await assert.rejects(read());assert.equal(await read(),2);
  assert.equal(engineReadRetryMs({cause:{status:429,headers:new Headers({'retry-after':'10'})}}),10000);
  assert.equal(engineReadRetryMs({status:429}),10000);
  assert.equal(engineReadRetryMs({status:502}),0);
});
