import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DrandBeaconTransport} from '../shared/drand-beacon';
const vector={round:20595447,signature:'09551d65d9c79bd0c078a4a511cbbd661f7c530186cb572a6c8de0f7420bc8212cfdba785d1383039ce376dcd7602f0f1a1143a8c0640d38db4c2363db763aa6',randomness:'547fe7d550bd6391a833cc90e8227205595342caa9ee4803781c710eb04dab8d'};
const response=()=>new Response(JSON.stringify(vector),{headers:{'Content-Type':'application/json'}});
test('concurrent transports share one request and cache the exact round',async()=>{
 let calls=0;const t=new DrandBeaconTransport({fetch:async()=>{calls++;return response();}});
 const values=await Promise.all(Array.from({length:20},()=>t.read(20595447n)));
 assert.equal(calls,1);assert(values.every(x=>x.round===20595447n));await t.read(20595447n);assert.equal(calls,1);
});
test('429 respects Retry-After and preserves the round on another mirror',async()=>{
 let now=1000;const urls:string[]=[];
 const t=new DrandBeaconTransport({now:()=>now,fetch:async input=>{
  urls.push(String(input));return new Response(null,{status:429,headers:{'Retry-After':'10'}});
 }});
 await assert.rejects(t.read(20595447n),e=>{assert.equal((e as any).retryAt,11000);return true;});
 assert.equal(urls.length,3);await assert.rejects(t.read(20595447n));assert.equal(urls.length,3);
 now=12000;await assert.rejects(t.read(20595447n));assert.equal(urls.length,6);
 assert(urls.every(url=>url.endsWith('/20595447')));
});
test('missing or malformed replies never select an older round',async()=>{
 for(const value of [{...vector,round:20595446},{...vector,signature:'00'},{...vector,randomness:'0'.repeat(64)}]){
  const urls:string[]=[];const t=new DrandBeaconTransport({fetch:async input=>{urls.push(String(input));return new Response(JSON.stringify(value));}});
  await assert.rejects(t.read(20595447n));assert(urls.every(url=>url.endsWith('/20595447')));
 }
});
test('oversized chunked response is rejected and an honest mirror can recover',async()=>{
 let calls=0;const t=new DrandBeaconTransport({fetch:async()=>++calls===1?new Response('x'.repeat(5000)):response()});
 assert.equal((await t.read(20595447n)).round,20595447n);assert.equal(calls,2);
});
test('future beacon absence is explicit, without caching a failure forever',async()=>{
 let available=false,now=1000;
 const t=new DrandBeaconTransport({now:()=>now,fetch:async()=>available?response():new Response(null,{status:404})});
 await assert.rejects(t.read(20595447n));available=true;now=5000;assert.equal((await t.read(20595447n)).round,20595447n);
});
