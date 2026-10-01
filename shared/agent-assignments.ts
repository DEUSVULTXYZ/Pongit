import {decodeFunctionResult,encodeFunctionData,multicall3Abi,type Address,type PublicClient} from 'viem';
import {reusableAgentPoolAbi} from './abi-ReusableAgentPool';
import {BackgroundObservation} from './background-observation';

/** One bounded canonical batch serves every arena. Assignment observation is
 * more frequent than idle physics, so admission does not inherit two polling
 * intervals. It never authorizes a command or substitutes for its hub fence. */
export function agentAssignments(base:PublicClient,pool:Address,laneCount:number,now=Date.now){
 if(laneCount!==2&&laneCount!==5)throw Error('Unsupported agent lane count');
 return new BackgroundObservation(async()=>{
  const block=await base.getBlock({includeTransactions:false});
  const data=encodeFunctionData({abi:multicall3Abi,functionName:'aggregate3',args:[Array.from({length:laneCount},(_,lane)=>({
   target:pool,allowFailure:false,callData:encodeFunctionData({abi:reusableAgentPoolAbi,functionName:'laneRecord',args:[lane]}),
  }))]});
  const raw=await base.request({method:'eth_call',params:[{to:'0xcA11bde05977b3631167028862bE2a173976CA11',data},
   {blockHash:block.hash!,requireCanonical:true}]} as any);
  const results=decodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',data:raw as `0x${string}`});
  if(results.length!==laneCount||results.some(r=>!r.success))throw Error('Incomplete arena assignments');
  const lanes=results.map(r=>decodeFunctionResult({abi:reusableAgentPoolAbi,functionName:'laneRecord',data:r.returnData}));
  return{block,lanes};
 // Keep the original five-second planning bound. A slow refresh must not stop
 // active physics after just 1.5 seconds; independent command fences still
 // enforce the stricter lifecycle validity before each write.
 },500,5000,now);
}
