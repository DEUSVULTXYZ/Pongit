import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, copyFile, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {agentIndexDeployments} from '../shared/agent-index-manifest';
const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const old = {chainId: 10143, rulesVersion: 15, pool: addr(1), startBlock: 100, arenas: [addr(2), addr(3), addr(4)]};
const next = {chainId: 10143, rulesVersion: 15, pool: addr(5), startBlock: '200', arenas: [addr(6), addr(7), addr(8), addr(9), addr(10)]};

test('index migration preserves old emitters, deployment boundaries and arena bindings', () => {
  const rows = agentIndexDeployments({version: 2, chainId: 10143, deployments: [old, next]}, 10143, 15);
  assert.deepEqual(rows.map(r => [r.pool, r.startBlock, r.arenas]), [
    [old.pool, '100', old.arenas], [next.pool, '200', next.arenas],
  ]);
  assert.deepEqual(agentIndexDeployments(old, 10143, 15), [rows[0]]);
});

test('synchronized migration keeps each historical rules version and never guesses an unknown decoder',()=>{
 const raw={version:2,chainId:10143,deployments:[old,{...next,rulesVersion:16}]};
 for(const rules of [15,16] as const)assert.deepEqual(agentIndexDeployments(raw,10143,rules).map(r=>r.rulesVersion),[15,16]);
 assert.throws(()=>agentIndexDeployments({...raw,deployments:[old,{...next,rulesVersion:17}]},10143,16));
});

test('index manifest rejects ambiguous historical references and incompatible chains or rules', () => {
  const wrap = (a: any, b: any) => ({version: 2, chainId: 10143, deployments: [a, b]});
  for (const bad of [wrap(old, {...next, pool: old.pool}), wrap(old, {...next, arenas: [...next.arenas, old.arenas[0]]}),
    wrap(old, {...next, pool: old.arenas[0]}), wrap(old, {...next, chainId: 1}), wrap(old, {...next, rulesVersion: 11}),
    wrap(old, {...next, startBlock: -1}), wrap(old, {...next, arenas: [...next.arenas, next.arenas[0]]}),
    {...wrap(old, next), version: 3}, {...wrap(old, next), deployments: []}])
    assert.throws(() => agentIndexDeployments(bad, 10143, 15));
});

test('archive capacity matches the reviewed 32-arena manifest without upgrading legacy rules', () => {
  const wide = {...next, arenas: Array.from({length: 32}, (_, i) => addr(i + 20))};
  assert.equal(agentIndexDeployments(wide, 10143, 15)[0].arenas.length, 32);
  assert.throws(() => agentIndexDeployments({...wide, arenas: [...wide.arenas, addr(80)]}, 10143, 15));
  assert.throws(() => agentIndexDeployments({...wide, rulesVersion: 11}, 10143, 11));
});

test('actual indexer configuration keeps predecessor and successor and packages the pinned runtime', async () => {
  const root = process.cwd(), temporary = await mkdtemp(join(tmpdir(), 'pong-agent-index-'));
  try {
    for (const directory of ['deployments', 'indexer/src', 'ops']) await mkdir(join(temporary, directory), {recursive: true});
    await copyFile(join(root, 'indexer/config.template.yaml'), join(temporary, 'indexer/config.template.yaml'));
    await copyFile(join(root, 'ops/pin-envio-rpc-concurrency.mjs'), join(temporary, 'ops/pin-envio-rpc-concurrency.mjs'));
    await writeFile(join(temporary, 'deployments/testnet.json'), JSON.stringify({version: 4, chainId: 10143,
      game: addr(100), market: addr(101), tournaments: addr(102), startBlock: 50}));
    await writeFile(join(temporary, 'deployments/agent-reusable-index.json'), JSON.stringify({
      version: 2, chainId: 10143, deployments: [old, {...next, rulesVersion:16, archiveContract:'AgentReusableFiveArchive'}],
    }));
    await writeFile(join(temporary,'deployments/independent-index.json'),JSON.stringify({deployments:[
      {chainId:10143,rulesVersion:14,ratings:addr(200),startBlock:90,arenas:[addr(201)]},
      {chainId:10143,rulesVersion:14,ratings:addr(202),startBlock:190,arenas:[addr(203)],archiveContract:'CurrentIndependentRatings'},
    ]}));
    const env: NodeJS.ProcessEnv = {...process.env, INDEXER_RPC_URL: 'http://127.0.0.1:8545'};
    delete env.INDEXER_HISTORY_START_BLOCK; delete env.DEPLOYMENT_FILE;
    execFileSync(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), join(root, 'scripts/configure-indexer.ts')],
      {cwd: temporary, env, stdio: 'pipe'});
    const config = await readFile(join(temporary, 'indexer/config.yaml'), 'utf8');
    for (const [pool, start] of [[old.pool, 100], [next.pool, 200]])
      assert(config.includes(`address: "${pool}"\n        start_block: ${start}`));
    // Names become object keys in Envio: a duplicate would silently replace
    // the old address and refuse resuming its existing database.
    const chainConfig=config.slice(config.indexOf('\nchains:'));
    for(const [name,address] of [['AgentSeriesArchive',old.pool],['AgentReusableFiveArchive',next.pool],
      ['IndependentRatings',addr(200)],['CurrentIndependentRatings',addr(202)]]){
      assert.equal(chainConfig.split(`- name: ${name}\n`).length-1,1);
      assert(chainConfig.includes(`- name: ${name}\n        address: "${address}"`));
    }
    const source = await readFile(join(temporary, 'indexer/src/chaos-deployments.ts'), 'utf8');
    const bindings = JSON.parse(source.slice(source.indexOf('=') + 1, source.lastIndexOf(' as const;')));
    assert.deepEqual(bindings[old.pool], {apps: old.arenas, rulesVersion: 15});
    assert.deepEqual(bindings[next.pool], {apps: next.arenas, rulesVersion: 16});
    assert.equal(await readFile(join(temporary, 'indexer/pin-envio-rpc-concurrency.mjs'), 'utf8'),
      await readFile(join(root, 'ops/pin-envio-rpc-concurrency.mjs'), 'utf8'));
  } finally {
    assert(resolve(temporary).startsWith(resolve(tmpdir())) && temporary.includes('pong-agent-index-'));
    await rm(temporary, {recursive: true, force: true});
  }
});
