import {parseAbi,type Address,type PublicClient} from 'viem';
const abi=parseAbi(['function launchAt(uint256 id) view returns (uint64)']);
/** A confirmed engine deadline, never a new browser-created countdown. */
export async function readArenaLaunch(node:PublicClient,app:Address,id:bigint){
 const block=await node.getBlock();
 const launch=await node.readContract({address:app,abi,functionName:'launchAt',args:[id],blockNumber:block.number});
 return launch>0n?{deadline:Number(launch)*1000,clock:Number(block.timestamp)*1000,observedAt:performance.now()}:undefined;
}
