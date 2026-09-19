import {createPublicClient,http,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {API} from './api';
import {measuredFetch} from '../../shared/rpc-metrics';
import {createPoolSponsor,type PoolSignedCall} from '../../shared/agent-pool-sponsor';
import type {AgentPoolManifest} from '../../shared/agent-pool';

const base=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:15,batchSize:8192}},transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:8000,fetchFn:measuredFetch('monad')})});
export const poolBase=()=>base;
export async function poolApi<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await measuredFetch('pongit')(`${API}/agents/${path}`,{method:body===undefined?'GET':'POST',
  ...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)}),
  signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});
 const value=await response.json();
 if(!response.ok)throw Object.assign(Error(value.error||'Agent Arcade is synchronizing'),{...value,status:response.status,headers:response.headers});
 return value;
}
export function poolBrowserSponsor(m:AgentPoolManifest,player:Address){
 return createPoolSponsor(m,player,sessionStorage,(path,body)=>poolApi(path,body));
}
/** Poll one saved sponsored action. A timeout leaves its exact intent intact. */
export async function finishPoolSponsor(sponsor:ReturnType<typeof poolBrowserSponsor>,call?:PoolSignedCall){
 let operation=call?await sponsor.send(call):await sponsor.resume();const until=performance.now()+45000;
 while(operation&&['pending','queued'].includes(operation.status)){
  if(performance.now()>=until)throw Error('Sponsorship is still pending. Retry to resume this saved action.');
  await new Promise(r=>setTimeout(r,1000));operation=await sponsor.resume();
 }
 if(operation?.status==='failed')throw Error('The transaction reverted. Refresh before retrying.');return operation;
}
