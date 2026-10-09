import {decodeFunctionResult,encodeFunctionData,multicall3Abi,type Address,type Hex,type PublicClient} from 'viem';
import {reusableAgentPoolAbi as abi} from './abi-ReusableAgentPool';

type Ref={chainId:bigint;arena:Address;epoch:bigint;id:bigint};
type Pair=ReturnType<typeof decodeTicket>;
const decodeTicket=(data:Hex)=>decodeFunctionResult({abi,functionName:'ticketOf',data});
const key=(r:Ref)=>`${r.chainId}:${r.arena.toLowerCase()}:${r.epoch}:${r.id}`;

/** Read the immutable tickets for newly assigned lanes in one canonical batch.
 * This is planning data, not authorization: each admit still verifies the issued
 * digest at its current block, source hash, live result count, code and hub fence.
 * Cache at most the latest ticket per registered arena, as the engine already
 * does locally. Concurrent source-header reads share only an in-flight request. */
export function agentAdmissionReads(base:PublicClient,pool:Address,apps:readonly Address[]){
 const allowed=new Set(apps.map(a=>a.toLowerCase()));
 const tickets=new Map<string,{key:string;pair:Promise<Pair>}>();
 const headers=new Map<bigint,ReturnType<PublicClient['getBlock']>>();
 const valid=(r:Ref)=>r.chainId===10143n&&r.id>0n&&r.epoch>0n&&allowed.has(r.arena.toLowerCase());
 function read(ref:Ref,lanes:readonly {ref:Ref}[],block:{hash:string|null}):Promise<Pair>{
  if(!valid(ref)||!block.hash||!/^0x[0-9a-fA-F]{64}$/.test(block.hash))return Promise.reject(Error('Invalid canonical admission reference'));
  const wanted=key(ref),existing=tickets.get(ref.arena.toLowerCase());
  if(existing?.key===wanted)return existing.pair;
  const candidates=[ref,...lanes.map(l=>l.ref)].filter(valid);
  const refs:Ref[]=[];
  for(const r of candidates){
   const app=r.arena.toLowerCase();
   if(refs.some(v=>v.arena.toLowerCase()===app)||tickets.get(app)?.key===key(r))continue;
   refs.push(r);
  }
  if(refs.length>5)return Promise.reject(Error('Too many simultaneous admissions'));
  const calls=refs.map(r=>({target:pool,allowFailure:true,callData:encodeFunctionData({abi,functionName:'ticketOf',args:[r]})}));
  const data=encodeFunctionData({abi:multicall3Abi,functionName:'aggregate3',args:[calls]});
  const batch=base.request({method:'eth_call',params:[{to:'0xcA11bde05977b3631167028862bE2a173976CA11',data},
   {blockHash:block.hash,requireCanonical:true}]} as any).then(raw=>{
    const results=decodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',data:raw as Hex});
    if(results.length!==refs.length)throw Error('Incomplete admission ticket batch');
    return results;
   });
  refs.forEach((r,i)=>{
   const app=r.arena.toLowerCase(),identity=key(r);
   const pair=batch.then(results=>{
    if(!results[i].success)throw Error('Admission ticket unavailable');
    const value=decodeTicket(results[i].returnData),[t,b]=value;
    if(t.authority.toLowerCase()!==pool.toLowerCase()||t.arena.toLowerCase()!==app
     ||t.epoch!==r.epoch||t.matchId!==r.id||b.id!==r.id||b.epoch!==r.epoch)throw Error('Admission ticket reference mismatch');
    return value;
   });
   const entry={key:identity,pair};tickets.set(app,entry);
   // A failed prefetched lane must neither reject another lane nor become a
   // permanent cached error. Attach the handler before anyone awaits it.
   void pair.catch(()=>{if(tickets.get(app)===entry)tickets.delete(app);});
  });
  return tickets.get(ref.arena.toLowerCase())!.pair;
 }
 return {ticket:read,source(blockNumber:bigint){
  let pending=headers.get(blockNumber);
  if(!pending){
   pending=base.getBlock({blockNumber}).finally(()=>headers.delete(blockNumber));
   headers.set(blockNumber,pending);
  }
  return pending;
 }};
}
