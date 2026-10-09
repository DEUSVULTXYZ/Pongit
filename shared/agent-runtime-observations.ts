import {decodeFunctionResult,encodeFunctionData,multicall3Abi,zeroHash,type Address,type Hex,type PublicClient} from 'viem';
import {reusableAgentPoolAbi} from './abi-ReusableAgentPool';
import {roomsLifecycleHubAbi} from './abi-rooms-lifecycle';
import {decodeHubDelegation} from './rooms-hub';
import type {HubObservation} from './hub-observation';

const lane=(data:Hex)=>decodeFunctionResult({abi:reusableAgentPoolAbi,functionName:'laneRecord',data});
type Snapshot={block:HubObservation['block'];lanes:ReturnType<typeof lane>[]|Error;hubs:Map<string,HubObservation|Error>;at:number};

/** Planning and lifecycle fences observe the same canonical batch. This removes
 * their duplicate header/call round trip, not any authorization check. Failed
 * subcalls remain scoped to their lane view or arena; validity starts at request
 * time and a slow/failed refresh never grants a new three-second window. */
export function agentRuntimeObservations(base:PublicClient,pool:Address,hub:Address,apps:readonly Address[],laneCount:number,now=Date.now){
 if(![2,5].includes(laneCount)||!apps.length||apps.length>16)throw Error('Unsupported agent observation dimensions');
 const names=apps.map(a=>a.toLowerCase());
 if(new Set(names).size!==names.length)throw Error('Duplicate observed arena');
 let value:Snapshot|undefined,pending:Promise<Snapshot>|undefined,next=0;
 const calls=[...Array.from({length:laneCount},(_,i)=>({target:pool,allowFailure:true,
  callData:encodeFunctionData({abi:reusableAgentPoolAbi,functionName:'laneRecord',args:[i]})})),
  ...apps.map(app=>({target:hub,allowFailure:true,
   callData:encodeFunctionData({abi:roomsLifecycleHubAbi,functionName:'delegationOf',args:[app,zeroHash]})}))];
 const data=encodeFunctionData({abi:multicall3Abi,functionName:'aggregate3',args:[calls]});
 function load():Promise<Snapshot>{
  if(pending)return pending;
  const at=now();next=at+500;
  pending=(async()=>{
   const block=await base.getBlock({includeTransactions:false});
   if(!block.hash)throw Error('Arena observation has no canonical block');
   const raw=await base.request({method:'eth_call',params:[{to:'0xcA11bde05977b3631167028862bE2a173976CA11',data},
    {blockHash:block.hash,requireCanonical:true}]} as any);
   const results=decodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',data:raw as Hex});
   if(results.length!==calls.length)throw Error('Incomplete arena observation');
   let lanes:Snapshot['lanes'];
   try{lanes=results.slice(0,laneCount).map(r=>{if(!r.success)throw Error();return lane(r.returnData);});}
   catch{lanes=Error('Incomplete arena assignments');}
   const hubs:Snapshot['hubs']=new Map();
   results.slice(laneCount).forEach((r,i)=>{
    try{
     if(!r.success)throw Error();
     hubs.set(names[i],{block:{number:block.number,hash:block.hash,timestamp:block.timestamp},
      delegation:decodeHubDelegation(r.returnData),observedAt:at});
    }catch{hubs.set(names[i],Error('Arena hub observation failed'));}
   });
   return value={block,lanes,hubs,at};
  })().finally(()=>{pending=undefined;});
  return pending;
 }
 const prefetch=()=>{if(now()>=next)void load().catch(()=>{});};
 return {
  assignments:{async read(){
   const current=!value||now()-value.at>=5000?await load():(prefetch(),value);
   if(current.lanes instanceof Error)throw current.lanes;
   return{block:current.block,lanes:current.lanes};
  }},
  hub:{async read(app:Address,_forCommand=false):Promise<HubObservation>{
   const key=app.toLowerCase();if(!names.includes(key))throw Error('Arena is outside the observed pool');
   // Refresh ahead of expiry without placing an already-authorized command
   // behind that refresh. The engine still checks the hosted session and this
   // ORIGINAL three-second deadline after its await, before signing. Returning
   // the same observation cannot renew the deadline. Contradictory completed
   // refreshes replace the old value immediately, including scoped failures.
   const current=!value||now()-value.at>=3000?await load():(prefetch(),value);
   if(now()-current.at>=3000)throw Error('Hub observation is stale');
   const observed=current.hubs.get(key);
   if(!observed||observed instanceof Error)throw observed??Error('Arena hub observation absent');
   return observed;
  }},
 };
}
