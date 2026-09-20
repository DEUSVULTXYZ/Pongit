import {hashTypedData,type PublicClient} from 'viem';
import {familyGrantTypes,type FamilyGrant,type IndependentManifest} from './independent';
import {independentReader} from './independent-read';

export function familyGrantHash(m:Pick<IndependentManifest,'chainId'|'family'>,grant:FamilyGrant){
 return hashTypedData({domain:{name:'PONGIT Arcade Family',version:'1',chainId:m.chainId,verifyingContract:m.family},types:familyGrantTypes,primaryType:'ArcadeFamilyGrant',message:grant});
}

/** Read authorization and nonce at one block; hashing a known grant needs no RPC.
 * A failed read propagates. It is never interpreted as an expired authorization.
 */
export async function lobbyCommandContext(base:PublicClient,m:IndependentManifest,grant:FamilyGrant){
 const block=await base.getBlock(),r=independentReader(base,m,block.number),hash=familyGrantHash(m,grant);
 const [current,nonce]=await Promise.all([r.family('grantOf',[grant.player]),r.lobby('commandNonces',[hash])]);
 if(current.player.toLowerCase()!==grant.player.toLowerCase()||current.key.toLowerCase()!==grant.key.toLowerCase()||current.issuedAt!==grant.issuedAt||current.expires!==grant.expires||current.revision!==grant.revision||grant.expires<=block.timestamp)throw Error('Renew arcade session');
 return {hash,nonce:nonce as bigint,deadline:block.timestamp+120n<grant.expires?block.timestamp+120n:grant.expires};
}
