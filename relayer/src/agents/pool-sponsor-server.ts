// Production sponsor for already reviewed pool contracts. No engine key. Shares
// il_lifecycle_jobs and advisory lock 701340 with the existing Monad writer.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient, http,keccak256,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {validateAgentPoolManifest,agentPoolReleaseEvidence} from '../../../shared/agent-pool';
import {measuredFetch} from '../../../shared/rpc-metrics';
import {independentWriter} from '../independent-writer';
import {AgentPoolReader} from './pool-read';
import {poolSponsorRoutes} from './pool-sponsor';
import {startPoolReadService} from './pool-server';
import {agentMetrics} from './metrics';
import {validatePoolSignedCall,strictPoolAdmissionEstimates,POOL_ADMISSION_BATCH,POOL_ADMISSION_BATCH_HASH} from '../../../shared/agent-pool-sponsor';
import {validateAgentSponsorRuntime} from '../../../shared/agent-sponsor-runtime';
import {reusableAgentPoolAbi} from '../../../shared/abi-ReusableAgentPool';

assert.equal(process.getuid?.(), 1000);
const humans = (process.env.PONG_HUMAN_APPS ?? '').split(',').filter(Boolean); assert(humans.length);
const manifest = validateAgentPoolManifest(JSON.parse(await readFile('/metadata/manifest.json', 'utf8')), humans);
const exposure=validateAgentSponsorRuntime(manifest,process.env.PONG_AGENT_POOL_SPONSOR,
 process.env.PONG_REUSABLE_AGENT_RUNTIME,process.env.PONG_AGENT_POOL_RELEASE_EVIDENCE);
if(!exposure.public)assert.equal(process.env.PONG_AGENT_PRIVATE_NETWORK,'1','Private sponsor requires an isolated network');
const metrics = await agentMetrics(manifest.version>=4?'/diagnostics/reusable':'/diagnostics/series', 'sponsor');
const base = createPublicClient({chain: monadTestnet, batch: {multicall: {wait: 15, batchSize: 8192}},
  transport: http(process.env.RPC_URL, {timeout: 10000, retryCount: 0, fetchFn: measuredFetch('monad')})});
assert.equal(await base.getChainId(), 10143);
if(manifest.version===5){
 const code=await base.getCode({address:POOL_ADMISSION_BATCH});
 assert(code&&keccak256(code)===POOL_ADMISSION_BATCH_HASH,'Atomic admission runtime differs');
}
const reader = new AgentPoolReader(base, manifest, humans);
const db = new Pool({connectionString: process.env.DATABASE_URL});
const journal=process.env.OPERATOR_DATABASE_URL?new Pool({connectionString:process.env.OPERATOR_DATABASE_URL}):db;
const scope=manifest.version===5?{
 keyFile:process.env.PONG_AGENT_SPONSOR_KEY_FILE!,address:process.env.PONG_AGENT_SPONSOR_ADDRESS! as Address,
 allowCall:(to:Address,data:`0x${string}`,value:bigint)=>{assert.equal(value,0n);validatePoolSignedCall(manifest,{to,data});},
 strictEstimate:(to:Address,data:`0x${string}`,value:bigint)=>{assert.equal(value,0n);return strictPoolAdmissionEstimates(manifest,{to,data}).map(call=>({...call,value}));},
}:undefined;
const writer = await independentWriter(db, base,journal,scope,{eager:manifest.version===5});
const service = await startPoolReadService(reader, {host: process.env.HOST ?? '0.0.0.0', port: 4102, public: exposure.public,
  sponsorHealth:writer.status,
  sponsor: poolSponsorRoutes(manifest, writer, async () => exposure.public?(await reader.config()).value.enabled:
   base.readContract({address:manifest.pool,abi:reusableAgentPoolAbi,functionName:'admissions'})),
  trustedProxies: (process.env.PONG_AGENT_POOL_TRUSTED_PROXIES ?? '').split(',').filter(Boolean)});
let stopping = false;
const stop = () => {if (stopping) return; stopping = true; void service.close().finally(async () => {await writer.close(); await db.end(); if(journal!==db)await journal.end();await metrics();});};
process.once('SIGTERM', stop); process.once('SIGINT', stop);
