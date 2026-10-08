"""Stage both public runtimes after exact imports. Does not start services."""
import copy, datetime, hashlib, json, os, pathlib, shutil, subprocess

os.umask(0o077)
root = pathlib.Path('/opt/pongit/releases/responsive-20261008')
target = root / 'live'
assert not target.exists()
def load(p): return json.loads(pathlib.Path(p).read_text())
def save(p, value, public=False):
    p.write_text(json.dumps(value, indent=2) + '\n'); p.chmod(0o644 if public else 0o600); os.chown(p, 1000, 1000)
def stopped(name):
    assert not json.loads(subprocess.check_output(['docker', 'inspect', '-f', '{{json .State}}', name]))['Running'], name

r = load(root / 'agents/secrets/deployment.json')
h = load(root / 'human/secrets/manifest.json')
assert r['prefix'] == 'reusable-agents-20261008-1' and r['phase'] == 'deployed-closed'
assert r['continuation']['pool'].lower() == '0x6b09eb398668cb38db5d3a7dd857c33a371ac308'
assert h['prefix'] == 'public-responsive-human-20261007' and h['status'] == 'sealed'
assert h['previous'][0]['lobby'].lower() == '0x71a49c00ba733724cb33d7590134d4ae96426156'
def latest(name):
    rows=[(p,load(p)) for p in (root/'agents/evidence').glob(name+'-[1-3].json')]
    rows=[r for r in rows if r[1].get('passed')];assert rows
    return max(rows,key=lambda r:r[1]['finishedAt'])
proof_path,proof=latest('verify-import')
assert proof['pool']==r['common']['pool'] and int(proof['identities'])>=8 and int(proof['tournaments'])>=43
assert load(root/'human/evidence/preservation-audit.json')['passed']
assert all(d['status']==1 for d in proof['sourceDelegations'])
build=load(root/'build-runtime-1.json');assert build['passed']
overrides=load(root/'evidence/runtime-source-overrides.json')
def remove_reviewed_mounts(service,name):
    keep=[]
    for v in service['volumes']:
        if v['target'].startswith('/app/') and v['target'].endswith('.ts'):
            expected=next(o for o in overrides if o['container']==name and o['target']==v['target'])
            assert expected['source']==v['source']
            assert hashlib.sha256(pathlib.Path(v['source']).read_bytes()).hexdigest()==expected['oldSha256']
            assert hashlib.sha256((root/'build-source'/v['target'][5:]).read_bytes()).hexdigest()==expected['candidateSha256']
        else:keep.append(v)
    service['volumes']=keep
for role in ['admission', 'maintenance', 'sponsor', 'engines', 'archive']: stopped('pongit-arcade-five-' + role + '-1')
stopped('pongit-relayer-1')
old = load('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json')
retained_sponsor = old['services']['sponsor']['environment']['PONG_AGENT_SPONSOR_ADDRESS']
assert retained_sponsor.lower() == '0x03cacefd5522f27ee20322aaa03e76745518fad1'
for role in ['admission','maintenance','archive','sponsor']:
    env=old['services'][role]['environment']
    address=env['PONG_AGENT_SPONSOR_ADDRESS' if role=='sponsor' else 'PONG_AGENT_ROLE_ADDRESS']
    assert r['serviceOperators'][role].lower()==address.lower(), 'Preserve the scoped signer'
    mount=next(v['source'] for v in old['services'][role]['volumes'] if v['target']=='/run/role.json')
    assert (root/'agents/secrets'/(role+'.json')).read_bytes()==pathlib.Path(mount).read_bytes()
oldhuman = load('/opt/pongit/releases/human-v3-20261005/human-runtime.json')
previous = load(root / 'source/agents.json')
assert previous['pool'].lower() == r['continuation']['pool'].lower()
target.mkdir(mode=0o700)
for name in ['metadata', 'state', 'diagnostics', 'keys', 'evidence']:
    p = target / name; p.mkdir(mode=0o700); os.chown(p, 1000, 1000)
review = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'scope': 'Authorized responsive rules 17/18 migration. Preserved public history, continuous delegation. Browser latency and 24h qualification remain unproved.',
    'sourcePool': previous['pool'], 'pool': r['common']['pool'], 'sourceLobby': h['previous'][0]['lobby'], 'lobby': h['lobby'],
    'importSha256': hashlib.sha256(proof_path.read_bytes()).hexdigest(),
    'sourceDelegations': 'left active without expiry',
    'qualification': {'capacity': False, 'hostedWorstPublication': False, 'latency': False, 'soak24h': False},
    'delegationPolicy': 'continuous-v3-no-automatic-close', 'maxBatches': 16000, 'matchReserveBatches': 8000}
save(target / 'metadata/publication-review.json', review, True)
evidence = '0x' + hashlib.sha256((target / 'metadata/publication-review.json').read_bytes()).hexdigest()
history = [{**{k: v for k, v in previous.items() if k != 'history'}, 'enabled': False, 'tournamentsEnabled': False}, *previous.get('history', [])]
m = {k: v for k, v in r['common'].items() if k != 'verifier'}
m.update(version=5, chainId=10143, engineChainId=4242, rulesVersion=17, friendlyPause='heartbeat-v1', housePolicy='progressive-v1', countdownClock='engine-ticks-v1',
    houseInstances='official-v1', arenaAdmissions='verified-epoch-v1', publicationProbe='epoch-marker-v1', challengeAdmission='atomic-v1', lanes={'tournament': 1, 'challenge': 4},
    arenas=[{**a, 'node': 'https://il2-eu-' + a['app'][2:18].lower() + '.fly.dev'} for a in r['arenas']], enabled=False, tournamentsEnabled=False,
    verifiedCapacity=0, qualificationEvidence=None, releaseStage='testnet-preview', previewEvidence=evidence, durationSeconds=300, overtimeSeconds=60, intervalSeconds=60, maxMatches=5, history=history)
