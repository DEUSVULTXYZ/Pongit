import test from "node:test";
import assert from "node:assert/strict";
import {api,waitJob} from "../web/lib/api";
test("a coalesced input is a terminal receipt, while a failed job rejects immediately",async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify({id:"replaced",status:"superseded",error:"Replaced by a newer direction before signing"}));
  assert.equal((await waitJob("replaced")).status,"superseded");
  globalThis.fetch=async()=>new Response(JSON.stringify({id:"failed",status:"failed",error:"Session revoked"}));
  await assert.rejects(waitJob("failed"),/Session revoked/);
  await assert.rejects(api("/inputs",{}),/Session revoked/);
 }finally{globalThis.fetch=original;}
});
