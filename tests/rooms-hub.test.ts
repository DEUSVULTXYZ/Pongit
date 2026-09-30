import {test} from "node:test";
import assert from "node:assert/strict";
import {decodeFunctionData,encodeFunctionResult,multicall3Abi, zeroAddress, zeroHash} from "viem";
import {decodeHubDelegation,readHubDelegations} from "../shared/rooms-hub";
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

test('pool delegation reads share one canonical block and reject partial or malformed evidence',async()=>{
 const apps=[zeroAddress,'0x1111111111111111111111111111111111111111'] as const;
 let failed=false,short=false,malformed=false,calls=0;
 const base:any={request:async(request:any)=>{
  calls++;assert.equal(request.method,'eth_call');assert.equal(request.params[1],'0x7b');
  const batch=decodeFunctionData({abi:multicall3Abi,data:request.params[0].data});
  assert.equal(batch.functionName,'aggregate3');if(batch.functionName!=='aggregate3')throw Error();
  assert.deepEqual(batch.args[0].map(x=>decodeFunctionData({abi:roomsLifecycleHubAbi,data:x.callData}).args?.[0]),apps);
  const results=[legacyRoomsLifecycleHubAbi,roomsLifecycleHubAbi].map((abi,i)=>{
   const fields=abi[0].outputs[0].components;
   const d:any=Object.fromEntries(fields.map(f=>[f.name,f.type==='address'?zeroAddress:f.type==='bytes32'?zeroHash:/^uint(8|16|32)$/.test(f.type)?0:0n]));
   Object.assign(d,{status:1,epoch:BigInt(i+2),baseBlock:90n,expiresAt:9999n});
   return{success:!(failed&&i===1),returnData:malformed&&i===1?'0x' as const:encodeFunctionResult({abi,functionName:'delegationOf',result:d})};
  });
  return encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result:short?results.slice(0,1):results});
 }};
 assert.deepEqual((await readHubDelegations(base,zeroAddress,apps,123n)).map(d=>d.epoch),[2n,3n]);assert.equal(calls,1);
 failed=true;await assert.rejects(readHubDelegations(base,zeroAddress,apps,123n),/observation failed/);
 failed=false;short=true;await assert.rejects(readHubDelegations(base,zeroAddress,apps,123n),/Incomplete/);
 short=false;malformed=true;await assert.rejects(readHubDelegations(base,zeroAddress,apps,123n),/Unsupported delegation/);
});
