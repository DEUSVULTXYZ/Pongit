// Bounded private admission observer. The existing controller owns engine
// nonces and the recovery-only keeper captures results; this driver does neither.
import assert from 'node:assert/strict';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {decodeEventLog, keccak256, type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {agentChallengesAbi as challengeAbi} from '../shared/abi-AgentChallenges';
import {houseInstanceAbi, verifyHouseInstanceAuthorities} from '../shared/agent-house-instances';
import {validateReusableRecord} from '../relayer/src/agents/reusable-runtime';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';

assert.equal(process.getuid?.(), 1000);
assert.equal(process.env.PONG_HOUSE_INSTANCE_QUALIFICATION, 'bounded-private-controllers');
const run = process.env.PONG_HOUSE_INSTANCE_RUN ?? '1';
assert(/^[1-9]$/.test(run));
const count = Number(process.env.PONG_HOUSE_INSTANCE_MATCHES ?? 2);
assert(Number.isInteger(count) && count >= 1 && count <= 4, 'At most four reviewed games per trial');
const r = JSON.parse(await readFile('/secrets/deployment.json', 'utf8'));
validateReusableRecord(r, (process.env.PONG_HUMAN_APPS ?? '').split(',').filter(Boolean));
assert.equal(r.houseInstances, 'official-v1');
const app = process.env.PONG_REUSABLE_CAPACITY_APP as Address;
assert(r.arenas.some((a: any) => a.app.toLowerCase() === app?.toLowerCase()), 'Explicit candidate arena required');
const t = await chainTools(r.prefix + ':house-controllers-' + run, measuredFetch('monad'));
const metrics = await agentMetrics('/diagnostics/reusable', 'house-qualification');
const db = new Pool({connectionString: process.env.AGENT_DATABASE_URL, max: 2});
const m = {...r.common, houseInstances: r.houseInstances};
const read = <T = any>(at: Address, abi: any, name: string, args: readonly unknown[] = []) => t.base.readContract({address: at, abi, functionName: name, args}) as Promise<T>;
const write = (...args: Parameters<typeof t.write>) => retryOperatorContention(() => t.write(...args));
const out = `artifacts/reusable-candidate/house-controllers-${run}.json`;
await mkdir('artifacts/reusable-candidate', {recursive: true});
let report: any = {startedAt: new Date().toISOString(), pool: m.pool, app, source: process.env.PONG_SOURCE_COMMIT,
  requested: count, matches: [], passed: false,
  scope: 'Private real controller qualification and canonical publication only. Not concurrent instances, human controls, release reserve or 24-hour qualification.'};
try {const old = JSON.parse(await readFile(out, 'utf8')); assert(!old.finishedAt, 'Preserve completed verdict');
  assert.equal(old.pool, m.pool); assert.equal(old.app, app); assert.equal(old.requested, count); report = old;
} catch (e) {if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;}
const save = async () => {await writeFile(out + '.next', JSON.stringify(report, (_, v) => typeof v === 'bigint' ? String(v) : v, 2)); await rename(out + '.next', out);};
const deadline = Date.parse(report.startedAt) + count * 15 * 60_000;
const wait = () => new Promise(resolve => setTimeout(resolve, 3000));
try {
  await save();
  await verifyHouseInstanceAuthorities(read, m);
  assert.equal(await read(m.pool, houseInstanceAbi, 'AUTHORITY_VERSION'), 2n);
  assert.equal(await read(m.pool, poolAbi, 'publicAdmissions'), false);
  assert.equal(keccak256((await t.base.getCode({address: app}))!), r.arenas.find((a: any) => a.app === app).runtimeHash);
  assert.equal((await read(m.pool, poolAbi, 'laneRecord', [0])).ref.id, 0n, 'No tournament writer in this trial');
  if (!await read(m.pool, poolAbi, 'admissions')) await write('enable-private-admissions', m.pool, poolAbi, 'setAdmissions', [true]);
  for (let index = 0; index < count; index++) {
    assert(Date.now() < deadline, 'Original qualification deadline expired');
    let row = report.matches[index];
    if (!row) {row = {index, operation: `qualification-${index}`, stage: 'planned'}; report.matches.push(row); await save();}
    if (!row.ref) {
      const job = (await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1', [r.prefix + ':house-controllers-' + run + ':' + row.operation])).rows[0];
      if (!job) {
        const d = await readHubDelegation(t.base, m.hub, app);
        const now = (await t.base.getBlock()).timestamp;
        // A bounded experiment on a nearly fresh epoch, not a fabricated
        // publication budget authorizing continuous service.
        assert(d.status === 1 && d.expiresAt > now + 1200n && d.batchIndex < 2000n, 'Inspect observed epoch reserve before another trial');
        for (const a of r.arenas) if (a.app.toLowerCase() !== app.toLowerCase())
          assert.equal((await readHubDelegation(t.base, m.hub, a.app)).status, 0, 'Only the selected private arena may admit');
        const healthy = (await db.query("SELECT stage,detail FROM agent_pool.health WHERE app=$1 AND updated_at>now()-interval '20 seconds'", [app.toLowerCase()])).rows[0];
        assert(healthy?.stage === 'available' && BigInt(healthy.detail.epoch) === d.epoch, 'Fresh hosted availability required');
        assert.equal((await read(m.pool, poolAbi, 'laneRecord', [1])).ref.id, 0n, 'Existing lane belongs to its original operation');
        if(!await read(m.challenges,challengeAbi,'qualificationsMayStart')){
          // A completed private human challenge still needs the queue's normal
          // scan. Never bypass priority or accidentally admit a waiting person.
          const queued=await read<bigint>(m.challenges,challengeAbi,'count');
          assert(queued<=32n,'Review a larger private queue explicitly');
          for(let id=1n;id<=queued;id++){
            const request=await read(m.challenges,challengeAbi,'requests',[id]);
            assert(request[3]===3||request[3]===4,'A waiting or active human challenge has priority');
          }
          await write(`completed-challenge-scan-${index}`,m.pool,poolAbi,'admitChallenge');
          assert.equal((await read(m.pool,poolAbi,'laneRecord',[1])).ref.id,0n);
          assert.equal(await read(m.challenges,challengeAbi,'qualificationsMayStart'),true);
        }
      }
      const receipt = await write(row.operation, m.pool, poolAbi, 'admitQualification');
      const issued = receipt.logs.filter(l => l.address.toLowerCase() === m.pool.toLowerCase()).map(l => {
        try {return decodeEventLog({abi: poolAbi, topics: l.topics, data: l.data});} catch {return null;}
      }).find(e => e?.eventName === 'AdmissionIssued') as any;
      assert(issued, 'Exact admission receipt required');
      const ticket = issued.args.ticket;
      assert.equal(ticket.arena.toLowerCase(), app.toLowerCase());
      row.ref = {chainId: '10143', arena: app, epoch: String(ticket.epoch), id: String(ticket.matchId)};
      row.hash = receipt.transactionHash; row.admittedAt = new Date().toISOString(); row.stage = 'admitted'; await save();
    }
    const ref = {...row.ref, chainId: 10143n, epoch: BigInt(row.ref.epoch), id: BigInt(row.ref.id)};
    while (Date.now() < deadline) {
      const entry = await read(m.pool, poolAbi, 'record', [ref]);
      if (entry.captured) {
        const result = await read(m.pool, poolAbi, 'result', [ref]);
        assert.equal(result.status, 3, 'Canceled match is not a passed controller trial');
        const identities = await Promise.all([entry.a, entry.b].map(a => read(m.catalog, catalogAbi, 'identity', [a])));
        assert(identities.every(i => i.qualified & (1 << result.mode)), 'Published result did not qualify both controllers');
        row.result = result; row.stage = 'captured'; row.capturedAt = new Date().toISOString();
        row.qualifiedMasks = identities.map(i => i.qualified); await save(); break;
      }
      row.observedAt = new Date().toISOString();
      row.health = (await db.query('SELECT stage,detail,updated_at FROM agent_pool.health WHERE app=$1', [app.toLowerCase()])).rows[0];
      await save(); await wait();
    }
    assert.equal(row.stage, 'captured', 'Actual match/publication exceeded original trial deadline');
    // Capture and the controller's availability observation are asynchronous.
    while (Date.now() < deadline) {
      const h = (await db.query('SELECT stage FROM agent_pool.health WHERE app=$1', [app.toLowerCase()])).rows[0];
      if (h?.stage === 'available') break; await wait();
    }
  }
  report.passed = true;
} catch (e) {report.error = String((e as any)?.shortMessage ?? (e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi, '[omitted]').slice(0, 250); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); await save(); await metrics(); await db.end(); await t.close();
  console.log(JSON.stringify({report: out, passed: report.passed, matches: report.matches.length, error: report.error}));
}
