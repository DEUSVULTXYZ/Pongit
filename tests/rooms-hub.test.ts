import {test} from "node:test";
import assert from "node:assert/strict";
import {encodeFunctionResult, zeroAddress, zeroHash} from "viem";
import {decodeHubDelegation} from "../shared/rooms-hub";
import {roomsLifecycleHubAbi} from "../shared/abi-rooms-lifecycle";
import {legacyRoomsLifecycleHubAbi} from "../shared/abi-rooms-lifecycle-legacy";
test("both deployed hub tuples decode their epoch, base pin and challenge window at the right offsets",()=>{
 for(const abi of [legacyRoomsLifecycleHubAbi,roomsLifecycleHubAbi]){
  const fields=abi.find(x=>x.name==="delegationOf")!.outputs[0].components;
  const d:any=Object.fromEntries(fields.map(f=>[f.name,f.type==="address"?zeroAddress:f.type==="bytes32"?zeroHash:f.type==="uint8"||f.type==="uint16"||f.type==="uint32"?0:0n]));
  Object.assign(d,{status:1,baseBlock:60800000n,epoch:3n,challengeWindow:3600n,stakeUnlockAt:123456n,expiresAt:2000000000n,resolveThreshold:2});
  const data=encodeFunctionResult({abi,functionName:"delegationOf",result:d});
  const v=decodeHubDelegation(data);
  for(const field of ['baseBlock','epoch','challengeWindow','stakeUnlockAt','expiresAt'] as const)assert.equal(v[field],d[field]);
 }
 assert.throws(()=>decodeHubDelegation("0x"),/Unsupported delegation/);
});
