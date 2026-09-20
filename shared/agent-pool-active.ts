import {encodeFunctionData,hashTypedData,type Address,type Hex,type LocalAccount,type PublicClient} from 'viem';
import {pooledAgentArenaAbi} from './abi-PooledAgentArena';
import {reusableAgentArenaAbi} from './abi-ReusableAgentArena';
export const poolRenewTypes={RenewArena:[{name:'player',type:'address'},{name:'key',type:'address'},{name:'epoch',type:'uint256'},{name:'matchId',type:'uint256'},{name:'revision',type:'uint256'},{name:'expires',type:'uint64'},{name:'deadline',type:'uint64'}]} as const;
export const poolRevokeTypes={RevokeArena:[{name:'player',type:'address'},{name:'epoch',type:'uint256'},{name:'matchId',type:'uint256'},{name:'revision',type:'uint256'},{name:'deadline',type:'uint64'}]} as const;
/** The caller verifies hub/node identity and bytecode first. Only the owner signs
 * this permission; a family key cannot grant itself a renewed arena permission. */
export async function preparePoolActive(node:PublicClient,app:Address,ref:{epoch:bigint;id:bigint},owner:Pick<LocalAccount,'address'|'signTypedData'>,
 action:{kind:'revoke'}|{kind:'renew';key:Address;expires:bigint},reusable=false):Promise<Hex>{
 const abi=reusable?reusableAgentArenaAbi:pooledAgentArenaAbi;
 const block=await node.getBlock(),revision=await node.readContract({address:app,abi,functionName:'authorizationRevision',args:[owner.address],blockNumber:block.number});
 const domain={name:reusable?'PONGIT Reusable Arena':'PONGIT Pooled Arena',version:'1',chainId:10143,verifyingContract:app};
 if(action.kind==='renew'){
  if(action.expires<=block.timestamp||action.expires>block.timestamp+7200n)throw Error('Renewed arena permission must last at most two hours');
  const deadline=block.timestamp+120n<action.expires?block.timestamp+120n:action.expires;
  const message={player:owner.address,key:action.key,epoch:ref.epoch,matchId:ref.id,revision,expires:action.expires,deadline};
  const typed={domain,types:poolRenewTypes,primaryType:'RenewArena' as const,message};
  if(await node.readContract({address:app,abi,functionName:'renewalDigest',args:[message],blockNumber:block.number})!==hashTypedData(typed))throw Error('Arena renewal domain differs');
  return encodeFunctionData({abi,functionName:'renewActive',args:[message,await owner.signTypedData(typed)]});
 }
 const deadline=block.timestamp+120n,message={player:owner.address,epoch:ref.epoch,matchId:ref.id,revision,deadline};
 const typed={domain,types:poolRevokeTypes,primaryType:'RevokeArena' as const,message};
 if(await node.readContract({address:app,abi,functionName:'revocationDigest',args:[owner.address,deadline],blockNumber:block.number})!==hashTypedData(typed))throw Error('Arena revocation domain differs');
 const signature=await owner.signTypedData(typed);
 return reusable?encodeFunctionData({abi:reusableAgentArenaAbi,functionName:'revokeActive',args:[ref.epoch,ref.id,owner.address,deadline,signature]})
  :encodeFunctionData({abi:pooledAgentArenaAbi,functionName:'revokeActive',args:[owner.address,deadline,signature]});
}
