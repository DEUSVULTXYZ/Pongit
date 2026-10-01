import {decodeFunctionResult, encodeFunctionData, multicall3Abi, toHex, zeroHash, type Address, type Hex, type PublicClient} from "viem";
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
export async function readHubDelegation(base:Pick<PublicClient,"request">,hub:Address,app:Address,blockNumber?:bigint|{blockHash:Hex;requireCanonical:true}){
  const data=encodeFunctionData({abi:roomsLifecycleHubAbi,functionName:"delegationOf",args:[app,zeroHash]});
  const result=await base.request({method:"eth_call",params:[{to:hub,data},blockNumber===undefined?"latest":typeof blockNumber==='bigint'?toHex(blockNumber):blockNumber]});
  return decodeHubDelegation(result);
}

/** One block-pinned request for a pool's delegations. Decode raw return bytes
 * separately so both deployed hub layouts keep their exact field offsets. A
 * missing or malformed entry is never interpreted as a free or healthy arena. */
export async function readHubDelegations(base:Pick<PublicClient,"request">,hub:Address,apps:readonly Address[],blockNumber:bigint){
  if(!apps.length||apps.length>16)throw Error('Delegation batch bounds');
  const data=encodeFunctionData({abi:multicall3Abi,functionName:'aggregate3',args:[apps.map(app=>({
    target:hub,allowFailure:true,callData:encodeFunctionData({abi:roomsLifecycleHubAbi,functionName:'delegationOf',args:[app,zeroHash]}),
  }))]});
  const raw=await base.request({method:'eth_call',params:[{to:'0xcA11bde05977b3631167028862bE2a173976CA11',data},toHex(blockNumber)]});
  const results=decodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',data:raw});
  if(results.length!==apps.length)throw Error('Incomplete delegation batch');
  return results.map((r,i)=>{if(!r.success)throw Error(`Delegation observation failed for ${apps[i]}`);return decodeHubDelegation(r.returnData);});
}
