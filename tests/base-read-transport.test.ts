import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baseReadTransport} from '../shared/base-read-transport';

test('base reads share a paced queue and coalesce only identical in-flight requests',async()=>{
 const original=globalThis.fetch;let now=0;const calls:{at:number;method:string}[]=[];
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));calls.push({at:now,method:body.method});return Response.json({jsonrpc:'2.0',id:body.id,result:'0x1'});};
 try{
  const transport=baseReadTransport('https://read-fixture.invalid',{now:()=>now,sleep:async ms=>{now+=ms;}})({} as any);
  const same={method:'eth_call',params:[{to:'0x1',data:'0x'},'0x10']} as const;
  assert.deepEqual(await Promise.all([transport.request(same),transport.request(same),transport.request({...same,params:[{to:'0x1',data:'0x'},'0x11']})]),['0x1','0x1','0x1']);
  assert.deepEqual(calls.map(x=>x.at),[0,400]);
  await transport.request(same);assert.equal(calls.length,3,'A later read is never served as a cached authorization');
  await assert.rejects(transport.request({method:'eth_sendRawTransaction',params:['0x00']}),/only permits public chain reads/);
  assert.equal(calls.length,3);
 }finally{globalThis.fetch=original;}
});

test('a confirmed JSON-RPC read limit backs off and recovers without consuming a write nonce',async()=>{
 const original=globalThis.fetch;let now=0,attempts=0;
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));attempts++;return Response.json({jsonrpc:'2.0',id:body.id,...(attempts===1?{error:{code:-32005,message:'requests limited to 15/sec'}}:{result:'0x2'})});};
 try{
  const t=baseReadTransport('https://limit-fixture.invalid',{now:()=>now,sleep:async ms=>{now+=ms;}})({} as any);
  assert.equal(await t.request({method:'eth_blockNumber'}),'0x2');assert.equal(attempts,2);assert.equal(now,1000);
 }finally{globalThis.fetch=original;}
});

test('read retries honor Retry-After and remain bounded; other failures are not replayed',async()=>{
 const original=globalThis.fetch;let now=0,attempts=0,limited=true;
 globalThis.fetch=async(_url,init)=>{attempts++;const body=JSON.parse(String(init?.body));return limited?new Response('Busy',{status:429,headers:{'retry-after':'3'}}):Response.json({jsonrpc:'2.0',id:body.id,error:{code:-32000,message:'execution reverted'}});};
 try{
  const t=baseReadTransport('https://bounded-fixture.invalid',{now:()=>now,sleep:async ms=>{now+=ms;}})({} as any);
  await assert.rejects(t.request({method:'eth_blockNumber'}));assert.equal(attempts,3);assert.equal(now,6000);
  limited=false;await assert.rejects(t.request({method:'eth_call',params:[]}));assert.equal(attempts,4);
 }finally{globalThis.fetch=original;}
});
