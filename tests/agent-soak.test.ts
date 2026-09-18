import test from "node:test";
import assert from "node:assert/strict";
import {afterClock,lifecycleView,soakSources,sourceClosure} from "../scripts/agent-soak-rules";
const ends=Date.parse("2026-09-19T12:00:00Z"),graceMs=7200000,settleMs=300000,minute=60000;
// A record as scripts/agent-lifecycle.ts writes it: the current stage and every change.
const record=(...changes:[string,number][])=>({renewalQualified:true,stage:changes.at(-1)![0],events:changes.map(([stage,at])=>({at:new Date(at).toISOString(),stage}))});
const decide=(now:number,changes:[string,number][]|undefined,service?:string)=>afterClock({now,ends,graceMs,settleMs,lifecycle:changes&&lifecycleView(record(...changes)),service});

test("the clock samples whatever the lifecycle says",()=>{
  assert.equal(decide(ends-1,undefined,"error").sample,true);
  assert.equal(decide(ends-1,[["intervention-required",ends-minute]],"error").sample,true);
});
test("a renewal keeps the soak sampling through the service's own restart",()=>{
  // The service fails, reads 'starting' or drains while the lifecycle renews: none of it ends grace.
  for(const [stage,service] of [["draining","draining-for-renewal"],["waiting-publication","draining-for-renewal"],["challenge-window","renewing"],["released","renewing"],["reopened","synchronizing"],["provisioning","error"],["restart-required","error"],["restart-required","starting"]])
    assert.equal(decide(ends+55*minute,[["online",ends-3*3600000],[stage,ends-10*minute]],service).sample,true,`${stage}/${service}`);
});
test("a renewal stuck past the bound ends the soak",()=>{
  const decision=decide(ends+graceMs,[["challenge-window",ends-10*minute]],"renewing");
  assert.equal(decision.sample,false);assert.match(decision.reason,/after the grace bound/);
});
test("no grace outside a renewal, whatever the service reports",()=>{
  // A publication backlog: the service says 'waiting-publication', the lifecycle has been online for hours.
  for(const service of ["waiting-publication","draining-for-renewal","error","online"])
    assert.equal(decide(ends,[["restart-required",ends-5*3600000],["online",ends-4*3600000]],service).sample,false,service);
  assert.equal(decide(ends,[["online",ends-minute],["intervention-required",ends-30000]],"draining-for-renewal").sample,false);
  const unreadable=decide(ends,undefined,"renewing");assert.equal(unreadable.sample,false);assert.match(unreadable.reason,/unreadable/);
});
test("a renewal the lifecycle has just reopened waits briefly for the service",()=>{
  const reopened:[string,number][]=[["restart-required",ends+50*minute],["online",ends+70*minute]];
  assert.equal(decide(ends+71*minute,reopened,"draining-for-renewal").sample,true);
  assert.equal(decide(ends+71*minute,reopened,"online").sample,false,"the service is back: the run ends healthy");
  assert.equal(decide(ends+76*minute,reopened,"draining-for-renewal").sample,false,"the settle is bounded");
  assert.equal(decide(ends+graceMs,reopened,"draining-for-renewal").sample,false,"and never outlasts the grace");
});
test("the record's view is its latest change",()=>{
  assert.deepEqual(lifecycleView(record(["restart-required",ends],["online",ends+minute])),{stage:"online",at:ends+minute,after:"restart-required"});
  assert.equal(lifecycleView({events:[]}),undefined);
  // A stage without its event says nothing about when it changed or from what.
  const view=lifecycleView({stage:"online",events:[{at:new Date(ends).toISOString(),stage:"restart-required"}]})!;
  assert.equal(view.after,undefined);
  assert.equal(afterClock({now:ends+minute,ends,graceMs,settleMs,lifecycle:view,service:"draining-for-renewal"}).sample,false);
});
test("the source closure reaches what the roles run during a renewal",async()=>{
  // From the keeper alone: the scripts it starts by name, and what those import in turn.
  const keeper=await sourceClosure(["scripts/agent-private-keeper.mjs"]);
  for(const path of ["scripts/agent-operator-step.ts","scripts/agent-lifecycle.ts","scripts/agent-archive-step.ts","scripts/agent-test-environment.mjs","scripts/agent-soak.ts","scripts/agent-soak-rules.ts","scripts/independent-chain-tools.ts","relayer/src/rooms-hosted-renewal.ts","relayer/src/agents/schema.ts","shared/rooms-hub.ts"])
    assert.ok(keeper.paths.includes(path),path);
  const all=await soakSources();
  assert.deepEqual(all.unresolved,[]);
  for(const path of ["relayer/src/rooms-hosted-renewal.ts","scripts/agent-test-environment.mjs","relayer/src/agents/server.ts","scripts/agent-house-worker.ts","web/lib/rooms-command-journal.ts","agent-sdk/strategy.ts","contracts/src/agents/IPongStrategy.sol"])
    assert.ok(all.paths.includes(path),path);
});
