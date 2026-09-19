// Read-only. Advertised terms and bond are not proof that a hosted arena can run.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createPublicClient,http,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
const m=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
const {abi}=JSON.parse(await readFile('node_modules/@interludelayer-sdk/cli/artifacts/InterludeHub.sol/InterludeHub.json','utf8'));
const c=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
assert.equal(await c.getChainId(),10143);
const hub=m.hub as Address,block=await c.getBlock();
const validator=await c.readContract({address:hub,abi,functionName:'defaultValidator',blockNumber:block.number}) as Address;
const [terms,bond]=await Promise.all([
 c.readContract({address:hub,abi,functionName:'termsOf',args:[validator],blockNumber:block.number}),
 c.readContract({address:hub,abi,functionName:'bondOf',args:[validator],blockNumber:block.number}),
]) as [any,[bigint,bigint]];
const report={at:new Date().toISOString(),hub,validator,block:block.number,blockGasLimit:block.gasLimit,
 terms:{open:terms.open,maxDelegations:terms.maxDelegations,stakePerDelegation:terms.stakePerDelegation,delegationFee:terms.delegationFee,
  maxDelegationDuration:terms.maxDelegationDuration,challengeWindow:terms.challengeWindow,maxBatchInterval:terms.maxBatchInterval,maxDiffsPerCommit:terms.maxDiffsPerCommit},
 bond:{total:bond[0],reserved:bond[1],unreserved:bond[0]-bond[1]},
 qualified:false,note:'Terms and available bond only; live hosted admissions and maximum-duration publication/release still require qualification.'};
const json=JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2);
await mkdir('artifacts/agents',{recursive:true});await writeFile('artifacts/agents/capacity-terms.json',json);console.log(json);
