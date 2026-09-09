import {test} from "node:test";
import assert from "node:assert/strict";
import {SessionRejected,SessionUnavailable,serviceError} from "../shared/service-error";
import {engineReadRetryMs} from "../shared/engine-read";
test("a failed permission lookup is not a revoked session",()=>{
 assert.equal(serviceError(new SessionUnavailable(),"test").status,503);
 assert.equal(serviceError(new SessionRejected("Expired"),"test").status,401);
 assert.equal(serviceError({status:429,headers:{"retry-after":"10"}},"test").body.source,"interlude_rpc");
 assert.equal(serviceError({status:429,code:"ENGINE_COOLDOWN",headers:{"retry-after":"10"}},"test").body.source,"client_cooldown");
});

test("a halted publication service is neither an expired player session nor a 429",()=>{
 const result=serviceError({message:"Missing or invalid parameters.",cause:{details:'this session is over: batch 76 could not be settled (commit relay failed: 401 Unauthorized: missing or wrong bearer token)'}},"request-id");
 assert.equal(result.status,503);assert.equal(result.body.code,"ENGINE_PUBLICATION_UNAVAILABLE");
 assert.equal(result.body.source,"interlude_rpc");assert.equal(result.retryMs,30000);
 assert(!result.body.error.includes("bearer"));
});
test("Retry-After dates and long cooldowns are respected without shortening them",()=>{
 assert.equal(engineReadRetryMs({status:429,headers:{"retry-after":"120"}}),120000);
 const delay=engineReadRetryMs({status:429,headers:{"retry-after":new Date(Date.now()+90000).toUTCString()}});
 assert(delay>=89000&&delay<=90000);
});
