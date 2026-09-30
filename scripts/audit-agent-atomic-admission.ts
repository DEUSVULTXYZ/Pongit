// Canonical public transaction evidence; never serialize calldata/signatures.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createPublicClient,http,decodeEventLog,decodeFunctionData,multicall3Abi,type Hex} from 'viem';
import {monadTestnet} from 'viem/chains';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {validatePoolSignedCall,POOL_ADMISSION_BATCH} from '../shared/agent-pool-sponsor';
import {agentChallengesAbi} from '../shared/abi-AgentChallenges';
import {reusableAgentPoolAbi} from '../shared/abi-ReusableAgentPool';
const [hash,out]=process.argv.slice(2);assert(/^0x[\da-f]{64}$/i.test(hash)&&out);
const base=createPublicClient({chain:monadTestnet,transport:http('https://testnet-rpc.monad.xyz',{retryCount:0})});
const m=validateAgentPoolManifest(await (await fetch('https://pongit.xyz/api/agents/config')).json());
const [tx,r]=await Promise.all([base.getTransaction({hash:hash as Hex}),base.getTransactionReceipt({hash:hash as Hex})]);
assert.equal(r.status,'success');assert.equal(tx.to?.toLowerCase(),POOL_ADMISSION_BATCH.toLowerCase());
assert.equal(tx.value,0n);assert.equal(tx.chainId,10143);validatePoolSignedCall(m,{to:tx.to,data:tx.input});
const batch=decodeFunctionData({abi:multicall3Abi,data:tx.input});assert.equal(batch.functionName,'aggregate3');
if(batch.functionName!=='aggregate3')throw Error();
const command=decodeFunctionData({abi:agentChallengesAbi,data:batch.args[0][0].callData});assert.equal(command.functionName,'command');
if(command.functionName!=='command')throw Error();
const [player,,agent,mode]=command.args;
const changes=r.logs.filter(l=>l.address.toLowerCase()===m.challenges.toLowerCase()).flatMap(l=>{
 try{const e=decodeEventLog({abi:agentChallengesAbi,data:l.data,topics:l.topics});return e.eventName==='ChallengeChanged'?[e.args]:[];}catch{return [];}
});
const assignments=r.logs.filter(l=>l.address.toLowerCase()===m.pool.toLowerCase()).flatMap(l=>{
 try{const e=decodeEventLog({abi:reusableAgentPoolAbi,data:l.data,topics:l.topics});return e.eventName==='Assigned'?[e.args]:[];}catch{return [];}
});
assert.equal(changes.length,2);assert.equal(assignments.length,1);
assert.equal(changes[0].status,1);assert.equal(changes[1].status,2);assert.equal(changes[0].id,changes[1].id);
assert(changes.every(c=>c.player.toLowerCase()===player.toLowerCase()&&c.agent.toLowerCase()===agent.toLowerCase()));
const a=assignments[0];assert.equal(a.tournament,0n);assert(a.lane>0&&a.lane<5);
const request=await base.readContract({address:m.challenges,abi:agentChallengesAbi,functionName:'requests',args:[changes[0].id],blockNumber:r.blockNumber});
assert.equal(request[2],mode);assert.equal(request[3],2);
assert.equal((await base.getBlock({blockNumber:r.blockNumber})).hash,r.blockHash,'Receipt reorganized');
const report={at:new Date().toISOString(),passed:true,readOnly:true,transaction:r.transactionHash,block:r.blockNumber,blockHash:r.blockHash,
 request:changes[0].id,player,agent,mode,assignment:a,gasUsed:r.gasUsed,effectiveGasPrice:r.effectiveGasPrice,
 scope:'Signed request and same-player assignment in one canonical Monad transaction; no extra admission transaction required. No full-game or latency claim.'};
await writeFile(out,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v));
