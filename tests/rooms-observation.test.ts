import {test} from "node:test";
import assert from "node:assert/strict";
import {roomSnapshotPollMs} from "../shared/rooms-observation";

test("invitations use a quiet observer and final states stop instead of consuming the gameplay quota",()=>{
  assert.equal(roomSnapshotPollMs("offered",0,false),2000);
  assert.equal(roomSnapshotPollMs("offered",1,false),2000);
  assert.equal(roomSnapshotPollMs("cancelled",0,false),null);
  assert.equal(roomSnapshotPollMs("complete",3,false),null);
  assert.equal(roomSnapshotPollMs("offered",4,false),null);
});
test("missing or unfinished engine state remains observable despite a lobby cancellation",()=>{
  assert.equal(roomSnapshotPollMs("cancelled",undefined,false),2000);
  assert.equal(roomSnapshotPollMs("cancelled",1,false),2000);
  assert.equal(roomSnapshotPollMs("cancelled",2,false),250);
  assert.equal(roomSnapshotPollMs("active",2,false),250);
  assert.equal(roomSnapshotPollMs("active",2,true),2000);
});
