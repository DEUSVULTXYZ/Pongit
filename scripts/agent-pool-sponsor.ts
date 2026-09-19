// Private integration harness. Not a public admission switch. The reader-only
// service does not load this module or any operator key.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http} from 'viem';
import {monadTestnet} from 'viem/chains';
import {independentWriter} from '../relayer/src/independent-writer';
import {poolSponsorRoutes} from '../relayer/src/agents/pool-sponsor';
import {startPoolReadService} from '../relayer/src/agents/pool-server';
import {AgentPoolReader} from '../relayer/src/agents/pool-read';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';

assert.equal(process.env.PONG_AGENT_POOL_SPONSOR,'isolated-qualification');
const humanApps=(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean);assert(humanApps.length);
const client=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:15,batchSize:8192}},transport:http(process.env.RPC_URL,{timeout:10000,retryCount:0,fetchFn:measuredFetch('monad')})});
assert.equal(await client.getChainId(),10143);
const reader=new AgentPoolReader(client,JSON.parse(await readFile(process.env.PONG_AGENT_POOL_MANIFEST!,'utf8')),humanApps);
assert(!reader.manifest.enabled,'Private sponsorship must not open public admissions');
const db=new Pool({connectionString:process.env.DATABASE_URL});
const metrics=await agentMetrics('/diagnostics/pool','sponsor'),writer=await independentWriter(db,client);
const service=await startPoolReadService(reader,{host:process.env.HOST??'127.0.0.1',port:Number(process.env.PORT??4102),public:false,
 sponsor:poolSponsorRoutes(reader.manifest,writer,async()=>process.env.PONG_AGENT_POOL_PRIVATE_CHALLENGES==='authorized-testnet'),
 trustedProxies:(process.env.PONG_AGENT_POOL_TRUSTED_PROXIES??'').split(',').filter(Boolean)});
process.once('SIGTERM',()=>void service.close().finally(async()=>{writer.stop();await db.end();await metrics();}));
