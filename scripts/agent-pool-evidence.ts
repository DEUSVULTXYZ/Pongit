// Read-only public evidence. The deployment source can contain a private engine
// key: serialize only these explicit fields, never the source record itself.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createPublicClient,http,keccak256,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {pooledAgentArenaAbi as arenaAbi} from '../shared/abi-PooledAgentArena';
import {agentArenaPoolAbi as poolAbi} from '../shared/abi-AgentArenaPool';
import {readHubDelegation} from '../shared/rooms-hub';
import {AgentPoolReader,poolJson} from '../relayer/src/agents/pool-read';
import type {AgentPoolManifest} from '../shared/agent-pool';

const source=JSON.parse(await readFile(process.env.PONG_AGENT_POOL_DEPLOYMENT!,'utf8'));
const humanApps=(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean);assert(humanApps.length);
const manifest:AgentPoolManifest={version:2,chainId:10143,engineChainId:4242,rulesVersion:10,...source.common,
 arenas:source.arenas.map((a:{app:Address;runtimeHash:`0x${string}`})=>({app:a.app,runtimeHash:a.runtimeHash,node:`https://il-${a.app.slice(2,18).toLowerCase()}.fly.dev`})),
 enabled:false,tournamentsEnabled:false,verifiedCapacity:0,qualificationEvidence:null,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
// This one-off collector shares the public Monad endpoint with active services.
// Serial starts cap its own traffic at 2.5 requests/s, including historical pages.
let nextRead=0,readLane:Promise<unknown>=Promise.resolve();
const pacedFetch:typeof fetch=(input,init)=>{
 const work=readLane.then(async()=>{
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,nextRead-Date.now())));
  nextRead=Date.now()+400;return fetch(input,init);
 });readLane=work.catch(()=>{});return work;
};
const base=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:15,batchSize:8192}},transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000,fetchFn:pacedFetch})}),reader=new AgentPoolReader(base,manifest,humanApps);
assert.equal(await base.getChainId(),10143);
const block=await base.getBlock();
const arenas=await Promise.all(manifest.arenas.map(async arena=>{
 const [binding,d,code]=await Promise.all([
  base.readContract({address:arena.app,abi:arenaAbi,functionName:'boundMatch',blockNumber:block.number}),
  readHubDelegation(base,manifest.hub,arena.app,block.number),base.getCode({address:arena.app,blockNumber:block.number}),
 ]);
 assert(code&&keccak256(code)===arena.runtimeHash);
 const ref={chainId:10143n,arena:arena.app,epoch:binding.epoch,id:binding.id};
 const record=binding.id?await base.readContract({address:manifest.pool,abi:poolAbi,functionName:'record',args:[ref],blockNumber:block.number}):null;
 const result=record?.captured?await base.readContract({address:manifest.pool,abi:poolAbi,functionName:'result',args:[ref],blockNumber:block.number}):null;
 return{app:arena.app,runtimeHash:arena.runtimeHash,ref:binding.id?{chainId:10143,app:arena.app,epoch:String(binding.epoch),id:String(binding.id)}:null,
  mode:binding.mode,status:d.status,epoch:String(d.epoch),batches:String(d.batchIndex),expiresAt:String(d.expiresAt),releaseAt:String(d.stakeUnlockAt),
  result:result?{hash:result.hash,status:result.status,a:result.a,b:result.b,winner:result.winner,scoreA:result.scoreA,scoreB:result.scoreB,elapsedUs:String(result.elapsedUs),finality:result.finality}:null};
}));
assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash);
const [config,catalogue,tournaments]=await Promise.all([reader.config(),reader.catalog(0n,32),reader.tournaments()]);
const transactionHashes=(process.env.PONG_POOL_RECEIPTS??'').split(',').filter(Boolean);
assert(transactionHashes.length<=32&&transactionHashes.every(h=>/^0x[\da-f]{64}$/i.test(h)));
const transactions=[];
for(const hash of transactionHashes){const receipt=await base.getTransactionReceipt({hash:hash as `0x${string}`});
 transactions.push({hash:receipt.transactionHash,status:receipt.status,block:String(receipt.blockNumber),gasUsed:String(receipt.gasUsed),feeWei:String(receipt.gasUsed*receipt.effectiveGasPrice)});
}
const history=[];
if(process.env.PONG_POOL_HISTORY_REPORT){
 const prior=JSON.parse(await readFile(process.env.PONG_POOL_HISTORY_REPORT,'utf8'));assert(Array.isArray(prior.arenas)&&prior.arenas.length<=32);
 for(const row of prior.arenas)if(row.ref){const value=(await reader.match(row.ref)).value;
  assert(!value.result||value.node===null);history.push(value);
 }
}
const report={at:new Date().toISOString(),kind:'read-only-hosted-pool-evidence',block:String(block.number),blockHash:block.hash,
 pool:manifest.pool,common:manifest,arenas,config:config.value,catalogue:catalogue.value,tournaments:tournaments.value,transactions,history,
 scope:'Initial private hosted qualification. Not a passing 24-hour trial or public capacity qualification.'};
const file=process.env.PONG_AGENT_POOL_REPORT!;assert(file);await mkdir(dirname(file),{recursive:true});await writeFile(file,poolJson(report)+'\n');
console.log(poolJson({at:report.at,block:report.block,arenas:arenas.map(a=>({app:a.app,status:a.status,epoch:a.epoch,batches:a.batches,result:a.result&&{score:[a.result.scoreA,a.result.scoreB],elapsedUs:a.result.elapsedUs,finality:a.result.finality}})),public:config.value.enabled}));
