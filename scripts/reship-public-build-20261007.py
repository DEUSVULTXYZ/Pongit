"""Build exact new public origins/index bindings, preserving existing readers."""
import datetime, hashlib, json, os, pathlib, shutil, subprocess, sys

root = pathlib.Path('/opt/pongit/releases/reship-all-20261007')
action = sys.argv[1]; assert action in ['web', 'index']
def load(p): return json.loads(pathlib.Path(p).read_text())
r = load(root / 'agents/secrets/deployment.json'); h = load(root / 'human/secrets/manifest.json')
assert r['phase'] == 'deployed-closed' and h['status'] == 'sealed'
assert r['prefix'] == 'reusable-agents-20261007-1' and h['prefix'] == 'public-human-v3-20261007'
assert load(root / 'agents/evidence/public-import-1.json')['passed']
assert load(root / 'live/evidence/stage.json')['pool'] == r['common']['pool']
s = os.statvfs('/'); used = 100 * (s.f_blocks-s.f_bfree) / (s.f_blocks-s.f_bfree+s.f_bavail)
assert used < 80, ('Scoped cleanup required before image build', used)
report = root / ('build-' + action + '-1.json'); assert not report.exists()
if action == 'web':
    ctx = root / 'build-source'; tag = 'pongit:reship-web-abc551b-20261007'; memory = '1800m'
    shutil.copy2('/opt/pongit/releases/sync-public-214c95a/web-source/Dockerfile.web', ctx / 'Dockerfile.web')
    manifest = load(root / 'live/metadata/manifest.json')
    manifest.update(enabled=True, tournamentsEnabled=True)
    (ctx / 'deployments/agent-pool.json').write_text(json.dumps(manifest, indent=2))
    for source, name in [(root / 'live/metadata/publication-review.json', 'agent-pool-release-review.json'),
            (root / 'agents/evidence/agent-reusable-index.json', 'agent-reusable-index.json'),
            (root / 'human/secrets/manifest.json', 'independent.json')]:
        shutil.copy2(source, ctx / 'deployments' / name); (ctx / 'deployments' / name).chmod(0o644)
    dockerfile = 'Dockerfile.web'
    args = ['--target', 'web', '--build-arg', 'NEXT_PUBLIC_API_URL=https://pongit.xyz/api', '--build-arg', 'NEXT_PUBLIC_WS_URL=wss://pongit.xyz/ws',
        '--build-arg', 'NEXT_PUBLIC_RP_ID=pongit.xyz', '--build-arg', 'PONG_REQUIRE_AGENT_POOL_MANIFEST=true']
else:
    ctx = root / 'index-source'; assert not ctx.exists()
    shutil.copytree(root / 'build-source/indexer', ctx)
    index = load(root / 'agents/evidence/agent-reusable-index.json')
    entry = next(v for v in index['deployments'] if v['pool'].lower() == r['common']['pool'].lower())
    start = min(int(entry['startBlock']), int(h['startBlock']))
    text = (root / 'build-source/indexer/config.template.yaml').read_text().split('\nchains:')[0]
    text += '\nchains:\n  - id: 10143\n    start_block: ' + str(start) + '''
    rpc:
      url: "http://rpc-indexer:8545"
      for: sync
      initial_block_interval: 1999
      interval_ceiling: 1999
      polling_interval: 1500
      query_timeout_millis: 120000
    contracts:
      - name: AgentReusableFiveArchive
        address: "''' + entry['pool'] + '"\n        start_block: ' + entry['startBlock'] + '''
      - name: CurrentIndependentRatings
        address: "''' + h['ratings'] + '"\n        start_block: ' + h['startBlock'] + '\n'
    (ctx / 'config.yaml').write_text(text)
    (ctx / 'src/chaos-deployments.ts').write_text('export const chaosArchiveDeployments = ' + json.dumps({entry['pool'].lower(): {'apps': [a.lower() for a in entry['arenas']], 'rulesVersion': 16}}) + ' as const;\n')
    (ctx / 'src/independent-deployments.ts').write_text('export const independentArchiveDeployments = ' + json.dumps({h['ratings'].lower(): {'apps': [a['app'].lower() for a in h['arenas']], 'rulesVersion': 14}}) + ' as const;\n')
    # Exact existing image has the reviewed Envio pin and dependencies. Only the
    # new bindings/generated handlers are replaced, under a separate PG schema.
    (ctx / 'Dockerfile').write_text('FROM sha256:543ac4eb6b2d75c5e382cdb9c2b7007abab8014bd2338f96604e30fd6bc25905\nWORKDIR /app\nCOPY config.yaml schema.graphql tsconfig.json ./\nCOPY src ./src\nRUN npm run codegen && npm run typecheck\nCMD ["npm","run","start"]\n')
    tag = 'pongit:reship-index-abc551b-20261007'; dockerfile = 'Dockerfile'; memory = '900m'; args = []
for p in ctx.rglob('*'):
    if p.is_file(): p.chmod(0o644)
result = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'action': action, 'source': 'abc551b', 'tag': tag, 'passed': False, 'diskBefore': used}
report.write_text(json.dumps(result, indent=2)); log = root / ('build-' + action + '-1.log')
try:
    with log.open('w') as out:
        p = subprocess.run(['docker', 'build', '--memory', memory, '--cpu-quota', '150000', '-f', dockerfile, '-t', tag, *args, '.'], cwd=ctx, stdout=out, stderr=subprocess.STDOUT, timeout=900)
    assert p.returncode == 0, 'Build failed; original log retained'
    result['image'] = json.loads(subprocess.check_output(['docker', 'image', 'inspect', tag]))[0]['Id']; result['passed'] = True
finally:
    result['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat(); result['logSha256'] = hashlib.sha256(log.read_bytes()).hexdigest()
    report.write_text(json.dumps(result, indent=2)); print(json.dumps(result))
