import {test} from "node:test";
import assert from "node:assert/strict";
import {engineRequestGate,engineTransport,engineCooldownMs,observeEnginePublication} from "../shared/engine-transport";
import {engineReadRetryMs} from "../shared/engine-read";
import {createSendRouter} from '@interludelayer-sdk/sdk';
import {WebSocketServer} from 'ws';

test('an unanswered actual send socket releases the lane within the recovery budget without retrying',async()=>{
 const server=new WebSocketServer({host:'127.0.0.1',port:0});
 await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 let calls=0,received=0,journaled=0,close=()=>{};
 server.on('connection',socket=>socket.on('message',()=>{calls++;}));
 try{
  const address=server.address();assert(address&&typeof address!=='string');
  const t=engineTransport(`http://127.0.0.1:${address.port}`,{beforeSend:async()=>{journaled++;},received:()=>{received++;}},true)({} as any);
  close=()=>t.value?.closeSend();
  const at=performance.now();
  await assert.rejects(t.request({method:'interlude_sendTransaction',params:['0x0102']}));
  const elapsed=performance.now()-at;
  assert(elapsed>=3500&&elapsed<6000,`bounded socket timeout: ${elapsed}ms`);
  assert.equal(calls,1);assert.equal(journaled,1);assert.equal(received,0);
 }finally{
  close();
  for(const client of server.clients)client.terminate();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});

test('SDK socket loss does not replay writes; the journal owner resumes identical bytes over HTTP',async()=>{
 const original=globalThis.fetch;let now=0,ws=0,http=0,journaled=0,allow=false,received=0;
 const made:number[]=[];
 const router=createSendRouter('https://send-router.invalid',{now:()=>now,make:(_url,_via,socket)=>({request:async()=>{
  made.push(socket);ws++;if(ws===1)throw Error('Socket response lost');return 'socket receipt';
 }}) as any,close:()=>{}});
 globalThis.fetch=async(_url,init)=>{http++;const body=JSON.parse(String(init?.body));return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result:'http receipt'}));};
 try{
  const t=engineTransport('https://send-router.invalid',{beforeSend:async()=>{if(journaled&&!allow)throw Error('Pending exact command');journaled++;},received:()=>{received++;}},router)({} as any);
  await assert.rejects(t.request({method:'interlude_sendTransaction',params:['0x0102']}),/Socket response lost/);
  assert.equal(ws,1);assert.equal(http,0,'no transport retry on an uncertain write');assert.equal(received,0);
  await assert.rejects(t.request({method:'interlude_sendTransaction',params:['0x0304']}),/Pending exact command/);
  assert.equal(http,0);allow=true;
  assert.equal(await t.request({method:'interlude_sendTransaction',params:['0x0102']}),'http receipt');
  assert.equal(http,1);now=2001;
  assert.equal(await t.request({method:'interlude_sendTransaction',params:['0x0304']}),'socket receipt');
  assert.deepEqual(made,[0,1],'socket rest ends with a fresh generation');assert.equal(received,2);
 }finally{globalThis.fetch=original;}
});

test('an explicit RPC rejection does not start socket failover',async()=>{
 let lost=0,calls=0;
 const router={client:()=>({via:'ws' as const,client:{request:async()=>{calls++;throw Object.assign(Error('bad method'),{code:-32601});}} as any}),lost:()=>{lost++;},delivered:()=>{}};
 const t=engineTransport('https://send-rejected.invalid',{beforeSend:async()=>{},received:()=>{}},router)({} as any);
 await assert.rejects(t.request({method:'interlude_sendTransaction',params:['0x01']}));
 assert.equal(calls,1);assert.equal(lost,0);
});

test("HTTP 429 pauses all RPC methods and never queues or replays writes",async()=>{
 let now=0,calls=0;const gate=engineRequestGate(()=>now);
 const limited={status:429,headers:new Headers({"retry-after":"10"})};
 await assert.rejects(gate(async()=>{calls++;throw limited;}));
 now=2500;
 await assert.rejects(gate(async()=>{calls++;return "write";}),e=>engineReadRetryMs(e)===7500);
 await assert.rejects(gate(async()=>{calls++;return "read";}));
 assert.equal(calls,1);
 now=10000;assert.equal(await gate(async()=>{calls++;return "fresh read";}),"fresh read");
 assert.equal(calls,2,"the rejected write was not sent after cooldown");
});

test("unrelated RPC failures are not retried or mistaken for throttling",async()=>{
 const gate=engineRequestGate();let calls=0;
 await assert.rejects(gate(async()=>{calls++;throw new Error("connection lost");}));
 assert.equal(await gate(async()=>{calls++;return 7;}),7);assert.equal(calls,2);
});

test("a node publication halt blocks new writes but permits recovery reads",async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));return new Response(JSON.stringify({jsonrpc:"2.0",id:body.id,...(body.method==="eth_call"?{result:"0x1"}:{error:{code:-32000,message:"this session is over: commit relay failed: 401 Unauthorized"}})}),{headers:{"content-type":"application/json"}});};
 try{
  const t=engineTransport("https://node.invalid")({} as any);
  await assert.rejects(t.request({method:"interlude_sendTransaction",params:["0x00"]}),(e:any)=>e.code==="ENGINE_PUBLICATION_UNAVAILABLE");
  await assert.rejects(t.request({method:"interlude_sendTransaction",params:["0x00"]}),(e:any)=>e.status===503);
  assert.equal(calls,1);assert.equal(await t.request({method:"eth_call",params:[]}),"0x1");assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});

