import type {IncomingMessage} from 'node:http';
import type {AgentPoolManifest} from '../../../shared/agent-pool';
import {poolOperationId,validatePoolSignedCall} from '../../../shared/agent-pool-sponsor';
import type {independentWriter} from '../independent-writer';

type Writer=Pick<Awaited<ReturnType<typeof independentWriter>>,'get'|'enqueue'>;
function rejection(code:string,status=400){return Object.assign(Error('This action was not accepted'),{code,status,accepted:false});}

/** Shares the existing sponsor and operator nonce journal. This adapter never
 * owns a second signing key and never starts another nonce allocator. */
export function poolSponsorRoutes(m:AgentPoolManifest,writer:Writer,admissions:()=>Promise<boolean>){
 return async(method:string,path:string,body?:unknown)=>{
  if(method==='GET'&&/^\/agents\/operations\/0x[\da-f]{64}$/.test(path)){
   const op=await writer.get(path.split('/').at(-1)!);
   return {status:op?200:404,value:op??{error:'Unknown operation',code:'AGENT_OPERATION_NOT_FOUND'}};
  }
  if(method==='POST'&&path==='/agents/transactions'){
   let call:ReturnType<typeof validatePoolSignedCall>;
   try{call=validatePoolSignedCall(m,body);}catch{throw rejection('AGENT_CALL_REJECTED');}
   // Even closed admissions must reconcile an already persisted operation. A
   // gate transition cannot turn an uncertain accepted call into a new intent.
   const prior=await writer.get(poolOperationId(call));if(prior)return{status:202,value:prior};
   if(call.admission&&!await admissions())throw rejection('AGENT_ADMISSIONS_CLOSED',409);
   // enqueue simulates the exact signed call before storing it. A temporary RPC
   // error retains uncertainty; only a decoded contract revert is non-acceptance.
   return{status:202,value:await writer.enqueue(call.to,call.data,0n,1)};
  }
  return null;
 };
}

export async function readPoolSignedBody(req:IncomingMessage){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??''))throw rejection('AGENT_CALL_REJECTED',415);
 const declared=Number(req.headers['content-length']??0);
 if(!Number.isSafeInteger(declared)||declared<0||declared>5000)throw rejection('AGENT_CALL_REJECTED',413);
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>5000)throw rejection('AGENT_CALL_REJECTED',413);chunks.push(Buffer.from(chunk));}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw rejection('AGENT_CALL_REJECTED');}
}
