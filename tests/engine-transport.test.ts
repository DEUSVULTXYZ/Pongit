import {test} from "node:test";
import assert from "node:assert/strict";
import {engineRequestGate,engineTransport,engineCooldownMs,observeEnginePublication} from "../shared/engine-transport";
import {engineReadRetryMs} from "../shared/engine-read";
import {createSendRouter} from '@interludelayer-sdk/sdk';
import {WebSocketServer} from 'ws';
import {createServer} from 'node:http';
import {keccak256} from 'viem';

for(const delayedExecution of [false,true])test(`slow HTTP ${delayedExecution?'delivery':'response'} recovers the exact journaled command before presence expires`,async()=>{
 const raw='0x0102',hash=keccak256(raw);
 const receipt={transactionHash:hash,status:'0x1',blockNumber:'0x42',logs:[]};
 let writes=0,lookups=0,effects=0,journaled=0,received=0,published=false;
 const execute=()=>{if(!published){published=true;effects++;}return receipt;};
 const timers=new Set<ReturnType<typeof setTimeout>>();
 const server=createServer((request,response)=>{
  let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>{
   const message=JSON.parse(body),reply=(result:unknown)=>{response.setHeader('content-type','application/json');response.end(JSON.stringify({jsonrpc:'2.0',id:message.id,result}));};
   if(message.method==='eth_getTransactionReceipt'){lookups++;assert.equal(message.params[0],hash);reply(published?receipt:null);return;}
   assert.equal(message.method,'interlude_sendTransaction');assert.equal(message.params[0],raw);writes++;
   if(writes===1){
    if(!delayedExecution)execute();
    const timer=setTimeout(()=>{timers.delete(timer);reply(execute());},650);timers.add(timer);
   }else reply(execute());
  });
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();assert(address&&typeof address!=='string');
  const router={client:()=>({via:'http' as const,client:{} as any}),lost:()=>{},delivered:()=>{}};
  const t=engineTransport(`http://127.0.0.1:${address.port}`,{
   beforeSend:async value=>{assert.equal(value,raw);journaled++;},received:()=>{received++;},
  },router)({} as any);
  const at=performance.now();
  assert.deepEqual(await t.request({method:'interlude_sendTransaction',params:[raw]}),receipt);
  assert(performance.now()-at<400,'A single HTTP stall must not block the 500ms presence credit');
  await new Promise(resolve=>setTimeout(resolve,700));
  assert.equal(effects,1);assert.equal(received,1);assert.equal(lookups,1);
  assert.equal(writes,delayedExecution?2:1);assert.equal(journaled,writes);
 }finally{
  for(const timer of timers)clearTimeout(timer);server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});

test('a stalled socket handshake does not delay the first HTTP command or send it later',async()=>{
 let http=0,journaled=0,received=0,close=()=>{};
 const sockets=new Set<any>();
 const server=createServer((request,response)=>{
  let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>{
   http++;response.setHeader('content-type','application/json');
   response.end(JSON.stringify({jsonrpc:'2.0',id:JSON.parse(body).id,result:'confirmed'}));
  });
 });
 server.on('upgrade',(_request,socket)=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();assert(address&&typeof address!=='string');
  const t=engineTransport(`http://127.0.0.1:${address.port}`,{beforeSend:async()=>{journaled++;},received:()=>{received++;}},true)({} as any);
  close=()=>t.value?.closeSend();
  const at=performance.now();
  assert.equal(await t.request({method:'interlude_sendTransaction',params:['0x0102']}),'confirmed');
  assert(performance.now()-at<500,'First write must not await the optional socket');
  assert.equal(http,1);assert.equal(journaled,1);assert.equal(received,1);
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(http,1,'No background replay');
 }finally{
  close();for(const socket of sockets)socket.destroy();server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});

test('a stalled HTTP body releases reads and uncertain writes without retry or acknowledgement',async()=>{
 let calls=0,journaled=0,received=0;
 const server=createServer((_request,response)=>{
  calls++;response.writeHead(200,{'content-type':'application/json'});
  response.write('{"jsonrpc":"2.0","result":');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const rescue=setTimeout(()=>server.closeAllConnections(),7500);
 try{
  const address=server.address();assert(address&&typeof address!=='string');
  const t=engineTransport(`http://127.0.0.1:${address.port}`,{beforeSend:async()=>{journaled++;},received:()=>{received++;}})({} as any);
  const start=performance.now();
  await Promise.all([
   assert.rejects(t.request({method:'eth_call',params:[]})),
   assert.rejects(t.request({method:'interlude_sendTransaction',params:['0x0102']})),
  ]);
  assert(performance.now()-start<5500,'Receiving headers must not cancel the response-body deadline');
  assert.equal(calls,2);assert.equal(journaled,1);assert.equal(received,0,'Unknown transaction remains in its journal');
 }finally{
  clearTimeout(rescue);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});

test('an unanswered actual send socket releases the lane within the recovery budget without retrying',async()=>{
 const server=new WebSocketServer({host:'127.0.0.1',port:0});
 await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 let calls=0,received=0,journaled=0,close=()=>{};
 const connected=new Promise<void>(resolve=>server.once('connection',()=>resolve()));
 server.on('connection',socket=>socket.on('message',()=>{calls++;}));
 try{
  const address=server.address();assert(address&&typeof address!=='string');
  const t=engineTransport(`http://127.0.0.1:${address.port}`,{beforeSend:async()=>{journaled++;},received:()=>{received++;}},true)({} as any);
  close=()=>t.value?.closeSend();
  await connected;await new Promise(resolve=>setTimeout(resolve,30));
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