test('Retry-After survives the real viem HTTP transport rather than becoming ten seconds',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('Busy',{status:429,headers:{'retry-after':'1'}});};
 try{
  const url='https://retry-header.invalid',t=engineTransport(url)({} as any);
  await assert.rejects(t.request({method:'eth_call',params:[]}),e=>engineReadRetryMs(e)===1000);
  assert(engineCooldownMs(url)>0 && engineCooldownMs(url)<=1000);
  await assert.rejects(t.request({method:'interlude_sendTransaction',params:['0x00']}));
  assert.equal(calls,1,'the cooldown never sends a second request');
 }finally{globalThis.fetch=original;}
});

test('observer throttling also pauses existing and newly created player clients before journaling or sending',async()=>{
 const original=globalThis.fetch;let calls=0,journaled=0;
 globalThis.fetch=async()=>{calls++;return new Response('Busy',{status:429,headers:{'retry-after':'5'}});};
 try{
  const url='https://shared-arena-budget.invalid';
  const observer=engineTransport(url)({} as any);
  const existing=engineTransport(url,{beforeSend:async()=>{journaled++;},received:()=>{}})({} as any);
  await assert.rejects(observer.request({method:'eth_call',params:[]}));
  const recreated=engineTransport(url,{beforeSend:async()=>{journaled++;},received:()=>{}})({} as any);
  for(const t of [existing,recreated])await assert.rejects(t.request({method:'interlude_sendTransaction',params:['0x00']}),(e:any)=>e.code==='ENGINE_COOLDOWN');
  assert.equal(calls,1);assert.equal(journaled,0);assert(engineCooldownMs(url)>0);
 }finally{globalThis.fetch=original;}
});

test('a publication failure fences every player client while other clients still observe recovery',async()=>{
 const original=globalThis.fetch;let calls=0,journaled=0;
 globalThis.fetch=async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,...(body.method==='eth_call'?{result:'0x1'}:{error:{code:-32000,message:'this session is over: commit relay failed: 401 Unauthorized'}})}),{headers:{'content-type':'application/json'}});};
 try{
  const url='https://shared-publication.invalid',first=engineTransport(url)({} as any),second=engineTransport(url,{beforeSend:async()=>{journaled++;},received:()=>{}})({} as any);
  await assert.rejects(first.request({method:'interlude_sendTransaction',params:['0x00']}));
  await assert.rejects(second.request({method:'interlude_sendTransaction',params:['0x00']}),(e:any)=>e.code==='ENGINE_PUBLICATION_UNAVAILABLE');
  assert.equal(await second.request({method:'eth_call',params:[]}), '0x1');
  assert.equal(calls,2);assert.equal(journaled,0);
 }finally{globalThis.fetch=original;}
});

test('fresh identified recovery ends only the publication gate and never resends a command by itself',async()=>{
 const original=globalThis.fetch,app='0x0000000000000000000000000000000000000001',url='https://fresh-recovery.invalid';
 const healthy={app,chainId:4242,epoch:2,ok:true,halted:null,committedBatches:8};
 let refuse=true,calls=0,journaled=0;
 globalThis.fetch=async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,
  ...(refuse?{error:{code:-32000,message:'commit relay failed: 401 Unauthorized'}}:{result:'0x1'})}),{headers:{'content-type':'application/json'}});};
 try{
  const t=engineTransport(url,{beforeSend:async()=>{journaled++;},received:()=>{}})({} as any);
  const send=()=>t.request({method:'interlude_sendTransaction',params:['0x00']});
  await assert.rejects(send());refuse=false;
  for(const value of [{...healthy,app:'different'},{...healthy,epoch:3},{...healthy,chainId:10143},{...healthy,halted:{}}]){
   await assert.rejects(observeEnginePublication(url,app,2n,async()=>value));await assert.rejects(send());
  }
  assert.equal((await observeEnginePublication(url,app,2n,async()=>({...healthy,ok:false}))).healthy,false);
  await assert.rejects(send());assert.equal(calls,1);assert.equal(journaled,1);
  await observeEnginePublication(url,app,2n,async()=>healthy);
  assert.equal(calls,1,'health recovery never replays saved bytes');
  assert.equal(await send(),'0x1');assert.equal(calls,2);assert.equal(journaled,2);
  // A real HTTP cooldown remains effective, including against health probes.
  globalThis.fetch=async()=>new Response('Busy',{status:429,headers:{'retry-after':'5'}});
  await assert.rejects(t.request({method:'eth_call',params:[]}));let healthCalls=0;
  await assert.rejects(observeEnginePublication(url,app,2n,async()=>{healthCalls++;return healthy;}));
  assert.equal(healthCalls,0);assert(engineCooldownMs(url)>0);
 }finally{globalThis.fetch=original;}
});

test('a healthy response started before a newer publication failure cannot clear that failure',async()=>{
 const original=globalThis.fetch,app='0x0000000000000000000000000000000000000001',url='https://recovery-race.invalid';
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,
  error:{code:-32000,message:'commit relay failed: 401 Unauthorized'}}),{headers:{'content-type':'application/json'}});};
 try{
  const t=engineTransport(url)({} as any);
  await assert.rejects(t.request({method:'interlude_sendTransaction',params:['0x00']}));
  let resolve!:(v:unknown)=>void;
  const observation=observeEnginePublication(url,app,2n,()=>new Promise(r=>resolve=r));
  // A recovery RPC can independently report a later publication failure.
  await assert.rejects(t.request({method:'eth_call',params:[]}));
  resolve({app,chainId:4242,epoch:2,ok:true,halted:null,committedBatches:8});await observation;
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must stay local');};
  await assert.rejects(t.request({method:'interlude_sendTransaction',params:['0x00']}));assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
