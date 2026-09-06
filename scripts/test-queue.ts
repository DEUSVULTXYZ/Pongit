import assert from "node:assert/strict";
import {generatePrivateKey,privateKeyToAccount} from "viem/accounts";
import {keccak256} from "viem";
import {queueMessage,cancelQueueMessage,json} from "../shared/protocol";
const base=process.env.E2E_API_URL||"http://localhost:4000";
async function api(path:string,body?:unknown,expected=200){const r=await fetch(base+path,{method:body?"POST":"GET",headers:{"content-type":"application/json"},body:body?json(body):undefined});const v=await r.json();assert.equal(r.status,expected,json(v));return v;}
const config=await api("/config");assert.equal(config.chainId,31337,"Disposable local fixtures only");
const a=privateKeyToAccount(generatePrivateKey()),b=privateKeyToAccount(generatePrivateKey());
let expires=Math.floor(Date.now()/1000)+240;
async function queue(who:typeof a){const deadline=expires++;const signature=await who.signMessage({message:queueMessage(who.address,deadline)});await api("/queue",{player:who.address,expires:deadline,signature});return keccak256(signature);}
async function cancellation(ticket:string,chainId=config.chainId,signer=a){const deadline=Math.floor(Date.now()/1000)+120;return {player:a.address,ticket,expires:deadline,signature:await signer.signMessage({message:cancelQueueMessage(a.address,ticket,deadline,chainId,config.game)})};}
const first=await queue(a);
await api("/queue/cancel",await cancellation(first,config.chainId,b),400);
await api("/queue/cancel",await cancellation(first,1),400);
assert.equal((await api("/queue/"+a.address)).waiting,true);
const old=await cancellation(first);
assert.equal((await api("/queue/cancel",old)).cancelled,true);
assert.equal((await api("/queue/"+a.address)).waiting,false);
const second=await queue(a);
await api("/queue/cancel",old);
assert.equal((await api("/queue/"+a.address)).waiting,true,"Old signed cancellation cannot remove new search");
await queue(b);
assert((await api("/queue/"+a.address)).id);
assert((await api("/queue/"+b.address)).id);
await api("/queue/cancel",await cancellation(second));
assert.equal((await api("/queue/"+a.address)).waiting,false);
assert.equal((await api("/queue/"+b.address)).waiting,false);
console.log("PASS: cancellation signatures, domain, idempotency, replay isolation and paired-room cancellation");
