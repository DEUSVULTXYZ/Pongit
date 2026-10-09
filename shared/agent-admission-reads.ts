import {decodeFunctionResult,encodeFunctionData,multicall3Abi,type Address,type Hex,type PublicClient} from 'viem';
import {reusableAgentPoolAbi as abi} from './abi-ReusableAgentPool';
import {reusableAdmissionDigest,type ReusableTicket} from './reusable-admission';

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
 const values=new Map<string,Pair>();
 const proofs=new Map<string,Promise<Hex>>();
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
    values.set(app,value);
    return value;
   });
   const entry={key:identity,pair};tickets.set(app,entry);
   // A failed prefetched lane must neither reject another lane nor become a
   // permanent cached error. Attach the handler before anyone awaits it.
   void pair.catch(()=>{if(tickets.get(app)===entry)tickets.delete(app);});
  });
  return tickets.get(ref.arena.toLowerCase())!.pair;
 }
 function source(blockNumber:bigint){
  let pending=headers.get(blockNumber);
  if(!pending){
   pending=base.getBlock({blockNumber}).finally(()=>headers.delete(blockNumber));
   headers.set(blockNumber,pending);
  }
  return pending;
 }
 function issued(ticket:ReusableTicket,block:{hash:string|null}):Promise<Hex>{
  const ref={chainId:10143n,arena:ticket.arena,epoch:ticket.epoch,id:ticket.matchId};
  const pair=values.get(ticket.arena.toLowerCase());
  if(!valid(ref)||!block.hash||!/^0x[0-9a-fA-F]{64}$/.test(block.hash)
   ||!pair||reusableAdmissionDigest(pair[0])!==reusableAdmissionDigest(ticket))throw Error('Invalid admission proof reference');
  const identity=(t:ReusableTicket)=>`${block.hash}:${t.arena.toLowerCase()}:${t.epoch}:${t.sequence}`;
  const wanted=identity(ticket),existing=proofs.get(wanted);if(existing)return existing;
  // Known immutable tickets can share the authorization call, but not its
  // validity. Keep only in-flight proofs and pin every retry by canonical hash.
  const candidates=[ticket,...Array.from(values.values(),p=>p[0])].filter((t,i,a)=>
   a.findIndex(v=>v.arena.toLowerCase()===t.arena.toLowerCase())===i&&!proofs.has(identity(t)));
  const data=encodeFunctionData({abi:multicall3Abi,functionName:'aggregate3',args:[candidates.map(t=>({target:pool,allowFailure:true,
   callData:encodeFunctionData({abi,functionName:'issuedTicket',args:[t.arena,t.epoch,t.sequence]})}))]});
  const batch=base.request({method:'eth_call',params:[{to:'0xcA11bde05977b3631167028862bE2a173976CA11',data},
   {blockHash:block.hash,requireCanonical:true}]} as any).then(raw=>{
    const results=decodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',data:raw as Hex});
    if(results.length!==candidates.length)throw Error('Incomplete issued ticket batch');return results;
   });
  candidates.forEach((t,i)=>{
   const id=identity(t),proof=batch.then(results=>{
    if(!results[i].success)throw Error('Issued admission ticket unavailable');
    return decodeFunctionResult({abi,functionName:'issuedTicket',data:results[i].returnData});
   });
   proofs.set(id,proof);
   void proof.finally(()=>{if(proofs.get(id)===proof)proofs.delete(id);}).catch(()=>{});
  });
  return proofs.get(wanted)!;
 }
 return {ticket:read,source,async proof(ticket:ReusableTicket,block:{hash:string|null}){
  // Start both checks before the independent live session/code reads.
  const digest=issued(ticket,block);
  const [issuedDigest,header]=await Promise.all([digest,source(ticket.sourceBlock)]);
  return{issuedDigest,source:header};
 }};
}