save(target / 'metadata/manifest.json', m, True)
save(target / 'metadata/reusable.json', {k: v for k, v in r.items() if k not in ['engineKey', 'admissionKey', 'provisioningKey']})
save(target / 'metadata/reusable-budget.json', {'rulesVersion': 17, 'maxBatches': 16000, 'matchReserveBatches': 8000, 'rotationLeadSeconds': 420, 'serviceSeconds': 7200,
    'evidence': evidence, 'runtimeHashes': [a['runtimeHash'] for a in r['arenas']]})
for field, name in [('engineKey', 'engine'), ('admissionKey', 'bridge'), ('provisioningKey', 'provisioning')]: save(target / 'keys' / (name + '.json'), {'privateKey': r[field]})
for role in ['admission', 'maintenance', 'archive', 'sponsor']:
    path = target / 'keys' / (role + '.json')
    key_source = root / 'agents/secrets' / (role + '.json')
    shutil.copy2(key_source, path)
    path.chmod(0o600); os.chown(path, 1000, 1000)
save(target/'evidence/retained-roles.json',{'at':review['at'],'passed':True,'pool':r['common']['pool'],
    'addresses':r['serviceOperators'],'keyBytesPreserved':True,'nonceDatabasesPreserved':True,'transfers':[]},True)
def human_apps(v): return [a['app'] for a in v['arenas']] + [app for p in v.get('previous', []) for app in human_apps(p)]
legacy_protected = old['services']['reader']['environment'].get('PONG_HUMAN_APPS', '').split(',')
protected = ','.join(sorted(set(a.lower() for a in [*human_apps(h), *legacy_protected] if a)))
c = copy.deepcopy(old)
for role in ['reader', 'sponsor', 'admission', 'maintenance', 'archive', 'engines']:
    s = c['services'][role]; e = s['environment']; s['restart'] = 'unless-stopped'
    e.update(PONG_SOURCE_COMMIT=build['sourceCommit'], PONG_REUSABLE_AGENT_PREFIX=r['prefix'], PONG_AGENT_POOL_RELEASE_EVIDENCE=evidence, PONG_HUMAN_APPS=protected)
    if role in ['admission', 'maintenance', 'archive']: e['PONG_AGENT_ROLE_ADDRESS'] = r['serviceOperators'][role]
    if role == 'sponsor': e['PONG_AGENT_SPONSOR_ADDRESS'] = r['serviceOperators']['sponsor']
    for v in s['volumes']:
        dest = v['target']
        if dest in ['/metadata', '/state', '/diagnostics']: v['source'] = str(target / dest[1:])
        if dest == '/run/role.json': v['source'] = str(target / 'keys' / (role + '.json'))
        for path, name in [('engine', 'engine'), ('admission', 'bridge'), ('provisioning', 'provisioning')]:
            if dest == '/run/pongit-agent-pool/' + path + '.json': v['source'] = str(target / 'keys' / (name + '.json'))
    remove_reviewed_mounts(s,'pongit-arcade-five-'+role+'-1')
    s['image']=build['image']
    if role=='admission':e.pop('PONG_AGENT_TOURNAMENT_DRAIN',None)
    if role=='engines':e['PONG_AGENT_TICK_INTERVAL_MS']='50'
save(target / 'agent-compose.json', c)
save(target / 'previous-agent-compose.private.json', old)
ch = copy.deepcopy(oldhuman); sh = ch['services']['relayer']; eh = sh['environment']
eh.update(PONG_INDEPENDENT_ADMISSION='false', ROOMS_ADMISSION_ENABLED='false', PONG_INDEPENDENT_RELEASE_EVIDENCE=evidence)
h['production'] = True
h['qualificationEvidence'] = evidence
save(root / 'human/secrets/manifest.json', h)
for v in sh['volumes']:
    if v['target'] == '/run/pongit-human-v3': v['source'] = str(root / 'human/secrets')
sh['restart'] = 'unless-stopped'
remove_reviewed_mounts(sh,'pongit-relayer-1')
sh['image']=build['image']
eh['PONG_SOURCE_COMMIT']=build['sourceCommit']
save(target / 'human-runtime.json', ch)
save(target / 'previous-human-runtime.private.json', oldhuman)
source_human_mount=next(v['source'] for v in oldhuman['services']['relayer']['volumes'] if v['target']=='/run/pongit-human-v3')
shutil.copy2(pathlib.Path(source_human_mount)/'provisioner.json',root/'human/secrets/provisioner.json')
os.chown(root / 'human/secrets/provisioner.json', 1000, 1000)
save(root / 'human/secrets/publication-budget.json', {'rulesVersion': 18, 'maxBatches': 16000, 'matchReserveBatches': 8000, 'rotationLeadSeconds': 1860, 'serviceSeconds': 7200,
    'evidence': evidence, 'runtimeHashes': [a['runtimeHash'] for a in h['arenas']]})
shutil.copy2(target / 'metadata/publication-review.json', root / 'agents/metadata/publication-review.json')
save(target / 'evidence/stage.json', {'at': review['at'], 'pool': m['pool'], 'lobby': h['lobby'], 'arenas': {'agent': len(m['arenas']), 'human': len(h['arenas'])},
    'historicalAgentPools': [p['pool'] for p in history], 'evidence': evidence, 'deployed': False, 'gates': False}, True)
print(json.dumps({'staged': str(target), 'pool': m['pool'], 'lobby': h['lobby'], 'deployed': False, 'gates': False}))
