import {encodeFunctionData,getAddress,hashTypedData,type Address,type Hex,type LocalAccount,type PublicClient} from 'viem';
import {agentCatalogAbi} from './abi-AgentCatalog';
import {agentChallengesAbi} from './abi-AgentChallenges';
import {abi as familyAbi} from './abi-independent-ArcadeFamily';
import {agentMetadata} from './agents';
import {validateAgentPoolManifest,type AgentPoolManifest} from './agent-pool';
import {validateStrategyRuntime} from './agent-strategy-code';

export const poolRegistrationTypes={StrategyRegistration:[
 {name:'strategy',type:'address'},{name:'creator',type:'address'},{name:'metadata',type:'bytes32'},
 {name:'modes',type:'uint8'},{name:'deadline',type:'uint64'},{name:'nonce',type:'uint256'},
]} as const;
export const poolChallengeTypes={AgentChallenge:[
 {name:'grant',type:'bytes32'},{name:'action',type:'uint8'},{name:'agent',type:'address'},{name:'mode',type:'uint8'},
 {name:'id',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint64'},
]} as const;
export type PreparedPoolCall={to:Address;data:Hex;digest:Hex;deadline:bigint;nonce:bigint};
type Signer=Pick<LocalAccount,'address'|'signTypedData'>;

/** Produces a signed, contract-verifiable intent, not a transaction. Pass it to
 * the sponsored writer or your own transaction journal. Keep an uncertain call
 * until its digest/nonces have been reconciled; do not silently sign another. */
export async function preparePoolRegistration(client:PublicClient,manifest:AgentPoolManifest,creator:Signer,
 options:{strategy:Address;name:string;avatar:number;modes:1|2|3}):Promise<PreparedPoolCall>{
 const m=validateAgentPoolManifest(manifest),block=await client.getBlock();
 if(await client.getChainId()!==10143)throw Error('Registration requires Monad Testnet');
 if(![1,2,3].includes(options.modes))throw Error('Choose Classic, Chaos or both modes');
 const strategy=getAddress(options.strategy);
 validateStrategyRuntime(await client.getCode({address:strategy,blockNumber:block.number}));
 const claimed=await client.readContract({address:strategy,abi:[{type:'function',name:'creator',stateMutability:'view',inputs:[],outputs:[{type:'address'}]}],functionName:'creator',blockNumber:block.number});
 if(claimed.toLowerCase()!==creator.address.toLowerCase())throw Error('The strategy creator differs from this signing account');
 const nonce=await client.readContract({address:m.catalog,abi:agentCatalogAbi,functionName:'nonces',args:[creator.address],blockNumber:block.number});
 const registration={strategy,creator:creator.address,metadata:agentMetadata(options.name,options.avatar),modes:options.modes,deadline:block.timestamp+300n,nonce};
 const typed={domain:{name:'PONGIT Agent Catalog',version:'1',chainId:10143,verifyingContract:m.catalog},types:poolRegistrationTypes,primaryType:'StrategyRegistration' as const,message:registration};
 const digest=hashTypedData(typed),onchain=await client.readContract({address:m.catalog,abi:agentCatalogAbi,functionName:'digest',args:[registration],blockNumber:block.number});
 if(digest!==onchain)throw Error('Registration domain differs from the deployed catalogue');
 const signature=await creator.signTypedData(typed);
 return {to:m.catalog,data:encodeFunctionData({abi:agentCatalogAbi,functionName:'register',args:[registration,signature]}),digest,nonce,deadline:registration.deadline};
}
export async function preparePoolChallenge(client:PublicClient,manifest:AgentPoolManifest,key:Signer,player:Address,
 options:{agent:Address;mode:0|1;cancel?:bigint}):Promise<PreparedPoolCall>{
 const m=validateAgentPoolManifest(manifest),block=await client.getBlock();
 if(await client.getChainId()!==10143)throw Error('Challenges require Monad Testnet');
 if(![0,1].includes(options.mode)||options.cancel!==undefined&&options.cancel<1n)throw Error('Invalid challenge mode or cancellation reference');
 const family=await client.readContract({address:m.family,abi:familyAbi,functionName:'grantOf',args:[player],blockNumber:block.number});
 if(family.key.toLowerCase()!==key.address.toLowerCase()||family.expires<=block.timestamp)throw Error('Renew arcade session');
 const grant=await client.readContract({address:m.family,abi:familyAbi,functionName:'grantDigest',args:[family],blockNumber:block.number});
 const nonce=await client.readContract({address:m.challenges,abi:agentChallengesAbi,functionName:'nonces',args:[grant],blockNumber:block.number});
 const deadline=block.timestamp+120n<family.expires?block.timestamp+120n:family.expires;
 const message={grant,action:options.cancel===undefined?1:2,agent:getAddress(options.agent),mode:options.mode,id:options.cancel??0n,nonce,deadline};
 const typed={domain:{name:'PONGIT Agent Challenges',version:'1',chainId:10143,verifyingContract:m.challenges},types:poolChallengeTypes,primaryType:'AgentChallenge' as const,message};
 const digest=hashTypedData(typed),onchain=await client.readContract({address:m.challenges,abi:agentChallengesAbi,functionName:'digest',
  args:[grant,message.action,message.agent,message.mode,message.id,nonce,deadline],blockNumber:block.number});
 if(digest!==onchain)throw Error('Challenge domain differs from the deployed queue');
 const signature=await key.signTypedData(typed);
 return {to:m.challenges,data:encodeFunctionData({abi:agentChallengesAbi,functionName:'command',args:[player,message.action,message.agent,message.mode,message.id,nonce,deadline,signature]}),digest,nonce,deadline};
}
