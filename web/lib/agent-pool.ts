import {type Address} from 'viem';
import {API} from './api';
import {measuredFetch} from '../../shared/rpc-metrics';
import {createPoolSponsor,type PoolSignedCall} from '../../shared/agent-pool-sponsor';
import type {AgentPoolManifest} from '../../shared/agent-pool';
import {browserBase} from './base-read';
import type {ChainOperation} from '../../shared/independent';

const base=browserBase;
export const poolBase=()=>base;
export async function poolApi<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 const timeout=AbortSignal.timeout(body===undefined?30000:12000);
 const response=await measuredFetch('pongit')(`${API}/agents/${path}`,{method:body===undefined?'GET':'POST',
  ...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)}),
  signal:signal?AbortSignal.any([signal,timeout]):timeout});
 const value=await response.json();
 if(!response.ok)throw Object.assign(Error(value.error||'Agent Arcade is synchronizing'),{...value,status:response.status,headers:response.headers});
 return value;
}
export function poolBrowserSponsor(m:AgentPoolManifest,player:Address){
 return createPoolSponsor(m,player,sessionStorage,(path,body)=>poolApi(path,body));
}
/** Poll one saved sponsored action. A timeout leaves its exact intent intact. */
export async function finishPoolSponsor(sponsor:ReturnType<typeof poolBrowserSponsor>,call?:PoolSignedCall,onProgress?:(operation:ChainOperation)=>void){
 let operation=call?await sponsor.send(call):await sponsor.resume();const began=performance.now(),until=began+45000;
 if(operation)onProgress?.(operation);
 while(operation&&['pending','queued'].includes(operation.status)){
  if(performance.now()>=until)throw Error('Sponsorship is still pending. Retry to resume this saved action.');
  // This endpoint reads the saved operation, not the chain. Observe fast
  // confirmations promptly, then return to the normal bounded recovery rate.
  await new Promise(r=>setTimeout(r,performance.now()-began<5000?250:1000));operation=await sponsor.resume();if(operation)onProgress?.(operation);
 }
 if(operation?.status==='failed')throw Error('The transaction reverted. Refresh before retrying.');return operation;
}
