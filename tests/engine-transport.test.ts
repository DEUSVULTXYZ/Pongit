import {test} from "node:test";
import assert from "node:assert/strict";
import {engineRequestGate,engineTransport} from "../shared/engine-transport";
import {engineReadRetryMs} from "../shared/engine-read";

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
