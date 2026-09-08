import {test} from "node:test";
import assert from "node:assert/strict";
import {encodeErrorResult, encodeFunctionResult, zeroAddress, zeroHash} from "viem";
import {decodeEngineSnapshot, EngineSnapshotError} from "../shared/engine-snapshot";
import {roomsChaosAbi} from "../shared/abi-PongRoomsTestnet";
import {initial} from "../shared/physics-v2";

test("a raw 36-byte Solidity panic is diagnosed as a state read failure",()=>{
 const panic=encodeErrorResult({abi:[{type:"error",name:"Panic",inputs:[{type:"uint256",name:"code"}]}],errorName:"Panic",args:[0x11n]});
 assert.equal((panic.length-2)/2,36);
 assert.throws(()=>decodeEngineSnapshot(roomsChaosAbi,zeroAddress,123n,panic),e=>{
  assert(e instanceof EngineSnapshotError);assert.equal(e.returnData,panic);assert.equal(e.matchId,123n);
  assert.match(e.message,/Panic 17/);assert.doesNotMatch(e.message,/Position|Renew/);return true;
 });
});
test("clock errors, malformed responses and complete snapshots stay distinct",()=>{
 const behind=encodeErrorResult({abi:roomsChaosAbi,errorName:"StaleInput"});
 assert.throws(()=>decodeEngineSnapshot(roomsChaosAbi,zeroAddress,1n,behind),/StaleInput/);
 assert.throws(()=>decodeEngineSnapshot(roomsChaosAbi,zeroAddress,1n,"0x00"),/invalid snapshot, 1 bytes/);
 const expected=[1n,2n,2n,zeroAddress,zeroAddress,zeroAddress,zeroAddress,150n,500000n,0n,0n,1000n,initial(zeroHash)] as const;
 const data=encodeFunctionResult({abi:roomsChaosAbi,functionName:"getSnapshot",result:expected});
 assert.deepEqual(decodeEngineSnapshot(roomsChaosAbi,zeroAddress,1n,data),expected);
});
