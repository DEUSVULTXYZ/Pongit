import {decodeFunctionData,encodeAbiParameters,encodeFunctionData,getAddress,isAddress,keccak256,multicall3Abi,type Abi,type Address,type Hex} from 'viem';
import {abi as familyAbi} from './abi-independent-ArcadeFamily';
import {agentCatalogAbi} from './abi-AgentCatalog';
import {agentChallengesAbi} from './abi-AgentChallenges';
import type {AgentPoolManifest} from './agent-pool';
import type {ChainOperation} from './independent';
import {reusableAgentPoolAbi} from './abi-ReusableAgentPool';

export const POOL_ADMISSION_BATCH='0xcA11bde05977b3631167028862bE2a173976CA11' as const;
// Observed deployed runtime, independently compared before a sponsor starts.
export const POOL_ADMISSION_BATCH_HASH='0xd5c15df687b16f2ff992fc8d767b4216323184a2bbc6ee2f9c398c318e770891' as const;
export const MAX_ADMISSION_PASSES=4;
/** The deployed queue scans 32 historical requests per call. More than four
 * passes remains the ordinary resumable queue's responsibility. */
export const admissionPasses=(count:bigint)=>Number((count+31n)/32n>4n?4n:(count+31n)/32n<1n?1n:(count+31n)/32n);
const admitData=encodeFunctionData({abi:reusableAgentPoolAbi,functionName:'admitChallenge'});

export type PoolSignedCall={to:Address;data:Hex};
export const poolOperationId=(call:PoolSignedCall)=>keccak256(encodeAbiParameters(
 [{type:'address'},{type:'bytes'},{type:'uint256'},{type:'string'}],[call.to,call.data,0n,'']));

/** Only owner/arcade-signed, zero-value Monad actions. Never accept a strategy
 * execution, owner-only administrative action, arena write or financial call.
 * The one permitted batch preserves the signed request even if optional
 * permissionless admission cannot run. No arbitrary multicall is sponsored. */
export function validatePoolSignedCall(m:AgentPoolManifest,body:unknown):PoolSignedCall&{admission:boolean}{
 const b=body as Record<string,unknown>;
 if(!b||typeof b!=='object'||Object.keys(b).some(k=>!['to','data'].includes(k))||typeof b.to!=='string'||!isAddress(b.to)
  ||typeof b.data!=='string'||!/^0x(?:[\da-f]{2}){4,2048}$/i.test(b.data))throw Error('Invalid signed pool call');
 const to=getAddress(b.to),data=b.data.toLowerCase() as Hex;
 const target=to.toLowerCase();let abi:Abi,methods:string[];
 if(target===POOL_ADMISSION_BATCH.toLowerCase()){
  if(m.version!==5)throw Error('Atomic admission requires the five-lane pool');
  const decoded=decodeFunctionData({abi:multicall3Abi,data});
  if(decoded.functionName!=='aggregate3'||encodeFunctionData({abi:multicall3Abi,functionName:'aggregate3',args:decoded.args}).toLowerCase()!==data)throw Error('Invalid admission batch');
  const calls=decoded.args[0];
  if(calls.length<2||calls.length>MAX_ADMISSION_PASSES+1||calls[0].target.toLowerCase()!==m.challenges.toLowerCase()||calls[0].allowFailure
   ||calls.slice(1).some(c=>c.target.toLowerCase()!==m.pool.toLowerCase()||!c.allowFailure||c.callData!==admitData))throw Error('Invalid admission batch scope');
  const request=validatePoolSignedCall(m,{to:calls[0].target,data:calls[0].callData});
  if(!request.admission)throw Error('Only a new challenge can request atomic admission');
  return {to,data,admission:true};
 }
 if(target===m.family.toLowerCase()){abi=familyAbi;methods=['register','revoke'];}
 else if(target===m.catalog.toLowerCase()){abi=agentCatalogAbi;methods=['register'];}
 else if(target===m.challenges.toLowerCase()){abi=agentChallengesAbi;methods=['command'];}
 else throw Error('Contract is outside the agent scope');
 const decoded=decodeFunctionData({abi,data});
 if(!methods.includes(decoded.functionName))throw Error('Action is not sponsored');
 // Canonical encoding prevents padding/tail aliases from bypassing idempotency.
 if(encodeFunctionData({abi,functionName:decoded.functionName,args:decoded.args}).toLowerCase()!==data)throw Error('Non-canonical signed call');
 const args=decoded.args??[],signature=args.at(-1);
 if(typeof signature!=='string'||!/^0x[\da-f]{130}$/i.test(signature))throw Error('A signed authorization is required');
 const action=decoded.functionName==='command'?Number(args[1]):undefined;
 if(action!==undefined&&action!==1&&action!==2)throw Error('Unknown challenge action');
 return{to,data,admission:decoded.functionName==='register'||action===1};
}

export function batchPoolChallenge(m:AgentPoolManifest,call:PoolSignedCall,passes=1):PoolSignedCall{
 if(m.challengeAdmission!=='atomic-v1'||call.to.toLowerCase()!==m.challenges.toLowerCase()||!validatePoolSignedCall(m,{to:call.to,data:call.data}).admission)return call;
 if(!Number.isInteger(passes)||passes<1||passes>MAX_ADMISSION_PASSES)throw Error('Invalid admission pass count');
 const batch={to:POOL_ADMISSION_BATCH,data:encodeFunctionData({abi:multicall3Abi,functionName:'aggregate3',args:[[
  {target:call.to,allowFailure:false,callData:call.data},
  ...Array.from({length:passes},()=>({target:m.pool,allowFailure:true,callData:admitData})),
 ]]})};
 validatePoolSignedCall(m,batch);return batch;
}

