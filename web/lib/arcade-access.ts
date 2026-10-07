import type {Identity} from './wallet';
import {independentApi,openFamily,type FamilySession} from './independent';
import {publicIndependentManifest,type IndependentManifest} from '../../shared/independent';
import {validateAgentPoolManifest,type AgentPoolManifest} from '../../shared/agent-pool';
import {preparePoolFamily,SESSION_RENEW_MARGIN,type PoolFamilySession} from '../../shared/agent-pool-family';
import {poolApi,poolBase,poolBrowserSponsor,finishPoolSponsor} from './agent-pool';
import type {ChainOperation} from '../../shared/independent';

/** One explicit arcade login authorizes both existing gameplay families. The
 * root signing session ends in the caller. Only scoped two-hour gameplay keys
 * survive navigation; neither family permits a financial or profile action.
 * Each sponsor retains its own exact pending operation on a partial failure. */
export async function openArcadeAccess(identity:Identity,required:{human:IndependentManifest;agents?:never}|{agents:AgentPoolManifest;human?:never},onProgress?:(op:ChainOperation)=>void){
 const human=async():Promise<FamilySession>=>{
  const m=required.human??publicIndependentManifest((await independentApi('config')).manifest);
  return openFamily(m,identity,required.human?onProgress:undefined);
 };
 const agents=async():Promise<PoolFamilySession>=>{
  const m=required.agents??validateAgentPoolManifest(await poolApi<AgentPoolManifest>('config'));
  const sponsor=poolBrowserSponsor(m,identity.account.address),progress=required.agents?onProgress:undefined;
  await finishPoolSponsor(sponsor,undefined,progress);
  const prepared=await preparePoolFamily(poolBase(),m,identity.account,sessionStorage,{renewWithin:SESSION_RENEW_MARGIN});
  if(prepared.call)await finishPoolSponsor(sponsor,prepared.call,progress);
  return prepared.session;
 };
 const [h,a]=await Promise.allSettled([human(),agents()]);
 if(required.human&&h.status==='rejected')throw h.reason;
 if(required.agents&&a.status==='rejected')throw a.reason;
 return {human:h.status==='fulfilled'?h.value:undefined,agents:a.status==='fulfilled'?a.value:undefined,
  incomplete:h.status==='rejected'||a.status==='rejected'};
}
