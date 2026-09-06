import test from "node:test";
import assert from "node:assert/strict";
import { notebookKeyFromPrf, encryptNotebook, decryptNotebook } from "../web/lib/notebook";
import { emptyNotebook } from "../shared/social";

test("notebook recovers from the same PRF on another device, with independent nonces and no extractable key",async()=>{
  const output=crypto.getRandomValues(new Uint8Array(32)),copy=output.slice();
  const key=await notebookKeyFromPrf(output);
  assert(output.every(b=>b===0));assert.equal(key.extractable,false);
  const data=emptyNotebook();data.notes.push({id:"n",matchRef:"v2:1",atUs:"3000000",text:"private strategy"});
  const a=await encryptNotebook(key,"0xabc",data),b=await encryptNotebook(key,"0xabc",data);
  assert.notEqual(a.iv,b.iv);assert.notEqual(a.ciphertext,b.ciphertext);assert(!a.ciphertext.includes("strategy"));
  const secondDevice=await notebookKeyFromPrf(copy);
  assert.deepEqual(await decryptNotebook(secondDevice,"0xabc",a),data);
  await assert.rejects(()=>crypto.subtle.exportKey("raw",key));
  await assert.rejects(()=>decryptNotebook(secondDevice,"0xdef",a));
  const wrong=await notebookKeyFromPrf(crypto.getRandomValues(new Uint8Array(32)));
  await assert.rejects(()=>decryptNotebook(wrong,"0xabc",a));
  await assert.rejects(()=>decryptNotebook(key,"0xabc",{...a,ciphertext:(a.ciphertext[0]==="A"?"B":"A")+a.ciphertext.slice(1)}));
});
