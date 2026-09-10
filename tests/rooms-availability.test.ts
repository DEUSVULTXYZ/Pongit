import test from "node:test";
import assert from "node:assert/strict";
import {assertRoomsEngineAvailable,RoomsEngineUnavailable,roomsDrainBlocker} from "../shared/rooms-availability";

const app="0x1234",node={app,chainId:4242,epoch:1};
const delegation={status:1,expiresAt:2000n,epoch:1n};
test("expired engine delegation cannot be mistaken for a rejected player grant",()=>{
  assert.throws(()=>assertRoomsEngineAvailable(app,node,delegation,2000),e=>{
    assert(e instanceof RoomsEngineUnavailable);
    assert.equal(e.code,"ENGINE_DELEGATION_EXPIRED");
    assert.equal(e.status,503);assert.equal(e.retryMs,30000);
    return true;
  });
  assert.throws(()=>assertRoomsEngineAvailable(app,node,delegation,1960),{code:"ENGINE_DELEGATION_ENDING"});
  assert.doesNotThrow(()=>assertRoomsEngineAvailable(app,node,delegation,1959));
});
test("reopening requires matching app, chain, active delegation and current epoch",()=>{
  assert.throws(()=>assertRoomsEngineAvailable(app,{...node,app:"0x9999"},delegation,1000),{code:"ENGINE_DEPLOYMENT_MISMATCH"});
  assert.throws(()=>assertRoomsEngineAvailable(app,{...node,chainId:10143},delegation,1000),{code:"ENGINE_DEPLOYMENT_MISMATCH"});
  for(const status of [0,2,3])assert.throws(()=>assertRoomsEngineAvailable(app,node,{...delegation,status},1000),{code:"ENGINE_DELEGATION_INACTIVE"});
  assert.throws(()=>assertRoomsEngineAvailable(app,node,{...delegation,epoch:2n},1000),{code:"ENGINE_EPOCH_MISMATCH"});
  assert.doesNotThrow(()=>assertRoomsEngineAvailable(app,{...node,epoch:2},{...delegation,epoch:2n},1000));
});
test("expiry never silently drains unfinished or unpublished matches",()=>{
  assert.match(roomsDrainBlocker(true,1n,15,true),/operator publication recovery/);
  assert.match(roomsDrainBlocker(true,0n,15,true),/operator publication recovery/);
  assert.match(roomsDrainBlocker(false,1n,0,true),/active matches/);
  assert.match(roomsDrainBlocker(false,0n,15,true),/publication/);
  assert.match(roomsDrainBlocker(true,0n,0,false),/epoch differs/);
  assert.equal(roomsDrainBlocker(true,0n,0,true),"");
});
