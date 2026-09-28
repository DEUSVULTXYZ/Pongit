import {parseAbi,type Address,type PublicClient} from 'viem';
const abi=parseAbi(['function launchAt(uint256 id) view returns (uint64)','function launchClock(uint256 id) view returns (uint256 deadline,uint256 clock)']);
/** Zero is a valid engine clock. This only draws digits; it never enables play. */
export function arenaLaunchRemaining(deadline:number|undefined,clock:number|undefined,observedAt:number|undefined,now:number){
 if(deadline===undefined||clock===undefined||observedAt===undefined
  ||![deadline,clock,observedAt,now].every(Number.isFinite))return 0;
 return Math.max(0,deadline-clock-Math.max(0,now-observedAt));
}
/** A confirmed engine deadline, never a new browser-created countdown. */
export async function readArenaLaunch(node:PublicClient,app:Address,id:bigint,countdownClock?:'engine-ticks-v1'){
 if(countdownClock){
  const before=performance.now();
  const [deadline,clock]=await node.readContract({address:app,abi,functionName:'launchClock',args:[id]});
  return deadline>0n?{deadline:Number(deadline),clock:Number(clock),observedAt:(before+performance.now())/2}:undefined;
 }
 const block=await node.getBlock();
 const launch=await node.readContract({address:app,abi,functionName:'launchAt',args:[id],blockNumber:block.number});
 return launch>0n?{deadline:Number(launch)*1000,clock:Number(block.timestamp)*1000,observedAt:performance.now()}:undefined;
}
