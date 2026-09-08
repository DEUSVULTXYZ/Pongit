import {decodeFunctionResult, encodeFunctionData, zeroHash, type Address, type Hex, type PublicClient} from "viem";
import {roomsLifecycleHubAbi} from "./abi-rooms-lifecycle";
import {legacyRoomsLifecycleHubAbi} from "./abi-rooms-lifecycle-legacy";

/** The new hub inserts resolveThreshold into its internal tuple. Never decode an
 * older hub with that shifted ABI. sessionOf remains the stable gameplay surface. */
export function decodeHubDelegation(data:Hex){
  const words=(data.length-2)/64;
  if(words===29)return decodeFunctionResult({abi:roomsLifecycleHubAbi,functionName:"delegationOf",data});
  if(words===28)return decodeFunctionResult({abi:legacyRoomsLifecycleHubAbi,functionName:"delegationOf",data});
  throw new Error("Unsupported delegation response. Do not proceed with lifecycle transactions.");
}
export async function readHubDelegation(base:Pick<PublicClient,"request">,hub:Address,app:Address){
  const data=encodeFunctionData({abi:roomsLifecycleHubAbi,functionName:"delegationOf",args:[app,zeroHash]});
  const result=await base.request({method:"eth_call",params:[{to:hub,data},"latest"]});
  return decodeHubDelegation(result);
}
