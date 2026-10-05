import {parseAbi,toFunctionSelector,type Address,type Hex,type PublicClient} from 'viem';
import {NO_LEASE_HUB} from './hub-lease';
import {LEGACY_HOSTED_HUB} from './hosted-control';

/** Protocol policy for the active v3 hub. It is deliberately not an environment
 * switch: an exhausted reserve or a dead node cannot authorize a one-hour lock. */
export function continuousDelegation(hub:string|undefined){return hub?.toLowerCase()===NO_LEASE_HUB.toLowerCase();}
const signatures=[
 'undelegate(bytes32)','undelegate()','closeDelegation(bytes32)','forceClose(address,bytes32)',
 'closeEngine()','closeCompletedSession(uint256)','close()','closeReusableArena(address)','closeArena(address)','closeArena(uint256)',
 'closeArena((uint256,address,uint256,uint256))','recoverExpired(address)',
 'recoverExpired(uint256)','recoverExpired((uint256,address,uint256,uint256))',
] as const;
const closingSelectors=new Set(signatures.map(s=>toFunctionSelector(s).toLowerCase()));
export const closesDelegation=(data:Hex)=>closingSelectors.has(data.slice(0,10).toLowerCase());
export const closingMethod=(name:string)=>['undelegate','closeDelegation','forceClose','closeEngine','closeCompletedSession','close','closeReusableArena','closeArena','recoverExpired'].includes(name);
export function assertContinuousDelegation(hub:string|undefined,data:Hex){
 if(continuousDelegation(hub)&&closesDelegation(data))throw Object.assign(
  Error('Continuous delegation forbids automatic closure; retain the epoch and review the incident'),{code:'CONTINUOUS_DELEGATION'});
}
/** Last check at the signing/broadcast boundary, including old queued jobs and
 * helpers. Only closure selectors require a hub read. A failed read blocks the
 * write. Receipt observation remains independent and never releases a nonce on
 * the strength of this policy rejection. */
export function continuousSubmissionGuard(base:Pick<PublicClient,'readContract'>){
 const hubs=new Map<string,Address>(),abi=parseAbi(['function hub() view returns(address)']);
 return async(to:Address|undefined,data:Hex)=>{
  if(!to||!closesDelegation(data))return;
  let hub=hubs.get(to.toLowerCase());
  if(!hub){hub=continuousDelegation(to)||to.toLowerCase()===LEGACY_HOSTED_HUB.toLowerCase()?to:await base.readContract({address:to,abi,functionName:'hub'});hubs.set(to.toLowerCase(),hub);}
  assertContinuousDelegation(hub,data);
 };
}
