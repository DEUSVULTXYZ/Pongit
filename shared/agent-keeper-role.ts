import {decodeFunctionData,encodeFunctionData,type Address,type Abi,type Hex} from 'viem';
import {assertContinuousDelegation} from './continuous-delegation';
export type AgentKeeperRole='admission'|'maintenance'|'archive';
const methods:Record<AgentKeeperRole,Record<string,readonly string[]>>={
 admission:{pool:['setArenaAdmission','setArenaAdmissions','admitTournament','admitChallenge','admitQualification'],tournaments:['begin','select'],challenges:['expire']},
 maintenance:{pool:['openReusableArena','closeReusableArena','recoverExpired','releaseArena','recoverReleased']},
 archive:{pool:['captureProof','captureMissing'],tournaments:['synchronize','retryCancelled','resumeRepair'],ratings:['rebuild','synchronizeHistory']},
};
/** Destination and canonical selector allowlist, checked before every signing or
 * exact resend. These roles cannot administer gates, spend for players or deploy. */
export function keeperRolePolicy(role:AgentKeeperRole,contracts:Record<string,{address:Address;abi:Abi}>,maximumOpeningValue:bigint,hub?:Address){
 if(!(role in methods)||maximumOpeningValue<0n)throw Error('Invalid keeper role policy');
 return(to:Address,data:Hex,value:bigint)=>{
  assertContinuousDelegation(hub,data);
  const target=Object.entries(contracts).find(([,c])=>c.address.toLowerCase()===to.toLowerCase());
  if(!target)throw Error('Contract is outside the keeper role');
  const [name,c]=target,decoded=decodeFunctionData({abi:c.abi,data});
  if(!methods[role][name]?.includes(decoded.functionName))throw Error('Action is outside the keeper role');
  if(encodeFunctionData({abi:c.abi,functionName:decoded.functionName,args:decoded.args}).toLowerCase()!==data.toLowerCase())throw Error('Non-canonical keeper action');
  if(value<0n||(decoded.functionName==='openReusableArena'?value>maximumOpeningValue:value!==0n))throw Error('Keeper value exceeds its role');
 };
}
