// Recover only the superseded rules-9 fixture after all 291 epoch-2 batches published.
// No game is active; older financial claims remain independently withdrawable.
// Historical scores, contracts and financial claims remain at their addresses.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {Pool} from 'pg';
import {createPublicClient, http, parseAbi, zeroHash} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';

assert.equal(process.env.PONG_RETIRE_RULES9, 'verified-idle-published-superseded-epoch2');
assert.equal(process.getuid?.(), 1000);
const app = '0x0f0438f757b20047de662d6b553f8d37e56348fb' as const;
const hub = '0x3Ef8327F69e09cf721772F345e2A887eA22cD595' as const;
const abi = parseAbi(['function operator() view returns(address)', 'function activeCount() view returns(uint256)',
  'function RULES_VERSION() view returns(uint256)', 'function closeEngine()', 'function releaseStake(address,bytes32)']);
const manifest = await readFile('/backup/SHA256SUMS', 'utf8');
assert.equal(createHash('sha256').update(manifest).digest('hex'), process.env.PONG_VERIFIED_BACKUP_MANIFEST);
for (const line of manifest.trim().split('\n')) {
  const [hash, name] = line.split('  '); assert(/^[a-z\d.-]+$/i.test(name));
  const digest = createHash('sha256');
  for await (const chunk of createReadStream('/backup/' + name)) digest.update(chunk);
  assert.equal(digest.digest('hex'), hash);
}
const fixture = new Pool({connectionString: process.env.PONG_RULES9_DATABASE_URL});
const t = await chainTools('retire-rules9-empty-20260920');
const report: any = {at: new Date().toISOString(), app, epoch: '2', backupManifest: process.env.PONG_VERIFIED_BACKUP_MANIFEST};
try {
  assert.equal((await fixture.query('SELECT current_database() AS db')).rows[0].db, 'pong_rules9_qualification');
  const config = await fetch('https://pongit.xyz/api/interlude/config', {signal: AbortSignal.timeout(10000)}).then(r => {assert(r.ok); return r.json();});
  assert.equal(config.app.toLowerCase(), '0x78d3341e3452d7ec1add9371de3008639eed8eb0');
  for (const method of ['closeEngine', 'releaseStake'] as const) {
    const status = (await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1', [`retire-rules9-empty-20260920:${method}-epoch2`])).rows[0]?.status;
    assert.notEqual(status, 'failed', 'A confirmed retirement revert requires review');
    if (status === 'pending') report[method] = (await t.write(`${method}-epoch2`, method === 'closeEngine' ? app : hub, abi, method,
      method === 'closeEngine' ? [] : [app, zeroHash])).transactionHash;
  }
  const block = await t.base.getBlock(); let d = await readHubDelegation(t.base, hub, app, block.number);
  assert.equal(d.epoch, 2n, 'Never retire another epoch');
  assert.equal(await t.base.readContract({address:app,abi,functionName:'RULES_VERSION'}),9n);
  if(d.status!==0)assert.equal(d.batchIndex,291n,'The reviewed final epoch-2 publication changed');
  else assert.equal((await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1', ['retire-rules9-empty-20260920:releaseStake-epoch2'])).rows[0]?.status,'confirmed','Require the exact confirmed release journal');
  assert.equal(await t.base.readContract({address: app, abi, functionName: 'activeCount', blockNumber: block.number}), 0n);
  assert.equal((await t.base.readContract({address: app, abi, functionName: 'operator'})).toLowerCase(), t.account.address.toLowerCase());
  assert.equal((await fixture.query("SELECT count(*)::int AS n FROM il_engine_jobs WHERE lower(app)=$1 AND status NOT IN ('observed','failed','obsolete')", [app])).rows[0].n, 0, 'Preserve uncertain operations');
  report.before = d.status;
  if (d.status === 1) {
    const node = createPublicClient({transport: http('https://il-0f0438f757b20047.fly.dev', {retryCount: 0, timeout: 10000})});
    const session: any = await node.request({method: 'interlude_session', params: []} as any);
    assert.equal(session.app.toLowerCase(), app); assert.equal(BigInt(session.epoch), 2n);assert.equal(BigInt(session.committedBatches),291n,'Pending publication must be reviewed');
    assert(Array.isArray(session.pendingDiffs) && session.pendingDiffs.length === 0, 'Unpublished state must be recovered');
    assert.equal(await node.readContract({address: app, abi, functionName: 'activeCount'}), 0n);
    const health = await fetch('https://il-0f0438f757b20047.fly.dev/health', {signal: AbortSignal.timeout(10000)}).then(r => r.json());
    assert(!health.halted && health.pendingDiffs === 0, 'Preserve an uncertain engine');
    assert.equal((await t.base.getBlock({blockNumber: block.number})).hash, block.hash);
    report.closeEngine = (await t.write('closeEngine-epoch2', app, abi, 'closeEngine')).transactionHash;
    d = await readHubDelegation(t.base, hub, app);
  }
  if (d.status === 2) {
    report.releaseAt = new Date(Number(d.stakeUnlockAt) * 1000).toISOString();
    if ((await t.base.getBlock()).timestamp >= d.stakeUnlockAt) {
      report.releaseStake = (await t.write('releaseStake-epoch2', hub, abi, 'releaseStake', [app, zeroHash])).transactionHash;
      d = await readHubDelegation(t.base, hub, app);
    }
  }
  assert(d.status === 0 || d.status === 2); report.after = d.status; report.historicalRightsPreserved = true;
} catch (error) {
  const e = error as {shortMessage?: string; message?: string};
  report.error = (e.shortMessage ?? e.message ?? 'Retirement unavailable').split('\n')[0].replace(/0x[\da-f]{64,}/gi, '[omitted]').slice(0, 220);
  process.exitCode = 1;
} finally {
  await writeFile(`/diagnostics/rules9-retirement-${Date.now()}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report)); await fixture.end(); await t.close();
}