/** Estimate the successful optional admission too: naive gas estimation can
 * otherwise accept an out-of-gas second call and silently leave every user in
 * the queue. This strict variant is NEVER signed or stored as a new intent. */
export function strictPoolAdmissionEstimate(m:AgentPoolManifest,call:PoolSignedCall):PoolSignedCall|null{
 validatePoolSignedCall(m,call);if(call.to.toLowerCase()!==POOL_ADMISSION_BATCH.toLowerCase())return null;
 const decoded=decodeFunctionData({abi:multicall3Abi,data:call.data});
 if(decoded.functionName!=='aggregate3')throw Error('Invalid admission batch');
 return {to:call.to,data:encodeFunctionData({abi:multicall3Abi,functionName:'aggregate3',args:[decoded.args[0].map(c=>({...c,allowFailure:false}))]})};
}

/** Try the longest required prefix first, retaining the entire original batch
 * in each simulation. If capacity fills after the first admission, later calls
 * may fail without underestimating the successful prefix or signing new bytes. */
export function strictPoolAdmissionEstimates(m:AgentPoolManifest,call:PoolSignedCall):PoolSignedCall[]{
 const strict=strictPoolAdmissionEstimate(m,call);if(!strict)return [];
 const decoded=decodeFunctionData({abi:multicall3Abi,data:call.data});
 if(decoded.functionName!=='aggregate3')throw Error('Invalid admission batch');
 const calls=decoded.args[0];
 return Array.from({length:calls.length-1},(_,i)=>({to:call.to,data:encodeFunctionData({abi:multicall3Abi,functionName:'aggregate3',
  args:[calls.map((c,index)=>({...c,allowFailure:index>calls.length-1-i}))]})}));
}

export class PoolSponsorPending extends Error {
 constructor(){super('Your action is waiting for sponsorship. Your arcade session is still saved.');this.name='PoolSponsorPending';}
}
export type PoolSessionStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type PoolSponsorTransport=(path:string,body?:PoolSignedCall)=>Promise<unknown>;
export function poolOperation(value:unknown,id:Hex):ChainOperation {
 const v=value as ChainOperation;
 if(!v||v.id!==id||!['queued','pending','confirmed','failed'].includes(v.status)
  ||v.hash!==undefined&&!/^0x[\da-f]{64}$/i.test(v.hash)||(v.status==='confirmed'||v.status==='pending')&&!v.hash)throw Error('Invalid sponsor operation response');
 return {id:v.id,status:v.status,...(v.hash?{hash:v.hash}:{}),...(v.status==='failed'?{error:'The transaction reverted. Refresh before retrying.'}:{})};
}

/** Tab-local immutable intent. A network error, rate limit, lost reply or F5
 * preserves it. Only an exact receipt or explicit non-acceptance clears it.
 * The transport must use the configured PONGIT endpoint, not an agent URL. */
export function createPoolSponsor(m:AgentPoolManifest,player:Address,storage:PoolSessionStorage,transport:PoolSponsorTransport){
 const key=`pongit:agent-pool:${m.pool.toLowerCase()}:${player.toLowerCase()}:operation`;let busy=false;
 function pending():PoolSignedCall&{id:Hex}|null{
  const raw=storage.getItem(key);if(!raw)return null;
  const p=JSON.parse(raw),call=validatePoolSignedCall(m,{to:p.to,data:p.data});
  if(poolOperationId(call)!==p.id)throw Error('Saved operation identity differs; do not replace its nonce');
  return{to:call.to,data:call.data,id:p.id};
 }
 async function perform(call?:PoolSignedCall){
  if(busy)throw new PoolSponsorPending();busy=true;
  try{
   let saved=pending();
   if(call){const checked=validatePoolSignedCall(m,{to:call.to,data:call.data}),id=poolOperationId(checked);
    if(saved&&saved.id!==id)throw new PoolSponsorPending();
    if(!saved){saved={to:checked.to,data:checked.data,id};storage.setItem(key,JSON.stringify(saved));}
   }
   if(!saved)return null;
   let value:unknown;
   try{value=await transport(`operations/${saved.id}`);}
   catch(e){
    if((e as {status?:number}).status!==404)throw e;
    try{value=await transport('transactions',{to:saved.to,data:saved.data});}
    catch(error){
     const rejected=error as {accepted?:boolean;code?:string};
     if(rejected.accepted===false&&['CONTRACT_REJECTED','AGENT_ADMISSIONS_CLOSED','AGENT_CALL_REJECTED'].includes(rejected.code??''))storage.removeItem(key);
     throw error;
    }
   }
   const op=poolOperation(value,saved.id);
   if(op.status==='confirmed'||op.status==='failed')storage.removeItem(key);
   return op;
  }finally{busy=false;}
 }
 return{pending,send:(call:PoolSignedCall)=>perform(call),resume:()=>perform()};
}
