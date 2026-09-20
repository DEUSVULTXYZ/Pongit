// Production sponsor for already reviewed pool contracts. No engine key. Shares
// il_lifecycle_jobs and advisory lock 701340 with the existing Monad writer.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient, http} from 'viem';
import {monadTestnet} from 'viem/chains';
import {validateAgentPoolManifest} from '../../../shared/agent-pool';
import {measuredFetch} from '../../../shared/rpc-metrics';
import {independentWriter} from '../independent-writer';
import {AgentPoolReader} from './pool-read';
import {poolSponsorRoutes} from './pool-sponsor';
import {startPoolReadService} from './pool-server';
import {agentMetrics} from './metrics';

assert.equal(process.env.PONG_AGENT_POOL_SPONSOR, 'reviewed-release');
assert.equal(process.getuid?.(), 1000);
const humans = (process.env.PONG_HUMAN_APPS ?? '').split(',').filter(Boolean); assert(humans.length);
const manifest = validateAgentPoolManifest(JSON.parse(await readFile('/metadata/manifest.json', 'utf8')), humans);
assert(manifest.version === 3 && manifest.verifiedCapacity === 2 && manifest.qualificationEvidence && BigInt(manifest.qualificationEvidence) !== 0n);
assert.equal(manifest.qualificationEvidence.toLowerCase(), process.env.PONG_AGENT_POOL_RELEASE_EVIDENCE?.toLowerCase());
const metrics = await agentMetrics('/diagnostics/series', 'sponsor');
const base = createPublicClient({chain: monadTestnet, batch: {multicall: {wait: 15, batchSize: 8192}},
  transport: http(process.env.RPC_URL, {timeout: 10000, retryCount: 0, fetchFn: measuredFetch('monad')})});
assert.equal(await base.getChainId(), 10143);
const reader = new AgentPoolReader(base, manifest, humans);
const db = new Pool({connectionString: process.env.DATABASE_URL}), writer = await independentWriter(db, base);
const service = await startPoolReadService(reader, {host: process.env.HOST ?? '0.0.0.0', port: 4102, public: true,
  sponsor: poolSponsorRoutes(manifest, writer, async () => (await reader.config()).value.enabled),
  trustedProxies: (process.env.PONG_AGENT_POOL_TRUSTED_PROXIES ?? '').split(',').filter(Boolean)});
let stopping = false;
const stop = () => {if (stopping) return; stopping = true; void service.close().finally(async () => {writer.stop(); await db.end(); await metrics();});};
process.once('SIGTERM', stop); process.once('SIGINT', stop);
