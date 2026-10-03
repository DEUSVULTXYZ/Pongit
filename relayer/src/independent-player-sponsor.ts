import {decodeFunctionData,encodeAbiParameters,encodeFunctionData,keccak256,type Abi,type Address,type Hex} from 'viem';
import type {IndependentManifest} from '../../shared/independent';
import {abi as familyAbi} from '../../shared/abi-independent-ArcadeFamily';
import {independentRules} from '../../shared/independent-rules';
import type {independentWriter} from './independent-writer';

type Writer=Pick<Awaited<ReturnType<typeof independentWriter>>,'get'|'enqueue'|'status'>;
const actions=new Set(['queue','queueHeartbeat','cancelQueue','createRoom','joinRoom','leaveRoom','rejoinQueue','blockPlayer','acceptProposal','declineProposal','inviteToRoom','inviteSomeone','answerInvitation','rematch','cancelAdmission']);

/** This gas-only role has no lifecycle, publication or financial permission.
 * Player/family signatures remain verified by the contracts at inclusion. */
export function independentPlayerCall(m:IndependentManifest,to:Address,data:Hex,value=0n){
 if(value!==0n)throw Error('Player sponsorship cannot transfer value');
 const lobby=independentRules(m).lobby;
 let abi:Abi,methods:string[];
 if(to.toLowerCase()===m.family.toLowerCase()){abi=familyAbi;methods=['register','revoke'];}
 else if(to.toLowerCase()===m.lobby.toLowerCase()){abi=lobby;methods=['relay'];}
 else throw Error('Outside the player sponsor scope');
 const decoded=decodeFunctionData({abi,data});
 if(!methods.includes(decoded.functionName))throw Error('Outside the player sponsor scope');
 if(encodeFunctionData({abi,functionName:decoded.functionName,args:decoded.args}).toLowerCase()!==data.toLowerCase())throw Error('Non-canonical player call');
 const signature=decoded.args?.at(-1);
 if(typeof signature!=='string'||!/^0x[\da-f]{130}$/i.test(signature))throw Error('Player authorization required');
 if(decoded.functionName==='relay'){
  const inner=decoded.args![1] as Hex,command=decodeFunctionData({abi:lobby,data:inner});
  if(!actions.has(command.functionName)||encodeFunctionData({abi:lobby,functionName:command.functionName,args:command.args}).toLowerCase()!==inner.toLowerCase())throw Error('Outside the signed player actions');
 }
}

/** An existing operation always keeps its old signer and journal, including
 * uncertain or failed operations. New signed player intents use the gas role. */
export function independentPlayerRouter(m:IndependentManifest,legacy:Writer,player?:Writer){
 const get=async(id:string)=>await legacy.get(id)??await player?.get(id)??null;
 return {get,status:()=>player?.status()??legacy.status(),
  enqueue:async(to:Address,data:Hex,value=0n,priority=1,context='')=>{
   if(!player||![m.family.toLowerCase(),m.lobby.toLowerCase()].includes(to.toLowerCase()))return legacy.enqueue(to,data,value,priority,context);
   // Only the existing permissionless maintenance calls stay with the operator.
   const decoded=decodeFunctionData({abi:to.toLowerCase()===m.family.toLowerCase()?familyAbi:independentRules(m).lobby,data});
   if(!['register','revoke','relay'].includes(decoded.functionName))return legacy.enqueue(to,data,value,priority,context);
   independentPlayerCall(m,to,data,value);
   const id=keccak256(encodeAbiParameters([{type:'address'},{type:'bytes'},{type:'uint256'},{type:'string'}],[to,data,value,context]));
   return await get(id)??player.enqueue(to,data,value,priority,context);
  }};
}
