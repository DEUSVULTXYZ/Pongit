import {encodeFunctionData,getAddress,hashTypedData,type Address,type Hex,type LocalAccount,type PublicClient} from 'viem';
import {agentCatalogAbi} from './abi-AgentCatalog';
import {agentChallengesAbi} from './abi-AgentChallenges';
import {abi as familyAbi} from './abi-independent-ArcadeFamily';
import {agentMetadata} from './agents';
import {validateAgentPoolManifest,type AgentPoolManifest} from './agent-pool';
import {validateStrategyRuntime} from './agent-strategy-code';
import {admissionPasses,batchPoolChallenge} from './agent-pool-sponsor';
import {familyGrantTypes,type FamilyGrant} from './independent';
import {canonicalContractReads} from './canonical-contract-reads';

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
// A performance hint only, scoped to the tab's client and exact queue/grant.
// Every use still reads the actual nonce at the same canonical block. A lost
// submission, another tab or a reorganisation simply adds the ordinary round.
const challengeNonceHints=new WeakMap<PublicClient,{queue:string;grant:Hex;next:bigint}>();

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
 options:{agent:Address;mode:0|1;cancel?:bigint;expectedFamily?:FamilyGrant;renewWithin?:bigint;checkPending?:boolean;admissionPreflight?:()=>Promise<void>}):Promise<PreparedPoolCall>{
 const m=validateAgentPoolManifest(manifest);
 const [chainId,block]=await Promise.all([client.getChainId(),client.getBlock()]);
 if(chainId!==10143)throw Error('Challenges require Monad Testnet');
 if(!block.hash)throw Error('Challenge authorization has no canonical block');
 const {read}=canonicalContractReads(client,block.hash);
 if(![0,1].includes(options.mode)||options.cancel!==undefined&&options.cancel<1n)throw Error('Invalid challenge mode or cancellation reference');
 const expected=options.expectedFamily;
 const familyDigest=(family:FamilyGrant)=>hashTypedData({domain:{name:'PONGIT Arcade Family',version:'1',chainId:10143,verifyingContract:m.family},types:familyGrantTypes,primaryType:'ArcadeFamilyGrant',message:family});
 const expectedGrant=expected?familyDigest(expected):undefined;
 const hint=challengeNonceHints.get(client);
 const anticipatedNonce=expectedGrant&&hint?.queue===m.challenges.toLowerCase()&&hint.grant===expectedGrant?hint.next:0n;
 const action=options.cancel===undefined?1:2,agent=getAddress(options.agent),id=options.cancel??0n;
 const anticipatedDeadline=expected?(block.timestamp+120n<expected.expires?block.timestamp+120n:expected.expires):0n;
 // A saved grant lets its domain and nonce checks share the first canonical
 // read. None is trusted until grantOf agrees field-for-field below.
 const [family,count,pending,expectedDomain,expectedNonce,anticipatedDigest]=await Promise.all([
  read(m.family,familyAbi,'grantOf',[player]),
  // The rules17 continuation queue scans only its waiting ring. Historical
  // completed requests no longer need extra admission passes. Keep legacy
  // sizing for old contracts; a full/busy ring still resumes through the keeper.
  m.challengeAdmission==='atomic-v1'&&options.cancel===undefined&&m.rulesVersion!==17?
   read<bigint>(m.challenges,agentChallengesAbi,'count'):Promise.resolve(0n),
  options.checkPending&&options.cancel===undefined?read<bigint>(m.challenges,agentChallengesAbi,'pending',[player]):Promise.resolve(0n),
  expected?read<Hex>(m.family,familyAbi,'grantDigest',[expected]):Promise.resolve(undefined),
  expectedGrant?read<bigint>(m.challenges,agentChallengesAbi,'nonces',[expectedGrant]):Promise.resolve(undefined),
  expectedGrant?read<Hex>(m.challenges,agentChallengesAbi,'digest',
   [expectedGrant,action,agent,options.mode,id,anticipatedNonce,anticipatedDeadline]):Promise.resolve(undefined),
 ]);
 if(pending!==0n)throw Object.assign(Error('Resume the existing challenge'),{code:'POOL_CHALLENGE_PENDING',id:pending});
 // Availability is advisory and independent of the canonical grant reads.
 // A caller may start that read concurrently, but it must finish before a
 // renewal prompt or any signature. It can only deny, never grant authority.
 await options.admissionPreflight?.();
 const active=family.player.toLowerCase()===player.toLowerCase()&&family.key.toLowerCase()===key.address.toLowerCase()&&family.expires>block.timestamp
  &&(!expected||family.player.toLowerCase()===expected.player.toLowerCase()&&family.key.toLowerCase()===expected.key.toLowerCase()
   &&family.issuedAt===expected.issuedAt&&family.expires===expected.expires&&family.revision===expected.revision);
 if(options.renewWithin!==undefined&&(options.renewWithin<0n||options.renewWithin>7200n||options.cancel!==undefined))throw Error('Invalid challenge renewal margin');
 // This same canonical observation supplies both the renewal decision and the
 // signed challenge. Do not read the family twice on the catalogue click.
 if(!active||options.renewWithin!==undefined&&family.expires-block.timestamp<options.renewWithin)
  throw Object.assign(Error('Renew arcade session'),{code:'POOL_FAMILY_RENEW',active});
 // Computing the expected digest allows the nonce and domain checks to travel
 // together. No signature is requested unless the deployed family agrees.
 const grant=familyDigest(family);
 const [observedGrant,nonce]=expected?[expectedDomain!,expectedNonce!]:await Promise.all([
  read<Hex>(m.family,familyAbi,'grantDigest',[family]),
  read<bigint>(m.challenges,agentChallengesAbi,'nonces',[grant]),
 ]);
 if(grant!==observedGrant)throw Error('Arcade authorization domain differs from the approved family');
 const deadline=block.timestamp+120n<family.expires?block.timestamp+120n:family.expires;
 const message={grant,action,agent,mode:options.mode,id,nonce,deadline};
 const typed={domain:{name:'PONGIT Agent Challenges',version:'1',chainId:10143,verifyingContract:m.challenges},types:poolChallengeTypes,primaryType:'AgentChallenge' as const,message};
 // Reuse a prefetched digest only when ALL its inputs match the observed
 // message. Never replace domain verification with an assumed local hash.
 const digest=hashTypedData(typed),onchain=expectedGrant===grant&&nonce===anticipatedNonce&&deadline===anticipatedDeadline
  ?anticipatedDigest:await read<Hex>(m.challenges,agentChallengesAbi,'digest',
   [grant,message.action,message.agent,message.mode,message.id,nonce,deadline]);
 if(digest!==onchain)throw Error('Challenge domain differs from the deployed queue');
 const signature=await key.signTypedData(typed);
 challengeNonceHints.set(client,{queue:m.challenges.toLowerCase(),grant,next:nonce+1n});
 const call=batchPoolChallenge(m,{to:m.challenges,data:encodeFunctionData({abi:agentChallengesAbi,functionName:'command',args:[player,message.action,message.agent,message.mode,message.id,nonce,deadline,signature]})},admissionPasses(count+1n));
 return {...call,digest,nonce,deadline};
}
