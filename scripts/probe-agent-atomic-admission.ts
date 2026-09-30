// Read-only qualification: two existing calls in one EVM simulation. This
// script has no wallet/transaction sender and never saves private call data.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,decodeFunctionResult,multicall3Abi,keccak256,type Address,type PublicClient} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {loadPoolFamily} from '../shared/agent-pool-family';
import {preparePoolChallenge} from '../shared/agent-pool-client';
import {agentCatalogAbi} from '../shared/abi-AgentCatalog';
import {agentChallengesAbi} from '../shared/abi-AgentChallenges';
import {reusableAgentPoolAbi} from '../shared/abi-ReusableAgentPool';

const out=process.argv[2],privatePath=process.env.PONG_ATOMIC_PROBE_PRIVATE_PATH;
assert(out);assert(privatePath);assert(privatePath.includes('private-backups'));
const report:any={at:new Date().toISOString(),readOnly:true,transactionSubmitted:false,passed:false};
const multi='0xcA11bde05977b3631167028862bE2a173976CA11' as const;
try{
 const m=validateAgentPoolManifest(await (await fetch('https://pongit.xyz/api/agents/config')).json());
 assert.equal(m.version,5);
 const saved=JSON.parse(await readFile(privatePath,'utf8'));
 const prefix=`pongit:agent-family:${m.family.toLowerCase()}:`;
 const entry=Object.keys(saved.session).find(k=>k.startsWith(prefix));assert(entry);
 const player=entry.slice(prefix.length) as Address;
 const session=loadPoolFamily(m,player,{getItem:k=>saved.session[k]??null,setItem:()=>{throw Error('Read only');},removeItem:()=>{throw Error('Read only');}});assert(session);
 const base=createPublicClient({chain:monadTestnet,transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:12000,
  onFetchRequest(request,init){const body=JSON.parse(String(init?.body));assert(!Array.isArray(body)&&['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call','eth_estimateGas'].includes(body.method),'Read-only RPC allowlist');}})});
 assert.equal(await base.getChainId(),10143);
 const block=await base.getBlock();report.block=block.number;report.blockHash=block.hash;report.pool=m.pool;
 assert(session.grant.expires>block.timestamp+120n,'Synthetic grant expired');
 const agent=await base.readContract({address:m.catalog,abi:agentCatalogAbi,functionName:'house',args:[0n],blockNumber:block.number});
 const pinned={...base,getBlock:async()=>block} as PublicClient;
 const call=await preparePoolChallenge(pinned,m,privateKeyToAccount(session.key),player,{agent,mode:0});
 const code=await base.getCode({address:multi,blockNumber:block.number});assert(code&&code!=='0x');report.multicall={address:multi,runtimeHash:keccak256(code)};
 const calls=[{target:call.to,allowFailure:false,callData:call.data},{target:m.pool,allowFailure:false,
  callData:encodeFunctionData({abi:reusableAgentPoolAbi,functionName:'admitChallenge'})}];
 const data=encodeFunctionData({abi:multicall3Abi,functionName:'aggregate3',args:[calls]});
 const response=await base.call({account:player,to:multi,data,blockNumber:block.number,gas:15_000_000n});assert(response.data);
 const result=decodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',data:response.data});assert(result.every(r=>r.success));
 const request=decodeFunctionResult({abi:agentChallengesAbi,functionName:'command',data:result[0].returnData});
 const ref=decodeFunctionResult({abi:reusableAgentPoolAbi,functionName:'admitChallenge',data:result[1].returnData});
 report.request=String(request);report.simulatedRef=ref;report.assigned=ref.id>0n;
 report.strictGas=await base.estimateGas({account:player,to:multi,data,blockNumber:block.number});
 const loose=encodeFunctionData({abi:multicall3Abi,functionName:'aggregate3',args:[[calls[0],{...calls[1],allowFailure:true}]]});
 report.bestEffortGas=await base.estimateGas({account:player,to:multi,data:loose,blockNumber:block.number});
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash,'Observation reorganized');
 report.passed=report.assigned;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,200);process.exitCode=1;}
await writeFile(out,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v));
