import {encodeFunctionData,multicall3Abi,zeroHash,type Address,type PublicClient} from 'viem';
import {roomsLifecycleHubAbi} from './abi-rooms-lifecycle';
import {decodeHubDelegation} from './rooms-hub';

type Delegation=ReturnType<typeof decodeHubDelegation>;
export type HubObservation={block:{number:bigint;hash:string;timestamp:bigint};delegation:Delegation;observedAt:number};

/** All arenas share one canonical header and one raw multicall. Decode each hub
 * version separately and isolate a failed subcall. A slow/failed refresh never
 * extends the 3-second command fence from the START of its observation. */
export function hubObservations(base:PublicClient,hub:Address,apps:readonly Address[],now=Date.now){
 const names=apps.map(a=>a.toLowerCase());
 let values=new Map<string,HubObservation|Error>(),at=-Infinity,next=0,task:Promise<void>|undefined;
 async function refresh(){
  const started=now();next=started+1500;
  const block=await base.getBlock({includeTransactions:false});
  const results=await base.readContract({address:'0xcA11bde05977b3631167028862bE2a173976CA11',abi:multicall3Abi,functionName:'aggregate3',
   args:[apps.map(app=>({target:hub,allowFailure:true,callData:encodeFunctionData({abi:roomsLifecycleHubAbi,functionName:'delegationOf',args:[app,zeroHash]})}))],blockNumber:block.number});
  if((await base.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Hub observation changed canonical block');
  const updated=new Map<string,HubObservation|Error>();
  results.forEach((r,i)=>{try{
   if(!r.success)throw Error('Arena hub observation failed');
   updated.set(names[i],{block:{number:block.number,hash:block.hash!,timestamp:block.timestamp},delegation:decodeHubDelegation(r.returnData),observedAt:started});
  }catch{updated.set(names[i],Error('Arena hub observation failed'));}});
  values=updated;at=started;
 }
 function load(){return task??=refresh().finally(()=>{task=undefined;});}
 return {async read(app:Address,forCommand=false):Promise<HubObservation>{
  const key=app.toLowerCase();if(!names.includes(key))throw Error('Arena is outside the observed pool');
  // A command fence also verifies the hosted session. Do not give that check
  // an almost expired observation while its replacement is already in flight.
  // Concurrent fences still share the same refresh; the validity stays 3 s.
  if(now()-at>=(forCommand?1500:3000))await load();else if(now()>=next)void load().catch(()=>{});
  if(now()-at>=3000)throw Error('Hub observation is stale');
  const value=values.get(key);if(!value||value instanceof Error)throw value??Error('Arena hub observation absent');
  return value;
 }};
}
