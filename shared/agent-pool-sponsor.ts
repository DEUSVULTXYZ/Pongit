import {decodeFunctionData,encodeAbiParameters,encodeFunctionData,getAddress,isAddress,keccak256,type Abi,type Address,type Hex} from 'viem';
import {abi as familyAbi} from './abi-independent-ArcadeFamily';
import {agentCatalogAbi} from './abi-AgentCatalog';
import {agentChallengesAbi} from './abi-AgentChallenges';
import type {AgentPoolManifest} from './agent-pool';
import type {ChainOperation} from './independent';

export type PoolSignedCall={to:Address;data:Hex};
export const poolOperationId=(call:PoolSignedCall)=>keccak256(encodeAbiParameters(
 [{type:'address'},{type:'bytes'},{type:'uint256'},{type:'string'}],[call.to,call.data,0n,'']));

/** Only owner/arcade-signed, zero-value Monad actions. Never accept a strategy
 * execution, owner-only administrative action, arena write or financial call. */
export function validatePoolSignedCall(m:AgentPoolManifest,body:unknown):PoolSignedCall&{admission:boolean}{
 const b=body as Record<string,unknown>;
 if(!b||typeof b!=='object'||Object.keys(b).some(k=>!['to','data'].includes(k))||typeof b.to!=='string'||!isAddress(b.to)
  ||typeof b.data!=='string'||!/^0x(?:[\da-f]{2}){4,2048}$/i.test(b.data))throw Error('Invalid signed pool call');
 const to=getAddress(b.to),data=b.data.toLowerCase() as Hex;
 const target=to.toLowerCase();let abi:Abi,methods:string[];
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
