import {hashTypedData,multicall3Abi,type PublicClient} from 'viem';
import {monadTestnet} from 'viem/chains';
import {familyGrantTypes,type FamilyGrant,type IndependentManifest} from './independent';
import {abi as familyAbi} from './abi-independent-ArcadeFamily';
import {independentRules} from './independent-rules';

export function familyGrantHash(m:Pick<IndependentManifest,'chainId'|'family'>,grant:FamilyGrant){
 return hashTypedData({domain:{name:'PONGIT Arcade Family',version:'1',chainId:m.chainId,verifyingContract:m.family},types:familyGrantTypes,primaryType:'ArcadeFamilyGrant',message:grant});
}

/** Read authorization and nonce at one block; hashing a known grant needs no RPC.
 * A failed read propagates. It is never interpreted as an expired authorization.
 */
export async function lobbyCommandContext(base:PublicClient,m:IndependentManifest,grant:FamilyGrant){
 if(m.chainId!==monadTestnet.id)throw Error('Unsupported lobby command chain');
 // The full latest block (including every transaction hash) is slow on the
 // public RPC. Read its number, then authorization, nonce and EVM timestamp in
 // one block-pinned multicall. No browser/server clock supplies a signature.
 const blockNumber=await base.getBlockNumber({cacheTime:0}),hash=familyGrantHash(m,grant);
 const [current,nonce,timestamp]=await base.multicall({blockNumber,allowFailure:false,multicallAddress:monadTestnet.contracts.multicall3.address,contracts:[
  {address:m.family,abi:familyAbi,functionName:'grantOf',args:[grant.player]},
  {address:m.lobby,abi:independentRules(m).lobby,functionName:'commandNonces',args:[hash]},
  {address:monadTestnet.contracts.multicall3.address,abi:multicall3Abi,functionName:'getCurrentBlockTimestamp'},
 ]});
 if(current.player.toLowerCase()!==grant.player.toLowerCase()||current.key.toLowerCase()!==grant.key.toLowerCase()||current.issuedAt!==grant.issuedAt||current.expires!==grant.expires||current.revision!==grant.revision||grant.expires<=timestamp)throw Error('Renew arcade session');
 return {hash,nonce,deadline:timestamp+120n<grant.expires?timestamp+120n:grant.expires};
}
