import {encodeFunctionData,hashTypedData,isAddress,type Address,type Hex,type LocalAccount,type PublicClient} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {abi as familyAbi} from './abi-independent-ArcadeFamily';
import {familyGrantTypes,type FamilyGrant} from './independent';
import {validateAgentPoolManifest,type AgentPoolManifest} from './agent-pool';
import type {PoolSessionStorage,PoolSignedCall} from './agent-pool-sponsor';

export type PoolFamilySession={grant:FamilyGrant;key:Hex;signature:Hex};
type Owner=Pick<LocalAccount,'address'|'signTypedData'>;
const scope=(m:AgentPoolManifest,player:Address)=>`pongit:agent-family:${m.family.toLowerCase()}:${player.toLowerCase()}`;

/** Uses sessionStorage in browsers. Owner/passkey material is never persisted;
 * only the two-hour arcade key and its explicit owner authorization are saved. */
export function loadPoolFamily(m:AgentPoolManifest,player:Address,storage:PoolSessionStorage):PoolFamilySession|null{
 const raw=storage.getItem(scope(m,player));if(!raw)return null;
 try{
  const s=JSON.parse(raw),g=s.grant;
  if(!isAddress(g.player)||g.player.toLowerCase()!==player.toLowerCase()||!isAddress(g.key)||!/^0x[\da-f]{64}$/i.test(s.key)
   ||privateKeyToAccount(s.key).address.toLowerCase()!==g.key.toLowerCase()||!/^0x[\da-f]{130}$/i.test(s.signature))throw Error();
  for(const k of ['issuedAt','expires','revision'])if(typeof g[k]!=='string'||!/^\d{1,78}$/.test(g[k]))throw Error();
  const grant={...g,issuedAt:BigInt(g.issuedAt),expires:BigInt(g.expires),revision:BigInt(g.revision)};
  if(grant.expires>2n**64n-1n||grant.issuedAt>=grant.expires||grant.expires-grant.issuedAt>7200n||grant.revision>2n**256n-1n)throw Error();
  return{grant,key:s.key,signature:s.signature};
 }catch{throw Error('Saved arcade authorization is invalid. Its pending actions must be reconciled before replacement.');}
}
export function poolFamilyCall(m:AgentPoolManifest,s:PoolFamilySession):PoolSignedCall{
 return{to:m.family,data:encodeFunctionData({abi:familyAbi,functionName:'register',args:[s.grant,s.signature]})};
}
export async function observePoolFamily(client:PublicClient,m:AgentPoolManifest,s:PoolFamilySession){
 if(await client.getChainId()!==10143)throw Error('Arcade authorizations require Monad Testnet');
 const block=await client.getBlock(),grant=await client.readContract({address:m.family,abi:familyAbi,functionName:'grantOf',args:[s.grant.player],blockNumber:block.number});
 if((await client.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Arcade authorization changed during synchronization');
 return {active:grant.player.toLowerCase()===s.grant.player.toLowerCase()&&grant.key.toLowerCase()===s.grant.key.toLowerCase()
  &&grant.issuedAt===s.grant.issuedAt&&grant.expires===s.grant.expires&&grant.revision===s.grant.revision&&grant.expires>block.timestamp,block};
}

/** Call only after reconciling the sponsor journal. Missing node/RPC replies
 * throw before any signing and preserve the key. A saved still-valid signed
 * grant is retried exactly after a page reload, not silently re-keyed. */
/** A match must never outlive its authorization. Renew at a natural pause (the
 * lobby or the result screen) once less than this remains: it covers the arena
 * wait, the countdown and a full match with overtime. */
export const SESSION_RENEW_MARGIN=1200n;
export const familyExpiresSoon=(s:PoolFamilySession,now:bigint,margin=SESSION_RENEW_MARGIN)=>s.grant.expires-now<margin;

export async function preparePoolFamily(client:PublicClient,m:AgentPoolManifest,owner:Owner,storage:PoolSessionStorage,options:{renewWithin?:bigint}={}){
 m=validateAgentPoolManifest(m);
 if(await client.getChainId()!==10143)throw Error('Arcade authorizations require Monad Testnet');
 const existing=loadPoolFamily(m,owner.address,storage),block=await client.getBlock();
 const revision=await client.readContract({address:m.family,abi:familyAbi,functionName:'revisions',args:[owner.address],blockNumber:block.number});
 if(existing){
  const observed=await client.readContract({address:m.family,abi:familyAbi,functionName:'grantOf',args:[owner.address],blockNumber:block.number});
  if((await client.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Arcade authorization changed during synchronization');
  // Asked to renew near the end: a fresh consent replaces a grant that could
  // otherwise expire in the middle of the next match. Never done silently.
  const ending=options.renewWithin!==undefined&&existing.grant.expires-block.timestamp<options.renewWithin;
  if(!ending&&observed.player.toLowerCase()===owner.address.toLowerCase()&&observed.key.toLowerCase()===existing.grant.key.toLowerCase()
   &&observed.issuedAt===existing.grant.issuedAt&&observed.expires===existing.grant.expires&&observed.revision===existing.grant.revision&&observed.expires>block.timestamp)
   return{session:existing,call:null};
  if(!ending&&existing.grant.expires>block.timestamp&&existing.grant.revision===revision
   &&(observed.key==='0x0000000000000000000000000000000000000000'||observed.issuedAt<existing.grant.issuedAt)){
   // Still-valid unregistered consent survives a failed POST or F5. A proven
   // newer authorization on another device instead requires fresh owner consent.
   return{session:existing,call:poolFamilyCall(m,existing)};
  }
 }
 const key=generatePrivateKey(),grant:FamilyGrant={player:owner.address,key:privateKeyToAccount(key).address,issuedAt:block.timestamp,expires:block.timestamp+7200n,revision};
 const typed={domain:{name:'PONGIT Arcade Family',version:'1',chainId:10143,verifyingContract:m.family},types:familyGrantTypes,primaryType:'ArcadeFamilyGrant' as const,message:grant};
 const digest=await client.readContract({address:m.family,abi:familyAbi,functionName:'grantDigest',args:[grant],blockNumber:block.number});
 if(digest!==hashTypedData(typed))throw Error('Arcade authorization domain differs from the approved family');
 if((await client.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Arcade authorization changed during synchronization');
 const signature=await owner.signTypedData(typed),session={grant,key,signature};
 storage.setItem(scope(m,owner.address),JSON.stringify(session,(_,v)=>typeof v==='bigint'?String(v):v));
 return{session,call:poolFamilyCall(m,session)};
}
