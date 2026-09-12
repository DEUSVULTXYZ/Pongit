import test from "node:test";
import assert from "node:assert/strict";
import {trafficBudget} from "../relayer/src/traffic";
test("eight players can send release/reversal intents without using the financial request budget",()=>{
 const input=trafficBudget("POST","/inputs"),receipt=trafficBudget("GET",`/jobs/0x${"a".repeat(64)}`);
 assert(input.limit>=8*4*60);assert.notEqual(input.bucket,receipt.bucket);
 for(const [method,path] of [["POST","/relay"],["POST","/rpc"],["POST","/faucet"],["POST","/jobs/evil"],["GET","/inputs/invalid"],["POST","/challenges"]])assert.deepEqual(trafficBudget(method,path),{bucket:"general",limit:600});
});
test('arena health and sponsor receipts do not consume the financial action budget',()=>{
 assert(trafficBudget('GET','/independent/config').limit>=8*6);
 assert.equal(trafficBudget('GET',`/independent/operations/0x${'a'.repeat(64)}`).bucket,'receipt');
 assert.equal(trafficBudget('POST','/independent/transactions').bucket,'general');
});
