import {decodeFunctionResult,encodeFunctionData,keccak256,type Address,type Hex,type LocalAccount,type PublicClient} from 'viem';
import {readHubDelegation} from './rooms-hub';
import {hostedOptInTransport} from './hosted-opt-in';
import {NO_LEASE_HUB} from './hub-lease';

const ownerAbi=[{type:'function',name:'owner',stateMutability:'view',inputs:[],outputs:[{type:'address'}]}] as const;
/** Separate, nonfinancial signer. Revalidate its immutable scope at one canonical
 * hash immediately before a creation POST. Reconciliation needs no signature. */
export async function canonicalHostedConsent(base:PublicClient,scope:{hub:Address;app:Address;epoch:bigint;owner:Address;runtimeHash:Hex},
 account:Pick<LocalAccount,'address'|'signMessage'>,control:string,transport:typeof fetch){
 if(scope.hub.toLowerCase()!==NO_LEASE_HUB.toLowerCase()||scope.owner.toLowerCase()!==account.address.toLowerCase())
  throw Error('Provisioning signer differs from the pinned deployment');
 const [chain,block]=await Promise.all([base.getChainId(),base.getBlock()]);
 if(chain!==10143||!block.hash)throw Error('Provisioning requires a canonical Monad Testnet block');
 const pin={blockHash:block.hash,requireCanonical:true as const};
 const [delegation,code,raw]=await Promise.all([
  readHubDelegation(base,scope.hub,scope.app,pin),base.getCode({address:scope.app,...pin}),
  base.request({method:'eth_call',params:[{to:scope.app,data:encodeFunctionData({abi:ownerAbi,functionName:'owner'})},pin]}),
 ]);
 const owner=decodeFunctionResult({abi:ownerAbi,functionName:'owner',data:raw});
 if(delegation.status!==1||delegation.epoch!==scope.epoch||delegation.baseBlock<=0n
  ||owner.toLowerCase()!==scope.owner.toLowerCase()||!code||keccak256(code)!==scope.runtimeHash)
  throw Error('Canonical provisioning owner, code or active epoch changed');
 return hostedOptInTransport({app:scope.app,epoch:scope.epoch,owner,control,transport,sign:message=>account.signMessage({message})});
}
