import type {Address,PublicClient} from 'viem';
import {reusableAgentPoolAbi} from './abi-ReusableAgentPool';
import {BackgroundObservation} from './background-observation';

/** One bounded canonical batch serves every arena. Assignment observation is
 * more frequent than idle physics, so admission does not inherit two polling
 * intervals. It never authorizes a command or substitutes for its hub fence. */
export function agentAssignments(base:PublicClient,pool:Address,laneCount:number,now=Date.now){
 if(laneCount!==2&&laneCount!==5)throw Error('Unsupported agent lane count');
 return new BackgroundObservation(async()=>{
  const block=await base.getBlock({includeTransactions:false});
  const lanes=await base.multicall({blockNumber:block.number,allowFailure:false,batchSize:0,
   contracts:Array.from({length:laneCount},(_,lane)=>({address:pool,abi:reusableAgentPoolAbi,functionName:'laneRecord',args:[lane]} as const))});
  if((await base.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Arena assignments changed during observation');
  return{block,lanes};
 },500,1500,now);
}
